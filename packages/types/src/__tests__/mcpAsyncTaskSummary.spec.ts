import { describe, it, expect } from "vitest"
import { McpAsyncTaskSummarySchema, summarizeRecord } from "../mcpAsyncTaskSummary.js"
import type { McpAsyncTaskRecord } from "../mcpAsyncTask.js"

describe("McpAsyncTaskSummary", () => {
	it("schema accepts a minimal valid summary", () => {
		expect(() =>
			McpAsyncTaskSummarySchema.parse({
				id: "r1",
				serverName: "s",
				originalToolName: "deploy",
				taskId: "T",
			}),
		).not.toThrow()
	})

	it("summarizeRecord strips heavy fields like rawSummary", () => {
		const summary = summarizeRecord({
			id: "r1",
			serverName: "s",
			originalToolName: "deploy",
			taskId: "T",
			createdAt: 1,
			updatedAt: 2,
			rawSummary: "x".repeat(5000),
			lastStatus: "running",
			lastCheckedAt: 10,
			terminalStatus: undefined,
			resultFetchedAt: undefined,
			executionId: "e",
			source: "global",
		} as unknown as McpAsyncTaskRecord)
		expect((summary as Record<string, unknown>).rawSummary).toBeUndefined()
		expect(summary.lastStatus).toBe("running")
		expect(summary.executionId).toBe("e")
	})
})
