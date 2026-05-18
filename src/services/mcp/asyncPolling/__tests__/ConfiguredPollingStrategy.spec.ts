// src/services/mcp/asyncPolling/__tests__/ConfiguredPollingStrategy.spec.ts
import { describe, it, expect, vi } from "vitest"
import { ConfiguredPollingStrategy } from "../ConfiguredPollingStrategy"
import type { PollingConfig, PollingDeps } from "../types"

const baseConfig: PollingConfig = {
	statusTool: "get_status",
	taskIdPath: "$.taskId",
	statusArgsTemplate: { taskId: "$taskId" },
	statusPath: "$.status",
	resultPath: "$.result",
	errorPath: "$.error",
	pendingValues: ["running"],
	completedValues: ["done"],
	failedValues: ["failed"],
	statusToolErrorMode: "transportUnknown",
	intervalMs: 1000,
	statusToolTimeoutMs: 60000,
	maxDurationMs: 600000,
}

function makeDeps(overrides: Partial<PollingDeps>): PollingDeps {
	return {
		callTool: vi.fn(),
		isToolDisabled: vi.fn().mockResolvedValue(false),
		sleep: vi.fn().mockResolvedValue(undefined),
		now: () => 0,
		...overrides,
	}
}

describe("ConfiguredPollingStrategy pre-taskId", () => {
	it("original call SDK error → tool error, no polling", async () => {
		const deps = makeDeps({
			callTool: vi.fn().mockRejectedValueOnce(new Error("ECONNREFUSED")),
		})
		const s = new ConfiguredPollingStrategy(baseConfig, deps)
		const out = await s.execute({
			serverName: "srv",
			toolName: "deploy",
			arguments: {},
			source: undefined,
			executionId: "e1",
			isCancelled: () => false,
		})
		expect(out.kind).toBe("transport_unknown")
		expect(out.result.isError).toBe(true)
		expect((out.result.content[0] as { text: string }).text).toMatch(/异步任务发起失败|未返回 taskId/)
		expect(deps.callTool).toHaveBeenCalledTimes(1) // never re-called
	})

	it("original tool returned isError: true → no polling", async () => {
		const deps = makeDeps({
			callTool: vi.fn().mockResolvedValueOnce({ isError: true, content: [{ type: "text", text: "boom" }] }),
		})
		const out = await new ConfiguredPollingStrategy(baseConfig, deps).execute({
			serverName: "srv",
			toolName: "deploy",
			arguments: {},
			source: undefined,
			executionId: "e1",
			isCancelled: () => false,
		})
		expect(out.kind).toBe("transport_unknown")
		expect(out.result.isError).toBe(true)
	})

	it("non-JSON first text content → config_error", async () => {
		const deps = makeDeps({
			callTool: vi.fn().mockResolvedValueOnce({ content: [{ type: "text", text: "OK build started" }] }),
		})
		const out = await new ConfiguredPollingStrategy(baseConfig, deps).execute({
			serverName: "srv",
			toolName: "deploy",
			arguments: {},
			source: undefined,
			executionId: "e1",
			isCancelled: () => false,
		})
		expect(out.kind).toBe("config_error")
	})

	it("taskIdPath returns undefined → config_error", async () => {
		const deps = makeDeps({
			callTool: vi.fn().mockResolvedValueOnce({ content: [{ type: "text", text: JSON.stringify({ id: "x" }) }] }),
		})
		const out = await new ConfiguredPollingStrategy(baseConfig, deps).execute({
			serverName: "srv",
			toolName: "deploy",
			arguments: {},
			source: undefined,
			executionId: "e1",
			isCancelled: () => false,
		})
		expect(out.kind).toBe("config_error")
	})

	it("statusTool disabled → config_error and original tool is NOT called", async () => {
		const deps = makeDeps({
			isToolDisabled: vi.fn().mockResolvedValue(true),
		})
		const out = await new ConfiguredPollingStrategy(baseConfig, deps).execute({
			serverName: "srv",
			toolName: "deploy",
			arguments: {},
			source: undefined,
			executionId: "e1",
			isCancelled: () => false,
		})
		expect(out.kind).toBe("config_error")
		expect(deps.callTool).not.toHaveBeenCalled()
	})

	it("cancellation BEFORE original call → transport_unknown without taskId", async () => {
		const deps = makeDeps()
		const out = await new ConfiguredPollingStrategy(baseConfig, deps).execute({
			serverName: "srv",
			toolName: "deploy",
			arguments: {},
			source: undefined,
			executionId: "e1",
			isCancelled: () => true,
		})
		expect(out.kind).toBe("transport_unknown")
		expect(deps.callTool).not.toHaveBeenCalled()
	})
})
