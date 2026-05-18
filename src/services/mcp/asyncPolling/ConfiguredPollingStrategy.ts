// src/services/mcp/asyncPolling/ConfiguredPollingStrategy.ts
import type { McpToolCallResponse } from "@roo-code/types"
import type { AsyncOutcome, ExecuteRequest, PollingConfig, PollingDeps } from "./types"
import { extractByJsonPath } from "./jsonPathLite"
import { buildBusinessFailed, buildConfigError, buildSuccess, buildTransportUnknown } from "./asyncResult"

export class ConfiguredPollingStrategy {
	constructor(
		private readonly config: PollingConfig,
		private readonly deps: PollingDeps,
	) {}

	async execute(req: ExecuteRequest): Promise<AsyncOutcome> {
		// Pre-flight: cancellation
		if (req.isCancelled()) {
			return {
				kind: "transport_unknown",
				result: buildTransportUnknown({ taskId: "(unknown)", reason: "user_cancelled" }),
			}
		}

		// Pre-flight: statusTool must not be hard-disabled
		if (await this.deps.isToolDisabled(req.serverName, this.config.statusTool, req.source)) {
			return {
				kind: "config_error",
				result: buildConfigError(
					`statusTool "${this.config.statusTool}" is in disabledTools on server "${req.serverName}"`,
				),
			}
		}

		// ---- Phase A: initial call, pre-taskId ----
		let initial: McpToolCallResponse
		try {
			initial = await this.deps.callTool(req.serverName, req.toolName, req.arguments, req.source)
		} catch (err) {
			return {
				kind: "transport_unknown",
				result: buildTransportUnknown({
					taskId: "(unknown)",
					reason: "connection_unavailable",
					detail: `异步任务发起失败或未返回 taskId: ${(err as Error).message}`,
				}),
			}
		}

		if (initial.isError) {
			return {
				kind: "transport_unknown",
				result: buildTransportUnknown({
					taskId: "(unknown)",
					reason: "connection_unavailable",
					detail: "initial tool returned isError; 异步任务发起失败或未返回 taskId",
				}),
			}
		}

		const firstText = firstTextContent(initial)
		if (firstText === undefined) {
			return { kind: "config_error", result: buildConfigError("initial response had no text content") }
		}

		let parsed: unknown
		try {
			parsed = JSON.parse(firstText)
		} catch {
			return { kind: "config_error", result: buildConfigError("initial response first text is not JSON") }
		}

		const rawTaskId = extractByJsonPath(parsed, this.config.taskIdPath)
		if (typeof rawTaskId !== "string" || rawTaskId.length === 0) {
			return {
				kind: "config_error",
				result: buildConfigError(`taskIdPath ${this.config.taskIdPath} did not yield a non-empty string`),
			}
		}

		// Task 8 plugs the polling loop in here.
		return this.pollUntilTerminal(rawTaskId, req)
	}

	// Stubbed in Task 7; implemented in Task 8.
	protected async pollUntilTerminal(taskId: string, req: ExecuteRequest): Promise<AsyncOutcome> {
		return {
			kind: "transport_unknown",
			result: buildTransportUnknown({ taskId, reason: "timed_out", detail: "polling loop not implemented" }),
		}
	}
}

function firstTextContent(resp: McpToolCallResponse): string | undefined {
	for (const c of resp.content ?? []) {
		if (c.type === "text") return c.text
	}
	return undefined
}
