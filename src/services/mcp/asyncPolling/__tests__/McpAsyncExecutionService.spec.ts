// src/services/mcp/asyncPolling/__tests__/McpAsyncExecutionService.spec.ts
import { describe, it, expect, vi } from "vitest"
import { McpAsyncExecutionService } from "../McpAsyncExecutionService"
import type { AsyncPollingToolConfig } from "@roo-code/types"

function makeDeps(
	overrides: Partial<{
		callTool: ReturnType<typeof vi.fn>
		isToolDisabled: ReturnType<typeof vi.fn>
		getAsyncPollingConfig: ReturnType<typeof vi.fn>
	}>,
) {
	return {
		callTool: vi.fn().mockResolvedValue({ content: [{ type: "text", text: "ok" }] }),
		isToolDisabled: vi.fn().mockResolvedValue(false),
		getAsyncPollingConfig: vi.fn().mockResolvedValue(undefined),
		...overrides,
	}
}

const validConfig: AsyncPollingToolConfig = {
	statusTool: "get_status",
	taskIdPath: "$.taskId",
	initialArgsTemplate: {},
	statusArgsTemplate: { taskId: "$taskId" },
	statusPath: "$.status",
	resultPath: "$.result",
	pendingValues: ["running"],
	completedValues: ["done"],
	failedValues: ["failed"],
	statusToolErrorMode: "transportUnknown",
	intervalMs: 1000,
	statusToolTimeoutMs: 60000,
	maxDurationMs: 600000,
}

describe("McpAsyncExecutionService", () => {
	it("without asyncPolling config → calls McpHub.callTool directly", async () => {
		const deps = makeDeps({})
		const svc = new McpAsyncExecutionService(deps)
		const res = await svc.execute({
			serverName: "srv",
			toolName: "echo",
			arguments: { a: 1 },
			source: undefined,
			executionId: "e1",
			isCancelled: () => false,
		})
		expect(res.content[0]).toEqual({ type: "text", text: "ok" })
		expect(deps.callTool).toHaveBeenCalledTimes(1)
		expect(deps.callTool).toHaveBeenCalledWith("srv", "echo", { a: 1 }, undefined)
	})

	it("with asyncPolling config → routes through polling strategy", async () => {
		const deps = makeDeps({
			getAsyncPollingConfig: vi.fn().mockResolvedValue(validConfig),
			callTool: vi
				.fn()
				.mockResolvedValueOnce({ content: [{ type: "text", text: JSON.stringify({ taskId: "T-1" }) }] })
				.mockResolvedValueOnce({
					content: [{ type: "text", text: JSON.stringify({ status: "done", result: 42 }) }],
				}),
		})
		const svc = new McpAsyncExecutionService(deps, {
			sleep: () => Promise.resolve(),
		})
		const res = await svc.execute({
			serverName: "srv",
			toolName: "deploy",
			arguments: {},
			source: undefined,
			executionId: "e1",
			isCancelled: () => false,
		})
		expect(res.isError).toBeUndefined()
		expect((res.content[0] as { text: string }).text).toContain("42")
	})

	it("per-server cap = 3: 4th concurrent on same server is rejected (config_error-shaped error)", async () => {
		const resolvers: (() => void)[] = []
		const deps = makeDeps({
			getAsyncPollingConfig: vi.fn().mockResolvedValue(validConfig),
			callTool: vi.fn().mockImplementation((serverName, toolName) => {
				if (toolName === "get_status") {
					return Promise.resolve({
						content: [{ type: "text", text: JSON.stringify({ status: "done", result: 1 }) }],
					})
				}
				return new Promise((resolve) => {
					resolvers.push(() =>
						resolve({ content: [{ type: "text", text: JSON.stringify({ taskId: "T" }) }] }),
					)
				})
			}),
		})
		const svc = new McpAsyncExecutionService(deps, { sleep: () => Promise.resolve() })

		const fire = () =>
			svc.execute({
				serverName: "srv",
				toolName: "deploy",
				arguments: {},
				source: undefined,
				executionId: "e",
				isCancelled: () => false,
			})

		const inflight = [fire(), fire(), fire()]
		const fourth = await fire()
		expect(fourth.isError).toBe(true)
		expect((fourth.content[0] as { text: string }).text).toMatch(/并发上限|concurrent/i)

		// Resolve all pending original calls so inflight promises can finish.
		resolvers.forEach((r) => r())
		await Promise.all(inflight)
	})

	it("global cap = 10: 11th concurrent across servers is rejected", async () => {
		const deps = makeDeps({
			getAsyncPollingConfig: vi.fn().mockResolvedValue(validConfig),
			callTool: vi.fn().mockImplementation(() => new Promise(() => {})), // never resolves
		})
		const svc = new McpAsyncExecutionService(deps, { sleep: () => Promise.resolve() })

		// 10 in flight across 4 different servers, max 3 per server
		const inflight: Promise<unknown>[] = []
		for (let i = 0; i < 10; i++) {
			inflight.push(
				svc.execute({
					serverName: `srv${i % 4}`,
					toolName: "deploy",
					arguments: {},
					source: undefined,
					executionId: "e",
					isCancelled: () => false,
				}),
			)
		}
		const overflow = await svc.execute({
			serverName: "srv-new",
			toolName: "deploy",
			arguments: {},
			source: undefined,
			executionId: "e",
			isCancelled: () => false,
		})
		expect(overflow.isError).toBe(true)
	})

	it("concurrency slot is released after success", async () => {
		const deps = makeDeps({
			getAsyncPollingConfig: vi.fn().mockResolvedValue(validConfig),
			callTool: vi
				.fn()
				.mockResolvedValueOnce({
					content: [{ type: "text", text: JSON.stringify({ taskId: "T" }) }],
				})
				.mockResolvedValueOnce({
					content: [{ type: "text", text: JSON.stringify({ status: "done", result: 1 }) }],
				}),
		})
		const svc = new McpAsyncExecutionService(deps, { sleep: () => Promise.resolve() })

		// Run 5 sequentially on the same server; would fail if slot leaked.
		for (let i = 0; i < 5; i++) {
			await svc.execute({
				serverName: "srv",
				toolName: "deploy",
				arguments: {},
				source: undefined,
				executionId: "e",
				isCancelled: () => false,
			})
		}
	})

	it("concurrency slot is released after strategy throws", async () => {
		const deps = makeDeps({
			getAsyncPollingConfig: vi.fn().mockResolvedValue(validConfig),
			callTool: vi.fn().mockRejectedValue(new Error("boom")),
		})
		const svc = new McpAsyncExecutionService(deps, { sleep: () => Promise.resolve() })

		for (let i = 0; i < 5; i++) {
			const r = await svc.execute({
				serverName: "srv",
				toolName: "deploy",
				arguments: {},
				source: undefined,
				executionId: "e",
				isCancelled: () => false,
			})
			expect(r.isError).toBe(true)
		}
	})
})

describe("McpAsyncExecutionService store forwarding", () => {
	it("forwards the injected store to the strategy", async () => {
		const create = vi.fn().mockResolvedValue({ id: "r1" })
		const update = vi.fn().mockResolvedValue({ id: "r1" })
		const complete = vi.fn().mockResolvedValue({ id: "r1", terminalStatus: "completed" })
		const callTool = vi
			.fn()
			.mockResolvedValueOnce({ content: [{ type: "text", text: JSON.stringify({ taskId: "T" }) }] })
			.mockResolvedValueOnce({
				content: [{ type: "text", text: JSON.stringify({ status: "done", result: 1 }) }],
			})

		const svc = new McpAsyncExecutionService(
			{
				callTool,
				isToolDisabled: vi.fn().mockResolvedValue(false),
				getAsyncPollingConfig: vi.fn().mockResolvedValue(validConfig),
			},
			{ sleep: () => Promise.resolve(), store: { create, update, complete } },
		)

		await svc.execute({
			serverName: "srv",
			toolName: "deploy",
			arguments: {},
			source: undefined,
			executionId: "e",
			isCancelled: () => false,
		})

		expect(create).toHaveBeenCalled()
		expect(complete).toHaveBeenCalledWith("r1", "completed")
	})
})
