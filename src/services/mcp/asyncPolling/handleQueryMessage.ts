import type { McpExecutionStatus, McpToolCallResponse, AsyncPollingToolConfig } from "@roo-code/types"
import { extractByJsonPath } from "./jsonPathLite"
import type { AsyncTaskStoreLike } from "./types"

export type HandleQueryDeps = {
	recordId: string
	store: AsyncTaskStoreLike & { list: () => Promise<any[]> }
	callTool: (
		serverName: string,
		toolName: string,
		args: Record<string, unknown> | undefined,
		source?: "global" | "project",
		options?: { timeoutMs?: number },
	) => Promise<McpToolCallResponse>
	postExecutionStatus: (s: McpExecutionStatus) => void
	asyncPollingConfig: AsyncPollingToolConfig
	now?: () => number
}

export async function handleQueryMcpAsyncTask(deps: HandleQueryDeps): Promise<void> {
	const now = deps.now ?? Date.now
	const records = await deps.store.list()
	const record = records.find((r) => r.id === deps.recordId)
	if (!record) return

	const cfg = deps.asyncPollingConfig
	const args = substituteTaskId(cfg.statusArgsTemplate, record.taskId)
	let resp: McpToolCallResponse
	try {
		resp = await deps.callTool(record.serverName, cfg.statusTool, args, record.source, {
			timeoutMs: cfg.statusToolTimeoutMs,
		})
	} catch (err) {
		deps.postExecutionStatus({
			executionId: record.executionId ?? record.id,
			status: "stopped_waiting",
			reason: "connection_unavailable",
			taskId: record.taskId,
			message: (err as Error).message,
		})
		return
	}

	const text = firstText(resp)
	let body: unknown
	try {
		body = text ? JSON.parse(text) : undefined
	} catch {
		body = undefined
	}
	const rawStatus = body ? (extractByJsonPath(body, cfg.statusPath) as string | undefined) : undefined

	if (rawStatus && cfg.pendingValues.includes(rawStatus)) {
		await deps.store.update(record.id, { lastStatus: rawStatus, rawSummary: text ?? undefined })
		deps.postExecutionStatus({
			executionId: record.executionId ?? record.id,
			status: "polling",
			taskId: record.taskId,
			lastStatus: rawStatus,
			lastCheckedAt: now(),
		})
		return
	}
	if (rawStatus && cfg.completedValues.includes(rawStatus)) {
		const result = cfg.resultPath ? extractByJsonPath(body, cfg.resultPath) : body
		await deps.store.update(record.id, { lastStatus: rawStatus, rawSummary: text ?? undefined })
		await deps.store.complete(record.id, "completed")
		deps.postExecutionStatus({
			executionId: record.executionId ?? record.id,
			status: "completed",
			response: typeof result === "string" ? result : JSON.stringify(result, null, 2),
		})
		return
	}
	if (rawStatus && cfg.failedValues.includes(rawStatus)) {
		await deps.store.update(record.id, { lastStatus: rawStatus, rawSummary: text ?? undefined })
		await deps.store.complete(record.id, "failed")
		deps.postExecutionStatus({
			executionId: record.executionId ?? record.id,
			status: "error",
			error: `远端任务失败: ${rawStatus}`,
		})
		return
	}
	deps.postExecutionStatus({
		executionId: record.executionId ?? record.id,
		status: "error",
		error: "异步轮询配置/响应不匹配",
	})
}

function substituteTaskId(template: Record<string, unknown>, taskId: string): Record<string, unknown> {
	const out: Record<string, unknown> = {}
	for (const [k, v] of Object.entries(template)) {
		out[k] = typeof v === "string" ? v.replaceAll("$taskId", taskId) : v
	}
	return out
}

function firstText(resp: McpToolCallResponse): string | undefined {
	for (const c of resp.content ?? []) {
		if (c.type === "text") return c.text
	}
	return undefined
}
