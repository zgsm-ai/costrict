// src/services/mcp/asyncPolling/asyncResult.ts
import type { McpToolCallResponse } from "@roo-code/types"

function asText(value: unknown): string {
	if (value === null || value === undefined) return value === null ? "null" : ""
	if (typeof value === "string") return value
	if (typeof value === "number" || typeof value === "boolean") return String(value)
	// object / array — pretty-print
	return JSON.stringify(value, null, 2)
}

export function buildSuccess(extractedResult: unknown): McpToolCallResponse {
	return {
		content: [{ type: "text", text: asText(extractedResult) }],
	}
}

export function buildBusinessFailed(opts: { extractedError?: string; rawResponse?: unknown }): McpToolCallResponse {
	const detail = opts.extractedError ?? asText(opts.rawResponse) ?? "unknown"
	return {
		isError: true,
		content: [{ type: "text", text: `远端任务失败: ${detail}` }],
	}
}

export function buildTransportUnknown(opts: {
	taskId: string
	reason: "user_cancelled" | "timed_out" | "connection_unavailable" | "status_tool_error"
	detail?: string
}): McpToolCallResponse {
	const reasonText = opts.detail ? `${opts.reason} (${opts.detail})` : opts.reason
	return {
		isError: true,
		content: [
			{
				type: "text",
				text: `本地已停止等待，远端任务状态未知。taskId=${opts.taskId} reason=${reasonText}`,
			},
		],
	}
}

export function buildConfigError(detail: string): McpToolCallResponse {
	return {
		isError: true,
		content: [{ type: "text", text: `异步轮询配置/响应不匹配: ${detail}` }],
	}
}
