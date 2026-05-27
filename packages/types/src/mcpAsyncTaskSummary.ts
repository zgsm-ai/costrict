import { z } from "zod"
import type { McpAsyncTaskRecord } from "./mcpAsyncTask.js"

export const McpAsyncTaskSummarySchema = z.object({
	id: z.string().min(1),
	executionId: z.string().optional(),
	serverName: z.string(),
	source: z.enum(["global", "project"]).optional(),
	originalToolName: z.string(),
	taskId: z.string(),
	lastStatus: z.string().optional(),
	lastCheckedAt: z.number().optional(),
	terminalStatus: z.enum(["completed", "failed", "unknown"]).optional(),
	resultFetchedAt: z.number().optional(),
})

export type McpAsyncTaskSummary = z.infer<typeof McpAsyncTaskSummarySchema>

export function summarizeRecord(record: McpAsyncTaskRecord): McpAsyncTaskSummary {
	return {
		id: record.id,
		executionId: record.executionId,
		serverName: record.serverName,
		source: record.source,
		originalToolName: record.originalToolName,
		taskId: record.taskId,
		lastStatus: record.lastStatus,
		lastCheckedAt: record.lastCheckedAt,
		terminalStatus: record.terminalStatus,
		resultFetchedAt: record.resultFetchedAt,
	}
}
