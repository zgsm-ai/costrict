// src/services/mcp/asyncPolling/__tests__/McpAsyncTaskStoreCleaner.spec.ts
import { describe, it, expect, vi } from "vitest"
import { McpAsyncTaskStoreCleaner } from "../McpAsyncTaskStoreCleaner"

const DAY = 24 * 60 * 60 * 1000

function rec(over: Partial<any>) {
	return {
		id: "x",
		serverName: "s",
		originalToolName: "t",
		taskId: "T",
		createdAt: 0,
		updatedAt: 0,
		...over,
	}
}

describe("McpAsyncTaskStoreCleaner", () => {
	it("deletes unfetched records older than 7 days", async () => {
		const list = vi
			.fn()
			.mockResolvedValue([rec({ id: "old", updatedAt: 0 }), rec({ id: "young", updatedAt: 100 * DAY - DAY })])
		const del = vi.fn()
		await new McpAsyncTaskStoreCleaner({ list, delete: del, now: () => 8 * DAY }).run()
		expect(del).toHaveBeenCalledWith("old")
		expect(del).not.toHaveBeenCalledWith("young")
	})

	it("deletes completed+fetched records older than 24h", async () => {
		const list = vi.fn().mockResolvedValue([
			rec({
				id: "stale",
				terminalStatus: "completed",
				resultFetchedAt: 0,
				updatedAt: 0,
			}),
			rec({
				id: "fresh",
				terminalStatus: "completed",
				resultFetchedAt: 23 * 60 * 60 * 1000,
				updatedAt: 23 * 60 * 60 * 1000,
			}),
		])
		const del = vi.fn()
		await new McpAsyncTaskStoreCleaner({ list, delete: del, now: () => DAY + 1000 }).run()
		expect(del).toHaveBeenCalledWith("stale")
		expect(del).not.toHaveBeenCalledWith("fresh")
	})

	it("caps at 100 per workspace, dropping oldest fetched+terminal first", async () => {
		const records = Array.from({ length: 110 }, (_, i) =>
			rec({
				id: `r${i}`,
				terminalStatus: i < 50 ? "completed" : undefined,
				resultFetchedAt: i < 50 ? i : undefined,
				updatedAt: i,
			}),
		)
		const del = vi.fn()
		await new McpAsyncTaskStoreCleaner({
			list: vi.fn().mockResolvedValue(records),
			delete: del,
			now: () => 1_000,
		}).run()
		expect(del).toHaveBeenCalledTimes(10)
		// 10 oldest fetched terminal records (r0..r9) should go first
		for (let i = 0; i < 10; i++) {
			expect(del).toHaveBeenCalledWith(`r${i}`)
		}
	})
})
