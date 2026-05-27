import { describe, it, expect, vi } from "vitest"
import { handleQueryMcpAsyncTask } from "../handleQueryMessage"

describe("handleQueryMcpAsyncTask", () => {
	it("does nothing when record not found", async () => {
		const post = vi.fn()
		const store = { list: vi.fn().mockResolvedValue([]) }
		await handleQueryMcpAsyncTask({
			recordId: "missing",
			store: store as any,
			callTool: vi.fn(),
			postExecutionStatus: post,
			asyncPollingConfig: {
				statusTool: "get_status",
				taskIdPath: "$.runId",
				initialArgsTemplate: {},
				statusArgsTemplate: { RunID: "$taskId" },
				statusPath: "$.status",
				resultPath: "$.output",
				pendingValues: ["processing"],
				completedValues: ["success"],
				failedValues: ["failed"],
				statusToolErrorMode: "transportUnknown",
				intervalMs: 5000,
				statusToolTimeoutMs: 60000,
				maxDurationMs: 600000,
			},
		})
		expect(post).not.toHaveBeenCalled()
	})

	it("calls statusTool once and posts execution status with completed", async () => {
		const post = vi.fn()
		const callTool = vi.fn().mockResolvedValue({
			content: [{ type: "text", text: JSON.stringify({ status: "success", output: "yay" }) }],
		})
		const store = {
			list: vi.fn().mockResolvedValue([
				{
					id: "r1",
					executionId: "e1",
					serverName: "srv",
					originalToolName: "deploy",
					taskId: "T-1",
					statusTool: "get_status",
				},
			]),
			update: vi.fn().mockResolvedValue(undefined),
			complete: vi.fn().mockResolvedValue(undefined),
		}
		await handleQueryMcpAsyncTask({
			recordId: "r1",
			store: store as any,
			callTool,
			postExecutionStatus: post,
			asyncPollingConfig: {
				statusTool: "get_status",
				taskIdPath: "$.runId",
				initialArgsTemplate: {},
				statusArgsTemplate: { RunID: "$taskId" },
				statusPath: "$.status",
				resultPath: "$.output",
				pendingValues: ["processing"],
				completedValues: ["success"],
				failedValues: ["failed"],
				statusToolErrorMode: "transportUnknown",
				intervalMs: 5000,
				statusToolTimeoutMs: 60000,
				maxDurationMs: 600000,
			},
		})
		expect(callTool).toHaveBeenCalledTimes(1)
		expect(callTool.mock.calls[0][1]).toBe("get_status")
		expect(callTool.mock.calls[0][2]).toEqual({ RunID: "T-1" })
		expect(post).toHaveBeenCalledWith(expect.objectContaining({ executionId: "e1", status: "completed" }))
		expect(store.complete).toHaveBeenCalledWith("r1", "completed")
	})

	it("posts a polling status when still pending and does NOT mark resultFetchedAt", async () => {
		const post = vi.fn()
		const callTool = vi.fn().mockResolvedValue({
			content: [{ type: "text", text: JSON.stringify({ status: "processing" }) }],
		})
		const store = {
			list: vi.fn().mockResolvedValue([
				{
					id: "r1",
					executionId: "e1",
					serverName: "srv",
					originalToolName: "deploy",
					taskId: "T-1",
				},
			]),
			update: vi.fn(),
			complete: vi.fn(),
		}
		await handleQueryMcpAsyncTask({
			recordId: "r1",
			store: store as any,
			callTool,
			postExecutionStatus: post,
			asyncPollingConfig: {
				statusTool: "get_status",
				taskIdPath: "$.runId",
				initialArgsTemplate: {},
				statusArgsTemplate: { taskId: "$taskId" },
				statusPath: "$.status",
				pendingValues: ["processing"],
				completedValues: ["success"],
				failedValues: ["failed"],
				statusToolErrorMode: "transportUnknown",
				intervalMs: 5000,
				statusToolTimeoutMs: 60000,
				maxDurationMs: 600000,
			},
		})
		expect(post).toHaveBeenCalledWith(expect.objectContaining({ status: "polling", lastStatus: "processing" }))
		expect(store.complete).not.toHaveBeenCalled()
	})
})
