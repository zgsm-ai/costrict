import { z } from "zod"

/**
 * Audit event categories for discriminating between different event types.
 */
export const auditEventCategorySchema = z.enum([
	"TOOL_EXECUTION",
	"COMMAND_EXECUTION",
	"USER_APPROVAL",
	"MCP_TOOL",
	"FILE_CHANGE",
	"AUTO_APPROVAL",
	"TASK_LIFECYCLE",
])

export type AuditEventCategory = z.infer<typeof auditEventCategorySchema>

/**
 * Approval decision types.
 */
export const approvalDecisionSchema = z.enum([
	"user_approved",
	"user_denied",
	"auto_approved",
	"auto_denied",
	"not_applicable",
])

export type ApprovalDecision = z.infer<typeof approvalDecisionSchema>

/**
 * Base fields shared by all audit events.
 */
const auditEventBaseSchema = z.object({
	eventId: z.string(),
	timestamp: z.number(),
	taskId: z.string(),
})

/**
 * Tool execution audit event.
 * Records when a tool is executed with its parameters and outcome.
 */
export const toolExecutionAuditEventSchema = auditEventBaseSchema.extend({
	category: z.literal("TOOL_EXECUTION"),
	toolName: z.string(),
	toolParams: z.record(z.unknown()),
	approvalDecision: approvalDecisionSchema,
	autoApprovalRule: z.string().optional(),
	approvalTimestamp: z.number().optional(),
	executionTimestamp: z.number().optional(),
	executionDurationMs: z.number().optional(),
	resultSummary: z.string(),
	success: z.boolean(),
	errorMessage: z.string().optional(),
	toolCallId: z.string().optional(),
	isProtected: z.boolean().optional(),
	isOutsideWorkspace: z.boolean().optional(),
})

export type ToolExecutionAuditEvent = z.infer<typeof toolExecutionAuditEventSchema>

/**
 * Command execution audit event.
 * Records when a shell command is executed with sanitized command and output info.
 */
export const commandExecutionAuditEventSchema = auditEventBaseSchema.extend({
	category: z.literal("COMMAND_EXECUTION"),
	command: z.string(),
	cwd: z.string(),
	approvalDecision: approvalDecisionSchema,
	autoApprovalRule: z.string().optional(),
	exitCode: z.number().optional(),
	signal: z.string().optional(),
	outputSizeBytes: z.number().optional(),
	outputTruncated: z.boolean().optional(),
	outputArtifactId: z.string().optional(),
	executionDurationMs: z.number().optional(),
	success: z.boolean(),
	errorMessage: z.string().optional(),
	toolCallId: z.string().optional(),
})

export type CommandExecutionAuditEvent = z.infer<typeof commandExecutionAuditEventSchema>

/**
 * User approval audit event.
 * Records when a user explicitly approves or denies an action.
 */
export const userApprovalAuditEventSchema = auditEventBaseSchema.extend({
	category: z.literal("USER_APPROVAL"),
	askType: z.string(),
	targetDescription: z.string(),
	decision: approvalDecisionSchema,
	userFeedback: z.string().optional(),
	hasFeedbackImages: z.boolean().optional(),
	responseTimeMs: z.number().optional(),
})

export type UserApprovalAuditEvent = z.infer<typeof userApprovalAuditEventSchema>

/**
 * MCP tool audit event.
 * Records when an MCP server tool is called with sanitized arguments.
 */
export const mcpToolAuditEventSchema = auditEventBaseSchema.extend({
	category: z.literal("MCP_TOOL"),
	mcpServerName: z.string(),
	mcpToolName: z.string(),
	arguments: z.record(z.unknown()),
	approvalDecision: approvalDecisionSchema,
	autoApprovalRule: z.string().optional(),
	resultSummary: z.string(),
	success: z.boolean(),
	errorMessage: z.string().optional(),
	toolCallId: z.string().optional(),
	isProtected: z.boolean().optional(),
})

export type McpToolAuditEvent = z.infer<typeof mcpToolAuditEventSchema>

/**
 * File change audit event.
 * Records when a file is created, modified, or deleted.
 */
export const fileChangeAuditEventSchema = auditEventBaseSchema.extend({
	category: z.literal("FILE_CHANGE"),
	filePath: z.string(),
	changeType: z.enum(["create", "modify", "delete"]),
	toolName: z.string(),
	approvalDecision: approvalDecisionSchema,
	diffStats: z
		.object({
			added: z.number(),
			removed: z.number(),
		})
		.optional(),
	language: z.string().optional(),
})

export type FileChangeAuditEvent = z.infer<typeof fileChangeAuditEventSchema>

/**
 * Auto-approval audit event.
 * Records when an action is auto-approved or auto-denied without user interaction.
 */
export const autoApprovalAuditEventSchema = auditEventBaseSchema.extend({
	category: z.literal("AUTO_APPROVAL"),
	askType: z.string(),
	targetDescription: z.string(),
	ruleCategory: z.string(),
	ruleMatched: z.string(),
	decision: approvalDecisionSchema,
	autoApproveTimeoutMs: z.number().optional(),
})

export type AutoApprovalAuditEvent = z.infer<typeof autoApprovalAuditEventSchema>

/**
 * Task lifecycle audit event.
 * Records when a task is created, completed, or aborted with summary statistics.
 */
export const taskLifecycleAuditEventSchema = auditEventBaseSchema.extend({
	category: z.literal("TASK_LIFECYCLE"),
	eventType: z.enum(["task_created", "task_completed", "task_aborted"]),
	durationMs: z.number().optional(),
	toolsExecuted: z.number(),
	commandsExecuted: z.number(),
	filesChanged: z.number(),
	userApprovalsGranted: z.number(),
	userApprovalsDenied: z.number(),
})

export type TaskLifecycleAuditEvent = z.infer<typeof taskLifecycleAuditEventSchema>

/**
 * Discriminated union of all audit event types.
 */
export const auditEventSchema = z.discriminatedUnion("category", [
	toolExecutionAuditEventSchema,
	commandExecutionAuditEventSchema,
	userApprovalAuditEventSchema,
	mcpToolAuditEventSchema,
	fileChangeAuditEventSchema,
	autoApprovalAuditEventSchema,
	taskLifecycleAuditEventSchema,
])

export type AuditEvent = z.infer<typeof auditEventSchema>

/**
 * Audit log file header written once at file start.
 */
export const auditLogHeaderSchema = z.object({
	version: z.literal(1),
	taskId: z.string(),
	createdAt: z.number(),
	workspace: z.string().optional(),
})

export type AuditLogHeader = z.infer<typeof auditLogHeaderSchema>
