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
		const mergedArgs = { ...this.config.initialArgsTemplate, ...req.arguments }
		let initial: McpToolCallResponse
		try {
			initial = await this.deps.callTool(req.serverName, req.toolName, mergedArgs, req.source)
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
		const record = await this.deps.store?.create({
			serverName: req.serverName,
			source: req.source,
			originalToolName: req.toolName,
			taskId: rawTaskId,
			statusTool: this.config.statusTool,
			executionId: req.executionId,
		})

		const outcome = await this.pollUntilTerminal(rawTaskId, req, record?.id)
		if (record?.id) {
			const terminal: "completed" | "failed" | "unknown" =
				outcome.kind === "success" ? "completed" : outcome.kind === "business_failed" ? "failed" : "unknown"
			await this.deps.store?.complete(record.id, terminal)
		}
		return outcome
	}

	protected async pollUntilTerminal(taskId: string, req: ExecuteRequest, recordId?: string): Promise<AsyncOutcome> {
		const now = this.deps.now ?? (() => Date.now())
		const sleep = this.deps.sleep ?? defaultSleep
		const interval = clamp(this.config.intervalMs, 1000, 60000)
		const deadline = now() + this.config.maxDurationMs

		let attempt = 0
		let lastStatus: string | undefined

		// Emit one polling status update so UI flips from "started" → "polling".
		req.onProgress?.({ executionId: req.executionId, status: "polling", taskId })

		while (true) {
			if (req.isCancelled()) {
				return {
					kind: "transport_unknown",
					result: buildTransportUnknown({ taskId, reason: "user_cancelled" }),
				}
			}
			if (now() >= deadline) {
				return {
					kind: "transport_unknown",
					result: buildTransportUnknown({ taskId, reason: "timed_out" }),
				}
			}

			try {
				await sleep(interval)
			} catch {
				return {
					kind: "transport_unknown",
					result: buildTransportUnknown({ taskId, reason: "user_cancelled" }),
				}
			}
			if (req.isCancelled()) {
				return {
					kind: "transport_unknown",
					result: buildTransportUnknown({ taskId, reason: "user_cancelled" }),
				}
			}

			attempt += 1
			const statusArgs = substituteTaskId(this.config.statusArgsTemplate, taskId)

			let resp: McpToolCallResponse
			try {
				resp = await this.deps.callTool(req.serverName, this.config.statusTool, statusArgs, req.source, {
					timeoutMs: this.config.statusToolTimeoutMs,
				})
			} catch (err) {
				return {
					kind: "transport_unknown",
					result: buildTransportUnknown({
						taskId,
						reason: "connection_unavailable",
						detail: (err as Error).message,
					}),
				}
			}
			if (req.isCancelled()) {
				return {
					kind: "transport_unknown",
					result: buildTransportUnknown({ taskId, reason: "user_cancelled" }),
				}
			}

			if (resp.isError) {
				if (this.config.statusToolErrorMode === "businessFailed") {
					const extracted = extractError(this.config.errorPath, parseJsonOrUndefined(firstTextContent(resp)))
					return {
						kind: "business_failed",
						result: buildBusinessFailed({ extractedError: extracted, rawResponse: firstTextContent(resp) }),
					}
				}
				return {
					kind: "transport_unknown",
					result: buildTransportUnknown({
						taskId,
						reason: "status_tool_error",
						detail: firstTextContent(resp),
					}),
				}
			}

			const text = firstTextContent(resp)
			if (text === undefined) {
				return { kind: "config_error", result: buildConfigError("statusTool response had no text content") }
			}
			let body: unknown
			try {
				body = JSON.parse(text)
			} catch {
				return { kind: "config_error", result: buildConfigError("statusTool first text is not JSON") }
			}
			const rawStatus = extractByJsonPath(body, this.config.statusPath)
			if (typeof rawStatus !== "string") {
				return {
					kind: "config_error",
					result: buildConfigError(`statusPath ${this.config.statusPath} did not yield a string`),
				}
			}
			lastStatus = rawStatus

			if (recordId) {
				await this.deps.store?.update(recordId, {
					lastStatus: rawStatus,
					rawSummary: text,
				})
			}

			req.onProgress?.({
				executionId: req.executionId,
				status: "polling",
				taskId,
				attempt,
				lastStatus,
				lastCheckedAt: now(),
			})

			if (this.config.pendingValues.includes(rawStatus)) {
				continue
			}
			if (this.config.completedValues.includes(rawStatus)) {
				const resultValue =
					this.config.resultPath !== undefined ? extractByJsonPath(body, this.config.resultPath) : body
				return { kind: "success", result: buildSuccess(resultValue) }
			}
			if (this.config.failedValues.includes(rawStatus)) {
				const extracted = extractError(this.config.errorPath, body)
				return {
					kind: "business_failed",
					result: buildBusinessFailed({ extractedError: extracted, rawResponse: body }),
				}
			}
			return {
				kind: "config_error",
				result: buildConfigError(`status "${rawStatus}" not in pendingValues/completedValues/failedValues`),
			}
		}
	}
}

function firstTextContent(resp: McpToolCallResponse): string | undefined {
	for (const c of resp.content ?? []) {
		if (c.type === "text") return c.text
	}
	return undefined
}

function clamp(n: number, lo: number, hi: number): number {
	return Math.min(hi, Math.max(lo, n))
}

function defaultSleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

function substituteTaskId(template: Record<string, unknown>, taskId: string): Record<string, unknown> {
	const out: Record<string, unknown> = {}
	for (const [k, v] of Object.entries(template)) {
		out[k] = typeof v === "string" ? v.replaceAll("$taskId", taskId) : v
	}
	return out
}

function parseJsonOrUndefined(text: string | undefined): unknown {
	if (text === undefined) return undefined
	try {
		return JSON.parse(text)
	} catch {
		return undefined
	}
}

function extractError(errorPath: string | string[] | undefined, body: unknown): string | undefined {
	if (!errorPath || body === undefined || body === null) return undefined
	const paths = Array.isArray(errorPath) ? errorPath : [errorPath]
	for (const p of paths) {
		const v = extractByJsonPath(body, p)
		if (typeof v === "string" && v.length > 0) return v
		if (v !== undefined && v !== null && v !== "") return JSON.stringify(v)
	}
	return undefined
}
