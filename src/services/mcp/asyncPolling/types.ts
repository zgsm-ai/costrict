// src/services/mcp/asyncPolling/types.ts
import type { McpToolCallResponse, AsyncPollingToolConfig, McpAsyncTaskRecord } from "@roo-code/types"

export type AsyncOutcomeKind = "success" | "business_failed" | "transport_unknown" | "config_error"

export type AsyncOutcome = {
	kind: AsyncOutcomeKind
	result: McpToolCallResponse
}

export type ExecuteRequest = {
	serverName: string
	toolName: string
	arguments: Record<string, unknown> | undefined
	source: "global" | "project" | undefined
	executionId: string
	isCancelled: () => boolean
	onProgress?: (status: import("@roo-code/types").McpExecutionStatus) => void
}

export type AsyncTaskStoreLike = {
	create: (input: {
		serverName: string
		source?: "global" | "project"
		originalToolName: string
		taskId: string
		statusTool?: string
		executionId?: string
	}) => Promise<McpAsyncTaskRecord>
	update: (
		id: string,
		patch: { lastStatus?: string; lastMessage?: string; rawSummary?: string },
	) => Promise<McpAsyncTaskRecord>
	complete: (id: string, terminal: "completed" | "failed" | "unknown") => Promise<McpAsyncTaskRecord>
}

export type PollingDeps = {
	callTool: (
		serverName: string,
		toolName: string,
		args: Record<string, unknown> | undefined,
		source: "global" | "project" | undefined,
		options?: { timeoutMs?: number; signal?: AbortSignal },
	) => Promise<McpToolCallResponse>
	isToolDisabled: (serverName: string, toolName: string, source?: "global" | "project") => Promise<boolean>
	/** Test-only: replace setTimeout-based sleep. */
	sleep?: (ms: number, signal?: AbortSignal) => Promise<void>
	/** Test-only: replace Date.now-based wall clock. */
	now?: () => number
	store?: AsyncTaskStoreLike
}

export type PollingConfig = AsyncPollingToolConfig
