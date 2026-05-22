import { describe, it, expect } from "vitest"
import { AsyncPollingToolConfigSchema, AsyncPollingConfigSchema, mcpExecutionStatusSchema } from "../mcp.js"

describe("AsyncPollingToolConfigSchema", () => {
	it("accepts a minimal valid config and applies defaults", () => {
		const parsed = AsyncPollingToolConfigSchema.parse({
			statusTool: "get_status",
			taskIdPath: "$.taskId",
			statusPath: "$.status",
			pendingValues: ["running"],
			completedValues: ["done"],
		})
		expect(parsed.statusArgsTemplate).toEqual({ taskId: "$taskId" })
		expect(parsed.failedValues).toEqual(["failed", "error"])
		expect(parsed.statusToolErrorMode).toBe("transportUnknown")
		expect(parsed.intervalMs).toBe(5000)
		expect(parsed.statusToolTimeoutMs).toBe(60000)
		expect(parsed.maxDurationMs).toBe(10 * 60 * 1000)
	})

	it("rejects empty statusTool", () => {
		expect(() =>
			AsyncPollingToolConfigSchema.parse({
				statusTool: "",
				taskIdPath: "$.taskId",
				statusPath: "$.status",
				pendingValues: ["x"],
				completedValues: ["y"],
			}),
		).toThrow()
	})

	it("clamps intervalMs by min/max bounds", () => {
		expect(() =>
			AsyncPollingToolConfigSchema.parse({
				statusTool: "s",
				taskIdPath: "$.t",
				statusPath: "$.s",
				pendingValues: ["p"],
				completedValues: ["c"],
				intervalMs: 100,
			}),
		).toThrow()
	})

	it("accepts errorPath as string or array", () => {
		const a = AsyncPollingToolConfigSchema.parse({
			statusTool: "s",
			taskIdPath: "$.t",
			statusPath: "$.s",
			pendingValues: ["p"],
			completedValues: ["c"],
			errorPath: "$.error",
		})
		const b = AsyncPollingToolConfigSchema.parse({
			statusTool: "s",
			taskIdPath: "$.t",
			statusPath: "$.s",
			pendingValues: ["p"],
			completedValues: ["c"],
			errorPath: ["$.message", "$.msg"],
		})
		expect(a.errorPath).toBe("$.error")
		expect(b.errorPath).toEqual(["$.message", "$.msg"])
	})

	it("accepts initialArgsTemplate and defaults to {}", () => {
		const withExplicit = AsyncPollingToolConfigSchema.parse({
			statusTool: "s",
			taskIdPath: "$.t",
			statusPath: "$.s",
			pendingValues: ["p"],
			completedValues: ["c"],
			initialArgsTemplate: { API_KEY: "abc123", UserID: "u1" },
		})
		expect(withExplicit.initialArgsTemplate).toEqual({ API_KEY: "abc123", UserID: "u1" })

		const withOmitted = AsyncPollingToolConfigSchema.parse({
			statusTool: "s",
			taskIdPath: "$.t",
			statusPath: "$.s",
			pendingValues: ["p"],
			completedValues: ["c"],
		})
		expect(withOmitted.initialArgsTemplate).toEqual({})
	})
})

describe("AsyncPollingConfigSchema", () => {
	it("defaults tools to {}", () => {
		expect(AsyncPollingConfigSchema.parse({}).tools).toEqual({})
	})
})

describe("mcpExecutionStatusSchema new variants", () => {
	it("parses polling status", () => {
		const r = mcpExecutionStatusSchema.safeParse({
			executionId: "e1",
			status: "polling",
			taskId: "t1",
		})
		expect(r.success).toBe(true)
	})

	it("parses stopped_waiting status", () => {
		const r = mcpExecutionStatusSchema.safeParse({
			executionId: "e1",
			status: "stopped_waiting",
			reason: "user_cancelled",
			taskId: "t1",
		})
		expect(r.success).toBe(true)
	})
})
