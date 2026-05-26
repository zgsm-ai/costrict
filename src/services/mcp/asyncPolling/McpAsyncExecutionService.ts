// src/services/mcp/asyncPolling/McpAsyncExecutionService.ts
import type { AsyncPollingToolConfig, McpToolCallResponse } from "@roo-code/types"
import type { ExecuteRequest, PollingDeps, AsyncTaskStoreLike } from "./types"
import { ConfiguredPollingStrategy } from "./ConfiguredPollingStrategy"
import { buildConfigError } from "./asyncResult"

const PER_SERVER_LIMIT = 3
const GLOBAL_LIMIT = 10

export type McpAsyncDeps = {
	callTool: PollingDeps["callTool"]
	isToolDisabled: PollingDeps["isToolDisabled"]
	getAsyncPollingConfig: (
		serverName: string,
		toolName: string,
		source?: "global" | "project",
	) => Promise<AsyncPollingToolConfig | undefined>
}

export type McpAsyncOptions = {
	sleep?: PollingDeps["sleep"]
	now?: PollingDeps["now"]
	store?: AsyncTaskStoreLike
}

export class McpAsyncExecutionService {
	private perServer = new Map<string, number>()
	private globalCount = 0

	constructor(
		private readonly deps: McpAsyncDeps,
		private readonly options: McpAsyncOptions = {},
	) {}

	async execute(req: ExecuteRequest): Promise<McpToolCallResponse> {
		const config = await this.deps.getAsyncPollingConfig(req.serverName, req.toolName, req.source)
		if (!config) {
			return this.deps.callTool(req.serverName, req.toolName, req.arguments, req.source)
		}

		const key = concurrencyKey(req.serverName, req.source)
		if (!this.acquireSlot(key)) {
			return buildConfigError(
				`已达异步轮询并发上限 (per-server=${PER_SERVER_LIMIT}, global=${GLOBAL_LIMIT})。请稍后再试。`,
			)
		}

		try {
			const strategy = new ConfiguredPollingStrategy(config, {
				callTool: this.deps.callTool,
				isToolDisabled: this.deps.isToolDisabled,
				sleep: this.options.sleep,
				now: this.options.now,
				store: this.options.store,
			})
			const outcome = await strategy.execute(req)
			return outcome.result
		} catch (err) {
			// Defense-in-depth: strategy is expected to convert errors to outcomes.
			return {
				isError: true,
				content: [{ type: "text", text: `异步轮询内部错误: ${(err as Error).message}` }],
			}
		} finally {
			this.releaseSlot(key)
		}
	}

	private acquireSlot(key: string): boolean {
		const cur = this.perServer.get(key) ?? 0
		if (this.globalCount >= GLOBAL_LIMIT) return false
		if (cur >= PER_SERVER_LIMIT) return false
		this.perServer.set(key, cur + 1)
		this.globalCount += 1
		return true
	}

	private releaseSlot(key: string): void {
		const cur = this.perServer.get(key) ?? 0
		if (cur > 1) this.perServer.set(key, cur - 1)
		else this.perServer.delete(key)
		if (this.globalCount > 0) this.globalCount -= 1
	}
}

function concurrencyKey(serverName: string, source: "global" | "project" | undefined): string {
	return `${source ?? "global"}::${serverName}`
}
