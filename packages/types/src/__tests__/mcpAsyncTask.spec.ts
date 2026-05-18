// packages/types/src/__tests__/mcpAsyncTask.spec.ts
import { describe, it, expect } from "vitest"
import { McpAsyncTaskRecordSchema } from "../mcpAsyncTask.js"

describe("McpAsyncTaskRecordSchema", () => {
	it("accepts minimal valid record", () => {
		const r = McpAsyncTaskRecordSchema.parse({
			id: "rec_1",
			serverName: "ci",
			originalToolName: "deploy",
			taskId: "T-1",
			createdAt: 100,
			updatedAt: 100,
		})
		expect(r.id).toBe("rec_1")
	})

	it("accepts terminalStatus enum", () => {
		expect(() =>
			McpAsyncTaskRecordSchema.parse({
				id: "x",
				serverName: "s",
				originalToolName: "t",
				taskId: "T",
				createdAt: 1,
				updatedAt: 1,
				terminalStatus: "completed",
			}),
		).not.toThrow()
	})

	it("rejects bad terminalStatus value", () => {
		expect(() =>
			McpAsyncTaskRecordSchema.parse({
				id: "x",
				serverName: "s",
				originalToolName: "t",
				taskId: "T",
				createdAt: 1,
				updatedAt: 1,
				terminalStatus: "weird",
			}),
		).toThrow()
	})
})
