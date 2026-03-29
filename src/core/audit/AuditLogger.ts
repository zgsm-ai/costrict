import * as fs from "fs/promises"
import * as fsSync from "fs"
import * as path from "path"
import { randomUUID } from "crypto"
import {
	type AuditEvent,
	type AuditLogHeader,
	type ToolExecutionAuditEvent,
	type CommandExecutionAuditEvent,
	type UserApprovalAuditEvent,
	type McpToolAuditEvent,
	type FileChangeAuditEvent,
	type AutoApprovalAuditEvent,
	type TaskLifecycleAuditEvent,
	type ApprovalDecision,
	approvalDecisionSchema,
	auditEventSchema,
} from "@roo-code/types"
import { GlobalFileNames } from "../../shared/globalFileNames.js"
import { sanitizeCommand, sanitizeArguments } from "./sanitize.js"

const FLUSH_DEBOUNCE_MS = 2000

/** Valid taskId characters: alphanumeric, hyphen, underscore (UUID v7 format) */
const TASK_ID_PATTERN = /^[a-zA-Z0-9_-]+$/
const MAX_TASK_ID_LENGTH = 128

/**
 * Get the task directory path, creating it if needed.
 */
async function getTaskDirectoryPath(globalStoragePath: string, taskId: string): Promise<string> {
	if (!TASK_ID_PATTERN.test(taskId) || taskId.length > MAX_TASK_ID_LENGTH) {
		throw new Error(`[AuditLogger] Invalid taskId format: "${taskId}"`)
	}
	const taskDir = path.join(globalStoragePath, taskId)
	try {
		await fs.mkdir(taskDir, { recursive: true })
	} catch {
		// Directory may already exist
	}
	return taskDir
}

/**
 * Per-task audit logger that writes structured audit events to a JSONL file.
 * Events are buffered in memory and flushed to disk with a debounce to avoid
 * excessive I/O overhead on every tool call.
 *
 * Usage:
 * ```ts
 * const logger = await AuditLogger.create(taskId, globalStoragePath, workspacePath)
 * logger.record(logger.createToolExecutionEvent({ toolName: "read_file", ... }))
 * await logger.finalizeTaskCompletion()
 * logger.dispose()
 * ```
 */
export class AuditLogger {
	private events: AuditEvent[] = []
	private flushTimer: ReturnType<typeof setTimeout> | null = null
	private disposed = false
	private filePath: string | null = null

	// Lifecycle counters
	private toolsExecutedCount = 0
	private commandsExecutedCount = 0
	private filesChangedCount = 0
	private userApprovalsGranted = 0
	private userApprovalsDenied = 0
	private taskStartTime: number

	private constructor(
		private readonly taskId: string,
		private readonly globalStoragePath: string,
		private readonly workspace?: string,
	) {
		this.taskStartTime = Date.now()
	}

	/**
	 * Create and initialize a new AuditLogger instance.
	 */
	static async create(taskId: string, globalStoragePath: string, workspace?: string): Promise<AuditLogger> {
		const logger = new AuditLogger(taskId, globalStoragePath, workspace)
		await logger.initialize()
		return logger
	}

	private async initialize(): Promise<void> {
		try {
			const taskDir = await getTaskDirectoryPath(this.globalStoragePath, this.taskId)
			this.filePath = path.join(taskDir, GlobalFileNames.taskAudit)

			// Write header line
			const header: AuditLogHeader = {
				version: 1,
				taskId: this.taskId,
				createdAt: this.taskStartTime,
				workspace: this.workspace,
			}
			const headerLine = JSON.stringify(header) + "\n"
			await fs.appendFile(this.filePath, headerLine, "utf8")
		} catch (error) {
			console.error("[AuditLogger] Failed to initialize:", String(error))
		}
	}

	// ============ Event Factory Methods ============

	createToolExecutionEvent(params: {
		toolName: string
		toolParams: Record<string, unknown>
		approvalDecision: ApprovalDecision
		autoApprovalRule?: string
		approvalTimestamp?: number
		resultSummary: string
		success: boolean
		errorMessage?: string
		toolCallId?: string
		isProtected?: boolean
		isOutsideWorkspace?: boolean
		executionDurationMs?: number
	}): ToolExecutionAuditEvent {
		this.toolsExecutedCount++
		const event: ToolExecutionAuditEvent = {
			eventId: randomUUID(),
			timestamp: Date.now(),
			category: "TOOL_EXECUTION",
			taskId: this.taskId,
			toolName: params.toolName,
			toolParams: sanitizeArguments(params.toolParams),
			approvalDecision: params.approvalDecision,
			autoApprovalRule: params.autoApprovalRule,
			approvalTimestamp: params.approvalTimestamp,
			executionTimestamp: Date.now(),
			executionDurationMs: params.executionDurationMs,
			resultSummary: params.resultSummary,
			success: params.success,
			errorMessage: params.errorMessage,
			toolCallId: params.toolCallId,
			isProtected: params.isProtected,
			isOutsideWorkspace: params.isOutsideWorkspace,
		}
		return event
	}

	createCommandExecutionEvent(params: {
		command: string
		cwd: string
		approvalDecision: ApprovalDecision
		autoApprovalRule?: string
		exitCode?: number
		signal?: string
		outputSizeBytes?: number
		outputTruncated?: boolean
		outputArtifactId?: string
		executionDurationMs?: number
		success: boolean
		errorMessage?: string
		toolCallId?: string
	}): CommandExecutionAuditEvent {
		this.commandsExecutedCount++
		const event: CommandExecutionAuditEvent = {
			eventId: randomUUID(),
			timestamp: Date.now(),
			category: "COMMAND_EXECUTION",
			taskId: this.taskId,
			command: sanitizeCommand(params.command),
			cwd: params.cwd,
			approvalDecision: params.approvalDecision,
			autoApprovalRule: params.autoApprovalRule,
			exitCode: params.exitCode,
			signal: params.signal,
			outputSizeBytes: params.outputSizeBytes,
			outputTruncated: params.outputTruncated,
			outputArtifactId: params.outputArtifactId,
			executionDurationMs: params.executionDurationMs,
			success: params.success,
			errorMessage: params.errorMessage,
			toolCallId: params.toolCallId,
		}
		return event
	}

	createUserApprovalEvent(params: {
		askType: string
		targetDescription: string
		decision: ApprovalDecision
		userFeedback?: string
		hasFeedbackImages?: boolean
		responseTimeMs?: number
	}): UserApprovalAuditEvent {
		if (params.decision === "user_approved") this.userApprovalsGranted++
		if (params.decision === "user_denied") this.userApprovalsDenied++

		return {
			eventId: randomUUID(),
			timestamp: Date.now(),
			category: "USER_APPROVAL",
			taskId: this.taskId,
			askType: params.askType,
			targetDescription: params.targetDescription,
			decision: params.decision,
			userFeedback: params.userFeedback,
			hasFeedbackImages: params.hasFeedbackImages,
			responseTimeMs: params.responseTimeMs,
		}
	}

	createMcpToolEvent(params: {
		mcpServerName: string
		mcpToolName: string
		arguments: Record<string, unknown>
		approvalDecision: ApprovalDecision
		autoApprovalRule?: string
		resultSummary: string
		success: boolean
		errorMessage?: string
		toolCallId?: string
		isProtected?: boolean
	}): McpToolAuditEvent {
		return {
			eventId: randomUUID(),
			timestamp: Date.now(),
			category: "MCP_TOOL",
			taskId: this.taskId,
			mcpServerName: params.mcpServerName,
			mcpToolName: params.mcpToolName,
			arguments: sanitizeArguments(params.arguments),
			approvalDecision: params.approvalDecision,
			autoApprovalRule: params.autoApprovalRule,
			resultSummary: params.resultSummary,
			success: params.success,
			errorMessage: params.errorMessage,
			toolCallId: params.toolCallId,
			isProtected: params.isProtected,
		}
	}

	createFileChangeEvent(params: {
		filePath: string
		changeType: "create" | "modify" | "delete"
		toolName: string
		approvalDecision: ApprovalDecision
		diffStats?: { added: number; removed: number }
		language?: string
	}): FileChangeAuditEvent {
		this.filesChangedCount++
		return {
			eventId: randomUUID(),
			timestamp: Date.now(),
			category: "FILE_CHANGE",
			taskId: this.taskId,
			filePath: params.filePath,
			changeType: params.changeType,
			toolName: params.toolName,
			approvalDecision: params.approvalDecision,
			diffStats: params.diffStats,
			language: params.language,
		}
	}

	createAutoApprovalEvent(params: {
		askType: string
		targetDescription: string
		ruleCategory: string
		ruleMatched: string
		decision: ApprovalDecision
		autoApproveTimeoutMs?: number
	}): AutoApprovalAuditEvent {
		return {
			eventId: randomUUID(),
			timestamp: Date.now(),
			category: "AUTO_APPROVAL",
			taskId: this.taskId,
			askType: params.askType,
			targetDescription: params.targetDescription,
			ruleCategory: params.ruleCategory,
			ruleMatched: params.ruleMatched,
			decision: params.decision,
			autoApproveTimeoutMs: params.autoApproveTimeoutMs,
		}
	}

	// ============ Recording ============

	/**
	 * Record an audit event. The event is buffered in memory and flushed
	 * to disk after a debounce period (2 seconds).
	 */
	record(event: AuditEvent): void {
		if (this.disposed) return
		// Validate the event shape
		const parsed = auditEventSchema.safeParse(event)
		if (!parsed.success) {
			console.error("[AuditLogger] Invalid audit event:", parsed.error)
			return
		}
		this.events.push(parsed.data)
		this.scheduleFlush()
	}

	private scheduleFlush(): void {
		if (this.disposed || !this.filePath) return
		if (this.flushTimer) clearTimeout(this.flushTimer)
		this.flushTimer = setTimeout(() => this.flush(), FLUSH_DEBOUNCE_MS)
	}

	/**
	 * Flush buffered events to disk immediately.
	 */
	async flush(): Promise<void> {
		if (this.events.length === 0 || !this.filePath) return
		const eventsToFlush = this.events.slice()
		this.events = []

		try {
			const lines = eventsToFlush.map((e) => JSON.stringify(e)).join("\n") + "\n"
			await fs.appendFile(this.filePath, lines, "utf8")
		} catch (error) {
			console.error("[AuditLogger] Failed to flush events:", error)
			// Re-queue events on failure
			this.events = [...eventsToFlush, ...this.events]
		}
	}

	// ============ Lifecycle ============

	/**
	 * Record task completion with summary statistics and flush.
	 */
	async finalizeTaskCompletion(): Promise<void> {
		if (this.disposed) return
		const lifecycleEvent: TaskLifecycleAuditEvent = {
			eventId: randomUUID(),
			timestamp: Date.now(),
			category: "TASK_LIFECYCLE",
			taskId: this.taskId,
			eventType: "task_completed",
			durationMs: Date.now() - this.taskStartTime,
			toolsExecuted: this.toolsExecutedCount,
			commandsExecuted: this.commandsExecutedCount,
			filesChanged: this.filesChangedCount,
			userApprovalsGranted: this.userApprovalsGranted,
			userApprovalsDenied: this.userApprovalsDenied,
		}
		this.record(lifecycleEvent)
		await this.flush()
	}

	/**
	 * Record task abort with summary statistics and flush.
	 */
	async finalizeTaskAbort(): Promise<void> {
		if (this.disposed) return
		const lifecycleEvent: TaskLifecycleAuditEvent = {
			eventId: randomUUID(),
			timestamp: Date.now(),
			category: "TASK_LIFECYCLE",
			taskId: this.taskId,
			eventType: "task_aborted",
			durationMs: Date.now() - this.taskStartTime,
			toolsExecuted: this.toolsExecutedCount,
			commandsExecuted: this.commandsExecutedCount,
			filesChanged: this.filesChangedCount,
			userApprovalsGranted: this.userApprovalsGranted,
			userApprovalsDenied: this.userApprovalsDenied,
		}
		this.record(lifecycleEvent)
		await this.flush()
	}

	/**
	 * Flush remaining events and clean up resources.
	 */
	dispose(): void {
		this.disposed = true
		if (this.flushTimer) {
			clearTimeout(this.flushTimer)
			this.flushTimer = null
		}
		// Best-effort final flush using sync write
		if (this.events.length > 0 && this.filePath) {
			const lines = this.events.map((e) => JSON.stringify(e)).join("\n") + "\n"
			try {
				fsSync.appendFileSync(this.filePath, lines, "utf8")
			} catch {
				// Best-effort
			}
		}
		this.events = []
	}
}
