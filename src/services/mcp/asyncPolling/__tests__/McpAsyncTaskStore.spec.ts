// src/services/mcp/asyncPolling/__tests__/McpAsyncTaskStore.spec.ts
import { describe, it, expect, vi, beforeEach } from "vitest"
import * as path from "path"
import { McpAsyncTaskStore } from "../McpAsyncTaskStore"

const tmpRoot = path.resolve(__dirname, "../../../../.tmp-mcp-tasks")

const memfs: Record<string, string> = {}

vi.mock("fs/promises", async () => {
	const mockFs = {
		readFile: vi.fn(async (p: string) => {
			if (memfs[p] === undefined) {
				const err: any = new Error("ENOENT")
				err.code = "ENOENT"
				throw err
			}
			return memfs[p]
		}),
		writeFile: vi.fn(async (p: string, data: string) => {
			memfs[p] = String(data)
		}),
		rename: vi.fn(async (a: string, b: string) => {
			memfs[b] = memfs[a]
			delete memfs[a]
		}),
		mkdir: vi.fn().mockResolvedValue(undefined),
		access: vi.fn().mockResolvedValue(undefined),
	}
	return {
		...mockFs,
		default: mockFs,
	}
})

vi.mock("../../../../utils/safeWriteJson", () => ({
	safeWriteJson: vi.fn(async (filePath: string, data: unknown) => {
		const fs = await import("fs/promises")
		await fs.default.writeFile(filePath, JSON.stringify(data, null, 2))
	}),
}))

describe("McpAsyncTaskStore", () => {
	let now = 1_000_000
	beforeEach(() => {
		now = 1_000_000
		for (const key of Object.keys(memfs)) {
			delete memfs[key]
		}
	})

	function makeStore(workspacePath?: string) {
		return new McpAsyncTaskStore({
			rootDir: tmpRoot,
			workspacePath,
			now: () => now++,
			genId: (() => {
				let n = 0
				return () => `rec_${++n}`
			})(),
		})
	}

	it("create() persists a record after taskId is known", async () => {
		const store = makeStore("/ws/a")
		const rec = await store.create({
			serverName: "srv",
			originalToolName: "deploy",
			taskId: "T-1",
			executionId: "e1",
		})
		expect(rec.id).toBe("rec_1")
		expect(rec.taskId).toBe("T-1")
		const all = await store.list()
		expect(all).toHaveLength(1)
		expect(all[0].workspacePath).toBe("/ws/a")
	})

	it("update() mutates lastStatus/lastCheckedAt/rawSummary and truncates rawSummary to 2KB", async () => {
		const store = makeStore("/ws/a")
		const rec = await store.create({
			serverName: "srv",
			originalToolName: "deploy",
			taskId: "T-1",
		})
		const big = "x".repeat(5_000)
		const updated = await store.update(rec.id, {
			lastStatus: "running",
			rawSummary: big,
		})
		expect(updated.lastStatus).toBe("running")
		expect(updated.lastCheckedAt).toBeGreaterThanOrEqual(1_000_000)
		expect(updated.rawSummary!.length).toBeLessThanOrEqual(2048)
	})

	it("complete() sets terminalStatus", async () => {
		const store = makeStore("/ws/a")
		const rec = await store.create({
			serverName: "srv",
			originalToolName: "deploy",
			taskId: "T-1",
		})
		const completed = await store.complete(rec.id, "completed")
		expect(completed.terminalStatus).toBe("completed")
	})

	it("workspace isolation: records in /ws/a are not returned for /ws/b", async () => {
		const a = makeStore("/ws/a")
		const b = makeStore("/ws/b")
		await a.create({ serverName: "s", originalToolName: "t", taskId: "T1" })
		await b.create({ serverName: "s", originalToolName: "t", taskId: "T2" })
		expect((await a.list()).map((r) => r.taskId)).toEqual(["T1"])
		expect((await b.list()).map((r) => r.taskId)).toEqual(["T2"])
	})

	it("no workspacePath falls back to a global file", async () => {
		const store = makeStore(undefined)
		const r = await store.create({ serverName: "s", originalToolName: "t", taskId: "TG" })
		expect(r.workspacePath).toBeUndefined()
		const all = await store.list()
		expect(all).toHaveLength(1)
	})

	it("uses safeWriteJson (atomic write helper)", async () => {
		const { safeWriteJson } = await import("../../../../utils/safeWriteJson")
		const store = makeStore("/ws/a")
		await store.create({ serverName: "s", originalToolName: "t", taskId: "X" })
		expect(safeWriteJson).toHaveBeenCalled()
	})

	it("survives a missing file on load (treats as empty)", async () => {
		const store = makeStore("/ws/never-written")
		const all = await store.list()
		expect(all).toEqual([])
	})

	it("rejects malformed JSON gracefully by treating store as empty", async () => {
		const fs = await import("fs/promises")
		const store = makeStore("/ws/corrupt")
		// pre-seed corrupt content
		await fs.default.writeFile(path.join(tmpRoot, "asyncTasks-" + hashFor("/ws/corrupt") + ".json"), "not json")
		const all = await store.list()
		expect(all).toEqual([])
	})
})

// Helper mirroring the implementation's path hashing for the corrupt-file test.
import { createHash } from "node:crypto"
function hashFor(ws: string): string {
	return createHash("sha1").update(ws).digest("hex").slice(0, 12)
}
