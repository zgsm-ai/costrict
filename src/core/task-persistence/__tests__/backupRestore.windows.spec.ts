// 针对 Windows 平台的回退逻辑测试：当系统 tar.exe 不可用时，
// 使用纯 JS `tar` 包兜底生成/解压 .tar.gz（避免 PowerShell Compress-Archive
// 只支持 .zip 导致备份失败的问题）。
// 运行：cd src && npx vitest run core/task-persistence/__tests__/backupRestore.windows.spec.ts

import * as fs from "fs/promises"
import * as os from "os"
import * as path from "path"
import { execFileSync } from "child_process"
import iconv from "iconv-lite"

import type { HistoryItem } from "@roo-code/types"

import { createTasksBackup, formatCommandError, restoreTasksBackup, type RestoreResult } from "../backupRestore"
import { GlobalFileNames } from "../../../shared/globalFileNames"

// ─────────────────────────── Module-level mocks ───────────────────────────
// 模拟一台没有 tar.exe 的 Windows 机器：child_process.execFile 对 `tar` 命令
// 一律失败（并携带 GBK 编码的 stderr），`xcopy` 允许成功以覆盖 restore 路径。
// 在模块加载时把 process.platform 置为 win32，使 backupRestore.ts 进入
// Windows 分支（isWindows 在模块顶层求值）。
vi.mock("child_process", async (importOriginal) => {
	const actual = await importOriginal<typeof import("child_process")>()
	const realFs = await import("fs/promises")

	Object.defineProperty(process, "platform", { value: "win32" })

	const execFileMock = vi.fn(
		(
			cmd: string,
			args: string[],
			_opts: unknown,
			cb: (err: Error | null, stdout?: Buffer, stderr?: Buffer) => void,
		) => {
			if (cmd === "tar") {
				const err = Object.assign(new Error(`Command failed: ${cmd} is not available`), {
					code: "ENOENT",
					stderr: iconv.encode("tar.exe 不是可用的命令", "gbk"),
					stdout: Buffer.alloc(0),
				})
				cb(err)
				return
			}
			if (cmd === "xcopy") {
				// Simulate `xcopy /E /I /Y` with a real recursive copy so that
				// restore actually produces files in the destination.
				const [src, dest] = args
				realFs.cp(src, dest, { recursive: true }).then(
					() => cb(null, Buffer.alloc(0), Buffer.alloc(0)),
					(err) => cb(err instanceof Error ? err : new Error(String(err)), Buffer.alloc(0), Buffer.alloc(0)),
				)
				return
			}
			const err = Object.assign(new Error(`Unexpected command: ${cmd}`), {
				stderr: Buffer.alloc(0),
				stdout: Buffer.alloc(0),
			})
			cb(err)
		},
	) as unknown as typeof actual.execFile

	return { ...actual, execFile: execFileMock }
})

// ─────────────────────────── Helpers ───────────────────────────

function makeHistoryItem(id: string, ts?: number): HistoryItem {
	return {
		id,
		number: 1,
		ts: ts ?? Date.now(),
		task: `Task ${id}`,
		tokensIn: 100,
		tokensOut: 50,
		totalCost: 0.001,
		workspace: "/test/workspace",
	}
}

async function createTaskDirectory(tasksDir: string, item: HistoryItem): Promise<void> {
	const taskDir = path.join(tasksDir, item.id)
	await fs.mkdir(taskDir, { recursive: true })
	await fs.writeFile(path.join(taskDir, GlobalFileNames.historyItem), JSON.stringify(item), "utf8")
	await fs.writeFile(path.join(taskDir, GlobalFileNames.apiConversationHistory), "[]", "utf8")
	await fs.writeFile(path.join(taskDir, GlobalFileNames.uiMessages), "[]", "utf8")
}

interface HistoryIndex {
	version: number
	updatedAt: number
	entries: HistoryItem[]
}

async function writeIndex(tasksDir: string, entries: HistoryItem[]): Promise<void> {
	const index: HistoryIndex = { version: 1, updatedAt: Date.now(), entries }
	await fs.writeFile(path.join(tasksDir, GlobalFileNames.historyIndex), JSON.stringify(index), "utf8")
}

// ─────────────────────────── Tests ───────────────────────────

describe("createTasksBackup (Windows without system tar)", () => {
	it("falls back to the pure-JS tar package and produces a valid .tar.gz", async () => {
		const basePath = await fs.mkdtemp(path.join(os.tmpdir(), "win-bk-src-"))
		const destDir = await fs.mkdtemp(path.join(os.tmpdir(), "win-bk-dst-"))
		try {
			const tasksDir = path.join(basePath, "tasks")
			const item = makeHistoryItem("win-task-001", 1_000_000)
			await createTaskDirectory(tasksDir, item)
			await writeIndex(tasksDir, [item])

			const destPath = path.join(destDir, "backup.tar.gz")
			await createTasksBackup(basePath, destPath)

			// Archive exists and is non-empty
			const stat = await fs.stat(destPath)
			expect(stat.size).toBeGreaterThan(0)

			// It is a real .tar.gz: the system tar can list its contents
			const stdout = execFileSync("tar", ["-tzf", destPath], { encoding: "utf8" }) as string
			expect(stdout).toContain("tasks/")
			expect(stdout).toContain("win-task-001/")
			expect(stdout).toContain(GlobalFileNames.historyItem)
		} finally {
			await fs.rm(basePath, { recursive: true, force: true }).catch(() => {})
			await fs.rm(destDir, { recursive: true, force: true }).catch(() => {})
		}
	})
})

describe("restoreTasksBackup (Windows without system tar)", () => {
	it("restores via the pure-JS tar fallback", async () => {
		const srcBase = await fs.mkdtemp(path.join(os.tmpdir(), "win-rs-src-"))
		const dstBase = await fs.mkdtemp(path.join(os.tmpdir(), "win-rs-dst-"))
		try {
			const tasksDir = path.join(srcBase, "tasks")
			const item = makeHistoryItem("win-task-002", 2_000_000)
			await createTaskDirectory(tasksDir, item)
			await writeIndex(tasksDir, [item])

			// createTasksBackup also takes the JS fallback on this platform
			const archivePath = path.join(srcBase, "backup.tar.gz")
			await createTasksBackup(srcBase, archivePath)

			const result: RestoreResult = await restoreTasksBackup(dstBase, archivePath)
			expect(result.imported).toBe(1)
			expect(result.skipped).toBe(0)
			expect(result.errors).toHaveLength(0)

			// Task directory was copied into the destination via xcopy
			const hiPath = path.join(dstBase, "tasks", "win-task-002", GlobalFileNames.historyItem)
			await expect(fs.readFile(hiPath, "utf8")).resolves.toContain("win-task-002")
		} finally {
			await fs.rm(srcBase, { recursive: true, force: true }).catch(() => {})
			await fs.rm(dstBase, { recursive: true, force: true }).catch(() => {})
		}
	})
})

describe("formatCommandError", () => {
	it("decodes GBK-encoded stderr from Windows commands", () => {
		const err = Object.assign(new Error("Command failed: powershell"), {
			stderr: iconv.encode("不支持的存档文件格式", "gbk"),
			stdout: Buffer.alloc(0),
		})
		expect(formatCommandError(err)).toContain("不支持的存档文件格式")
	})

	it("keeps UTF-8 stderr unchanged", () => {
		const err = Object.assign(new Error("Command failed: tar"), {
			stderr: Buffer.from("tar: unrecognized option"),
			stdout: Buffer.alloc(0),
		})
		expect(formatCommandError(err)).toContain("tar: unrecognized option")
	})

	it("falls back to the message when stderr is not a buffer", () => {
		expect(formatCommandError(new Error("plain error"))).toBe("plain error")
	})
})
