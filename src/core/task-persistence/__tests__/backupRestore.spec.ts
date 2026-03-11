// pnpm --filter roo-cline test core/task-persistence/__tests__/backupRestore.spec.ts

import * as fs from "fs/promises"
import * as path from "path"
import * as os from "os"
import { execFile } from "child_process"
import { promisify } from "util"

import type { HistoryItem } from "@roo-code/types"

import { createTasksBackup, restoreTasksBackup, type RestoreResult } from "../backupRestore"
import { GlobalFileNames } from "../../../shared/globalFileNames"

const execFileAsync = promisify(execFile)

// Mock safeWriteJson to use plain fs writes in tests (avoids proper-lockfile issues)
vi.mock("../../../utils/safeWriteJson", () => ({
	safeWriteJson: vi.fn().mockImplementation(async (filePath: string, data: unknown) => {
		await fs.mkdir(path.dirname(filePath), { recursive: true })
		await fs.writeFile(filePath, JSON.stringify(data, null, "	"), "utf8")
	}),
}))

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

async function readIndex(tasksDir: string): Promise<HistoryIndex | null> {
	try {
		const raw = await fs.readFile(path.join(tasksDir, GlobalFileNames.historyIndex), "utf8")
		return JSON.parse(raw)
	} catch {
		return null
	}
}

// ─────────────────────────── Tests ───────────────────────────

describe("createTasksBackup", () => {
	let basePath: string
	let destDir: string

	beforeEach(async () => {
		basePath = await fs.mkdtemp(path.join(os.tmpdir(), "backup-src-"))
		destDir = await fs.mkdtemp(path.join(os.tmpdir(), "backup-dst-"))

		const tasksDir = path.join(basePath, "tasks")
		const item = makeHistoryItem("task-001", 1_000_000)
		await createTaskDirectory(tasksDir, item)
		await writeIndex(tasksDir, [item])
	})

	afterEach(async () => {
		await fs.rm(basePath, { recursive: true, force: true }).catch(() => {})
		await fs.rm(destDir, { recursive: true, force: true }).catch(() => {})
	})

	it("produces a valid tar.gz archive", async () => {
		const destPath = path.join(destDir, "backup.tar.gz")
		await createTasksBackup(basePath, destPath)

		// Verify the archive exists
		const stat = await fs.stat(destPath)
		expect(stat.size).toBeGreaterThan(0)

		// Verify tar can list the archive contents without error
		await expect(execFileAsync("tar", ["-tzf", destPath])).resolves.toBeDefined()
	})

	it("archive contains the tasks directory", async () => {
		const destPath = path.join(destDir, "backup.tar.gz")
		await createTasksBackup(basePath, destPath)

		const { stdout } = await execFileAsync("tar", ["-tzf", destPath])
		expect(stdout).toContain("tasks/")
		expect(stdout).toContain("task-001/")
		expect(stdout).toContain(GlobalFileNames.historyItem)
	})

	it("throws when the tasks directory does not exist", async () => {
		const emptyBase = await fs.mkdtemp(path.join(os.tmpdir(), "backup-empty-"))
		try {
			await expect(createTasksBackup(emptyBase, path.join(destDir, "out.tar.gz"))).rejects.toThrow(
				"Tasks directory not found",
			)
		} finally {
			await fs.rm(emptyBase, { recursive: true, force: true }).catch(() => {})
		}
	})
})

describe("restoreTasksBackup", () => {
	let srcBase: string
	let dstBase: string
	let archivePath: string

	/** Set up a source storage with `count` tasks and return the item list. */
	async function prepareSrcBackup(items: HistoryItem[]): Promise<void> {
		const tasksDir = path.join(srcBase, "tasks")
		for (const item of items) {
			await createTaskDirectory(tasksDir, item)
		}
		await writeIndex(tasksDir, items)
		archivePath = path.join(srcBase, "backup.tar.gz")
		await createTasksBackup(srcBase, archivePath)
	}

	beforeEach(async () => {
		srcBase = await fs.mkdtemp(path.join(os.tmpdir(), "restore-src-"))
		dstBase = await fs.mkdtemp(path.join(os.tmpdir(), "restore-dst-"))
	})

	afterEach(async () => {
		await fs.rm(srcBase, { recursive: true, force: true }).catch(() => {})
		await fs.rm(dstBase, { recursive: true, force: true }).catch(() => {})
	})

	it("imports all tasks into an empty destination", async () => {
		const items = [makeHistoryItem("task-a", 1000), makeHistoryItem("task-b", 2000)]
		await prepareSrcBackup(items)

		const result: RestoreResult = await restoreTasksBackup(dstBase, archivePath)

		expect(result.imported).toBe(2)
		expect(result.skipped).toBe(0)
		expect(result.overwritten).toBe(0)
		expect(result.errors).toHaveLength(0)

		// Both task directories should exist
		const taskADir = path.join(dstBase, "tasks", "task-a")
		const taskBDir = path.join(dstBase, "tasks", "task-b")
		await expect(fs.access(taskADir)).resolves.toBeUndefined()
		await expect(fs.access(taskBDir)).resolves.toBeUndefined()

		// history_item.json should be present and readable
		const hiA = JSON.parse(await fs.readFile(path.join(taskADir, GlobalFileNames.historyItem), "utf8"))
		expect(hiA.id).toBe("task-a")
	})

	it("merged _index.json contains all imported entries", async () => {
		const items = [makeHistoryItem("task-c", 3000), makeHistoryItem("task-d", 4000)]
		await prepareSrcBackup(items)

		await restoreTasksBackup(dstBase, archivePath)

		const index = await readIndex(path.join(dstBase, "tasks"))
		expect(index).not.toBeNull()
		const ids = index!.entries.map((e) => e.id)
		expect(ids).toContain("task-c")
		expect(ids).toContain("task-d")
	})

	describe("conflict = 'skip' (default)", () => {
		it("skips tasks that already exist locally", async () => {
			const backupItem = makeHistoryItem("task-x", 1000)
			await prepareSrcBackup([backupItem])

			// Pre-populate destination with the same task (different content)
			const existingItem = { ...backupItem, task: "Original task - do not overwrite" }
			const dstTasksDir = path.join(dstBase, "tasks")
			await createTaskDirectory(dstTasksDir, existingItem)
			await writeIndex(dstTasksDir, [existingItem])

			const result = await restoreTasksBackup(dstBase, archivePath)

			expect(result.skipped).toBe(1)
			expect(result.imported).toBe(0)
			expect(result.overwritten).toBe(0)

			// Original content should be untouched
			const hi = JSON.parse(
				await fs.readFile(path.join(dstTasksDir, "task-x", GlobalFileNames.historyItem), "utf8"),
			)
			expect(hi.task).toBe("Original task - do not overwrite")
		})

		it("imports new tasks while skipping existing ones", async () => {
			const existingItem = makeHistoryItem("task-existing", 1000)
			const newItem = makeHistoryItem("task-new", 2000)
			await prepareSrcBackup([existingItem, newItem])

			// Pre-populate destination with only the existing task
			const dstTasksDir = path.join(dstBase, "tasks")
			await createTaskDirectory(dstTasksDir, existingItem)
			await writeIndex(dstTasksDir, [existingItem])

			const result = await restoreTasksBackup(dstBase, archivePath)

			expect(result.skipped).toBe(1)
			expect(result.imported).toBe(1)
			expect(result.overwritten).toBe(0)
		})
	})

	describe("conflict = 'overwrite'", () => {
		it("overwrites existing task directories", async () => {
			const backupItem = makeHistoryItem("task-ow", 5000)
			backupItem.task = "Backup version"
			await prepareSrcBackup([backupItem])

			// Pre-populate destination with an older version
			const oldItem = { ...backupItem, task: "Old version" }
			const dstTasksDir = path.join(dstBase, "tasks")
			await createTaskDirectory(dstTasksDir, oldItem)
			await writeIndex(dstTasksDir, [oldItem])

			const result = await restoreTasksBackup(dstBase, archivePath, { conflict: "overwrite" })

			expect(result.overwritten).toBe(1)
			expect(result.imported).toBe(0)
			expect(result.skipped).toBe(0)

			// Content should now be the backup version
			const hi = JSON.parse(
				await fs.readFile(path.join(dstTasksDir, "task-ow", GlobalFileNames.historyItem), "utf8"),
			)
			expect(hi.task).toBe("Backup version")
		})
	})

	it("_index.json deduplication: same taskId appears only once after merge", async () => {
		const item = makeHistoryItem("task-dup", 9000)
		await prepareSrcBackup([item])

		// Pre-populate destination with the same task
		const dstTasksDir = path.join(dstBase, "tasks")
		await createTaskDirectory(dstTasksDir, item)
		await writeIndex(dstTasksDir, [item])

		// skip mode: task already exists, so only the original entry remains
		await restoreTasksBackup(dstBase, archivePath, { conflict: "skip" })

		const index = await readIndex(dstTasksDir)
		const matching = index!.entries.filter((e) => e.id === "task-dup")
		expect(matching).toHaveLength(1)
	})

	it("_index.json preserves pre-existing local entries not in the backup", async () => {
		const backupItem = makeHistoryItem("task-backup-only", 1000)
		await prepareSrcBackup([backupItem])

		// Pre-populate destination with a task that is NOT in the backup
		const localOnlyItem = makeHistoryItem("task-local-only", 2000)
		const dstTasksDir = path.join(dstBase, "tasks")
		await createTaskDirectory(dstTasksDir, localOnlyItem)
		await writeIndex(dstTasksDir, [localOnlyItem])

		await restoreTasksBackup(dstBase, archivePath)

		const index = await readIndex(dstTasksDir)
		const ids = index!.entries.map((e) => e.id)
		expect(ids).toContain("task-local-only")
		expect(ids).toContain("task-backup-only")
	})

	it("throws when the archive does not contain a tasks/ directory", async () => {
		// Create an archive without a tasks/ directory
		const badBase = await fs.mkdtemp(path.join(os.tmpdir(), "bad-arc-"))
		const badArchive = path.join(badBase, "bad.tar.gz")
		try {
			// Create an archive of an empty directory
			await fs.writeFile(path.join(badBase, "dummy.txt"), "hello")
			await execFileAsync("tar", ["-czf", badArchive, "-C", badBase, "dummy.txt"])

			await expect(restoreTasksBackup(dstBase, badArchive)).rejects.toThrow(
				"Archive does not contain a 'tasks/' directory",
			)
		} finally {
			await fs.rm(badBase, { recursive: true, force: true }).catch(() => {})
		}
	})
})
