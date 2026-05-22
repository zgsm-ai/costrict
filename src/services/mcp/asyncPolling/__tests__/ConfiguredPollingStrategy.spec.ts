// src/services/mcp/asyncPolling/__tests__/ConfiguredPollingStrategy.spec.ts
import { describe, it, expect, vi } from "vitest"
import { ConfiguredPollingStrategy } from "../ConfiguredPollingStrategy"
import type { PollingConfig, PollingDeps } from "../types"
import type { McpExecutionStatus } from "@roo-code/types"

function jsonText(obj: unknown) {
	return { content: [{ type: "text" as const, text: JSON.stringify(obj) }] }
}

const baseConfig: PollingConfig = {
	statusTool: "get_status",
	taskIdPath: "$.taskId",
	initialArgsTemplate: {},
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
		const deps = makeDeps({})
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

describe("ConfiguredPollingStrategy post-taskId", () => {
	it("transitions running → done; returns success with extracted result", async () => {
		const callTool = vi
			.fn()
			.mockResolvedValueOnce(jsonText({ taskId: "T-1" })) // initial
			.mockResolvedValueOnce(jsonText({ status: "running" })) // poll #1
			.mockResolvedValueOnce(jsonText({ status: "done", result: { url: "x" } })) // poll #2

		const out = await new ConfiguredPollingStrategy(baseConfig, makeDeps({ callTool })).execute({
			serverName: "srv",
			toolName: "deploy",
			arguments: {},
			source: undefined,
			executionId: "e1",
			isCancelled: () => false,
		})

		expect(out.kind).toBe("success")
		expect((out.result.content[0] as { text: string }).text).toContain('"url": "x"')
		// Original tool called once; remaining 2 are statusTool
		expect(callTool.mock.calls[0][1]).toBe("deploy")
		expect(callTool.mock.calls[1][1]).toBe("get_status")
		expect(callTool.mock.calls[2][1]).toBe("get_status")
	})

	it("substitutes $taskId into statusArgsTemplate", async () => {
		const cfg: PollingConfig = {
			...baseConfig,
			statusArgsTemplate: { RunID: "$taskId", UserID: "321" },
		}
		const callTool = vi
			.fn()
			.mockResolvedValueOnce(jsonText({ taskId: "T-2" }))
			.mockResolvedValueOnce(jsonText({ status: "done" }))

		await new ConfiguredPollingStrategy(cfg, makeDeps({ callTool })).execute({
			serverName: "srv",
			toolName: "deploy",
			arguments: {},
			source: undefined,
			executionId: "e1",
			isCancelled: () => false,
		})

		expect(callTool.mock.calls[1][2]).toEqual({ RunID: "T-2", UserID: "321" })
	})

	it("statusTool returned isError with default mode → transport_unknown (includes taskId)", async () => {
		const callTool = vi
			.fn()
			.mockResolvedValueOnce(jsonText({ taskId: "T-3" }))
			.mockResolvedValueOnce({ isError: true, content: [{ type: "text", text: "rpc down" }] })

		const out = await new ConfiguredPollingStrategy(baseConfig, makeDeps({ callTool })).execute({
			serverName: "srv",
			toolName: "deploy",
			arguments: {},
			source: undefined,
			executionId: "e1",
			isCancelled: () => false,
		})

		expect(out.kind).toBe("transport_unknown")
		expect((out.result.content[0] as { text: string }).text).toContain("T-3")
	})

	it("statusTool returned isError with mode=businessFailed → business_failed", async () => {
		const cfg: PollingConfig = { ...baseConfig, statusToolErrorMode: "businessFailed" }
		const callTool = vi
			.fn()
			.mockResolvedValueOnce(jsonText({ taskId: "T-4" }))
			.mockResolvedValueOnce({ isError: true, content: [{ type: "text", text: "task crashed" }] })

		const out = await new ConfiguredPollingStrategy(cfg, makeDeps({ callTool })).execute({
			serverName: "srv",
			toolName: "deploy",
			arguments: {},
			source: undefined,
			executionId: "e1",
			isCancelled: () => false,
		})

		expect(out.kind).toBe("business_failed")
	})

	it("status hits failedValues → business_failed with errorPath extracted", async () => {
		const callTool = vi
			.fn()
			.mockResolvedValueOnce(jsonText({ taskId: "T-5" }))
			.mockResolvedValueOnce(jsonText({ status: "failed", error: "config invalid" }))

		const out = await new ConfiguredPollingStrategy(baseConfig, makeDeps({ callTool })).execute({
			serverName: "srv",
			toolName: "deploy",
			arguments: {},
			source: undefined,
			executionId: "e1",
			isCancelled: () => false,
		})

		expect(out.kind).toBe("business_failed")
		expect((out.result.content[0] as { text: string }).text).toContain("config invalid")
	})

	it("errorPath array takes first non-empty value", async () => {
		const cfg: PollingConfig = { ...baseConfig, errorPath: ["$.message", "$.msg"] }
		const callTool = vi
			.fn()
			.mockResolvedValueOnce(jsonText({ taskId: "T-6" }))
			.mockResolvedValueOnce(jsonText({ status: "failed", msg: "second one" }))

		const out = await new ConfiguredPollingStrategy(cfg, makeDeps({ callTool })).execute({
			serverName: "srv",
			toolName: "deploy",
			arguments: {},
			source: undefined,
			executionId: "e1",
			isCancelled: () => false,
		})

		expect((out.result.content[0] as { text: string }).text).toContain("second one")
	})

	it("status value outside all three sets → config_error", async () => {
		const callTool = vi
			.fn()
			.mockResolvedValueOnce(jsonText({ taskId: "T-7" }))
			.mockResolvedValueOnce(jsonText({ status: "weird" }))

		const out = await new ConfiguredPollingStrategy(baseConfig, makeDeps({ callTool })).execute({
			serverName: "srv",
			toolName: "deploy",
			arguments: {},
			source: undefined,
			executionId: "e1",
			isCancelled: () => false,
		})

		expect(out.kind).toBe("config_error")
	})

	it("user cancels mid-poll → transport_unknown reason=user_cancelled", async () => {
		let cancelled = false
		const callTool = vi
			.fn()
			.mockResolvedValueOnce(jsonText({ taskId: "T-8" }))
			.mockImplementationOnce(async () => {
				cancelled = true
				return jsonText({ status: "running" })
			})

		const out = await new ConfiguredPollingStrategy(baseConfig, makeDeps({ callTool })).execute({
			serverName: "srv",
			toolName: "deploy",
			arguments: {},
			source: undefined,
			executionId: "e1",
			isCancelled: () => cancelled,
		})

		expect(out.kind).toBe("transport_unknown")
		expect((out.result.content[0] as { text: string }).text).toMatch(/T-8.*user_cancelled/)
	})

	it("exceeds maxDurationMs → transport_unknown reason=timed_out", async () => {
		let t = 0
		const callTool = vi
			.fn()
			.mockResolvedValueOnce(jsonText({ taskId: "T-9" }))
			.mockResolvedValue(jsonText({ status: "running" }))

		const deps = makeDeps({
			callTool,
			now: () => {
				const cur = t
				t += 200_000 // jump 200s each call so 600_000 maxDurationMs trips fast
				return cur
			},
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
		expect((out.result.content[0] as { text: string }).text).toMatch(/T-9.*timed_out/)
	})

	it("emits onProgress with polling status containing taskId", async () => {
		const callTool = vi
			.fn()
			.mockResolvedValueOnce(jsonText({ taskId: "T-10" }))
			.mockResolvedValueOnce(jsonText({ status: "done" }))
		const onProgress = vi.fn<(s: McpExecutionStatus) => void>()

		await new ConfiguredPollingStrategy(baseConfig, makeDeps({ callTool })).execute({
			serverName: "srv",
			toolName: "deploy",
			arguments: {},
			source: undefined,
			executionId: "e1",
			isCancelled: () => false,
			onProgress,
		})

		const polling = onProgress.mock.calls.find((c) => c[0].status === "polling")
		expect(polling).toBeTruthy()
		expect((polling as any)[0].taskId).toBe("T-10")
	})

	it("when resultPath is omitted, returns the whole JSON", async () => {
		const cfg: PollingConfig = { ...baseConfig, resultPath: undefined }
		const callTool = vi
			.fn()
			.mockResolvedValueOnce(jsonText({ taskId: "T-11" }))
			.mockResolvedValueOnce(jsonText({ status: "done", payload: 1 }))

		const out = await new ConfiguredPollingStrategy(cfg, makeDeps({ callTool })).execute({
			serverName: "srv",
			toolName: "deploy",
			arguments: {},
			source: undefined,
			executionId: "e1",
			isCancelled: () => false,
		})

		expect(out.kind).toBe("success")
		const text = (out.result.content[0] as { text: string }).text
		expect(text).toContain('"payload": 1')
		expect(text).toContain('"status": "done"')
	})
	it("statusTool error detail contains raw text when isError", async () => {
		const callTool = vi
			.fn()
			.mockResolvedValueOnce(jsonText({ taskId: "T-3" }))
			.mockResolvedValueOnce({ isError: true, content: [{ type: "text", text: "rpc down" }] })

		const out = await new ConfiguredPollingStrategy(baseConfig, makeDeps({ callTool })).execute({
			serverName: "srv",
			toolName: "deploy",
			arguments: {},
			source: undefined,
			executionId: "e1",
			isCancelled: () => false,
		})

		expect(out.kind).toBe("transport_unknown")
		const text = (out.result.content[0] as { text: string }).text
		expect(text).toContain("T-3")
		expect(text).toContain("status_tool_error")
		expect(text).toContain("rpc down")
	})
})

describe("ConfiguredPollingStrategy initialArgsTemplate", () => {
	it("merges initialArgsTemplate with conversation args for initial call", async () => {
		const cfg: PollingConfig = {
			...baseConfig,
			initialArgsTemplate: { API_KEY: "secret123", UserID: "bot", AppKey: "ak1" },
		}
		const callTool = vi
			.fn()
			.mockResolvedValueOnce(jsonText({ taskId: "T-IA1" }))
			.mockResolvedValueOnce(jsonText({ status: "done" }))

		await new ConfiguredPollingStrategy(cfg, makeDeps({ callTool })).execute({
			serverName: "srv",
			toolName: "deploy",
			arguments: { region: "us-east" },
			source: undefined,
			executionId: "e1",
			isCancelled: () => false,
		})

		const initialCallArgs = callTool.mock.calls[0][2] as Record<string, unknown>
		expect(initialCallArgs).toEqual({
			API_KEY: "secret123",
			UserID: "bot",
			AppKey: "ak1",
			region: "us-east",
		})
	})

	it("conversation args override same-name keys from initialArgsTemplate", async () => {
		const cfg: PollingConfig = {
			...baseConfig,
			initialArgsTemplate: { API_KEY: "default_key", UserID: "bot" },
		}
		const callTool = vi
			.fn()
			.mockResolvedValueOnce(jsonText({ taskId: "T-IA2" }))
			.mockResolvedValueOnce(jsonText({ status: "done" }))

		await new ConfiguredPollingStrategy(cfg, makeDeps({ callTool })).execute({
			serverName: "srv",
			toolName: "deploy",
			arguments: { API_KEY: "override_key", region: "eu" },
			source: undefined,
			executionId: "e1",
			isCancelled: () => false,
		})

		const initialCallArgs = callTool.mock.calls[0][2] as Record<string, unknown>
		expect(initialCallArgs).toEqual({
			API_KEY: "override_key",
			UserID: "bot",
			region: "eu",
		})
	})

	it("statusTool call still receives args from statusArgsTemplate, NOT initialArgsTemplate", async () => {
		const cfg: PollingConfig = {
			...baseConfig,
			initialArgsTemplate: { API_KEY: "should-not-appear", UserID: "bot" },
			statusArgsTemplate: { RunID: "$taskId", UserID: "321" },
		}
		const callTool = vi
			.fn()
			.mockResolvedValueOnce(jsonText({ taskId: "T-IA3" }))
			.mockResolvedValueOnce(jsonText({ status: "done" }))

		await new ConfiguredPollingStrategy(cfg, makeDeps({ callTool })).execute({
			serverName: "srv",
			toolName: "deploy",
			arguments: { region: "us" },
			source: undefined,
			executionId: "e1",
			isCancelled: () => false,
		})

		const statusCallArgs = callTool.mock.calls[1][2] as Record<string, unknown>
		expect(statusCallArgs).toEqual({ RunID: "T-IA3", UserID: "321" })
	})

	it("when initialArgsTemplate is omitted (default {}), initial call uses only conversation args", async () => {
		const callTool = vi
			.fn()
			.mockResolvedValueOnce(jsonText({ taskId: "T-IA4" }))
			.mockResolvedValueOnce(jsonText({ status: "done" }))

		await new ConfiguredPollingStrategy(baseConfig, makeDeps({ callTool })).execute({
			serverName: "srv",
			toolName: "deploy",
			arguments: { region: "ap" },
			source: undefined,
			executionId: "e1",
			isCancelled: () => false,
		})

		const initialCallArgs = callTool.mock.calls[0][2] as Record<string, unknown>
		expect(initialCallArgs).toEqual({ region: "ap" })
	})
})

describe("ConfiguredPollingStrategy persistence", () => {
	function makeFakeStore() {
		const state: { records: any[] } = { records: [] }
		return {
			state,
			store: {
				create: vi.fn(async (input: any) => {
					const r = { id: `r${state.records.length + 1}`, ...input, createdAt: 0, updatedAt: 0 }
					state.records.push(r)
					return r
				}),
				update: vi.fn(async (id: string, patch: any) => {
					const r = state.records.find((x) => x.id === id)
					Object.assign(r, patch)
					return r
				}),
				complete: vi.fn(async (id: string, terminal: any) => {
					const r = state.records.find((x) => x.id === id)
					r.terminalStatus = terminal
					return r
				}),
			},
		}
	}

	it("does NOT call store.create when taskId extraction fails", async () => {
		const { store } = makeFakeStore()
		const deps = makeDeps({
			callTool: vi.fn().mockResolvedValueOnce({ content: [{ type: "text", text: "not json" }] }),
			store,
		} as any)
		await new ConfiguredPollingStrategy(baseConfig, deps).execute({
			serverName: "srv",
			toolName: "deploy",
			arguments: {},
			source: undefined,
			executionId: "e1",
			isCancelled: () => false,
		})
		expect(store.create).not.toHaveBeenCalled()
	})

	it("calls store.create once taskId is extracted, update on each poll, complete on success", async () => {
		const { store } = makeFakeStore()
		const callTool = vi
			.fn()
			.mockResolvedValueOnce(jsonText({ taskId: "T-1" }))
			.mockResolvedValueOnce(jsonText({ status: "running" }))
			.mockResolvedValueOnce(jsonText({ status: "done", result: 1 }))

		await new ConfiguredPollingStrategy(baseConfig, makeDeps({ callTool, store } as any)).execute({
			serverName: "srv",
			toolName: "deploy",
			arguments: {},
			source: undefined,
			executionId: "e1",
			isCancelled: () => false,
		})

		expect(store.create).toHaveBeenCalledTimes(1)
		expect(store.create.mock.calls[0][0].taskId).toBe("T-1")
		expect(store.update).toHaveBeenCalled()
		expect(store.complete).toHaveBeenCalledWith("r1", "completed")
	})

	it("calls store.complete with 'failed' on business_failed", async () => {
		const { store } = makeFakeStore()
		const callTool = vi
			.fn()
			.mockResolvedValueOnce(jsonText({ taskId: "T-2" }))
			.mockResolvedValueOnce(jsonText({ status: "failed", error: "x" }))
		await new ConfiguredPollingStrategy(baseConfig, makeDeps({ callTool, store } as any)).execute({
			serverName: "srv",
			toolName: "deploy",
			arguments: {},
			source: undefined,
			executionId: "e1",
			isCancelled: () => false,
		})
		expect(store.complete).toHaveBeenCalledWith("r1", "failed")
	})

	it("calls store.complete with 'unknown' on transport_unknown after taskId is known", async () => {
		const { store } = makeFakeStore()
		const callTool = vi
			.fn()
			.mockResolvedValueOnce(jsonText({ taskId: "T-3" }))
			.mockRejectedValueOnce(new Error("network"))
		await new ConfiguredPollingStrategy(baseConfig, makeDeps({ callTool, store } as any)).execute({
			serverName: "srv",
			toolName: "deploy",
			arguments: {},
			source: undefined,
			executionId: "e1",
			isCancelled: () => false,
		})
		expect(store.complete).toHaveBeenCalledWith("r1", "unknown")
	})
})
