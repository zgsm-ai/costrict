// packages/types/src/mcpAsyncTask.ts
import { z } from "zod"

export const McpAsyncTaskRecordSchema = z.object({
	id: z.string().min(1),
	workspacePath: z.string().optional(),
	executionId: z.string().optional(),
	serverName: z.string().min(1),
	source: z.enum(["global", "project"]).optional(),
	originalToolName: z.string().min(1),
	taskId: z.string().min(1),
	statusTool: z.string().optional(),
	createdAt: z.number(),
	updatedAt: z.number(),
	lastCheckedAt: z.number().optional(),
	lastStatus: z.string().optional(),
	lastMessage: z.string().optional(),
	rawSummary: z.string().optional(),
	resultFetchedAt: z.number().optional(),
	terminalStatus: z.enum(["completed", "failed", "unknown"]).optional(),
})

export type McpAsyncTaskRecord = z.infer<typeof McpAsyncTaskRecordSchema>
