import * as os from "os"

import { CostrictRawStoreClient } from "@roo-code/telemetry"
import type { RawStoreTaskConversationPayload, RawStoreTaskSummaryPayload } from "@roo-code/telemetry"
import { jwtDecode } from "jwt-decode"
import { v7 as uuidv7 } from "uuid"

import type { Task } from "../../task/Task"
import { Package } from "../../../shared/package"
import { getClientId } from "../../../utils/getClientId"
import { getWorkspaceGitInfo } from "../../../utils/git"
import { CostrictAuthService } from "../auth"
import { buildRawDiffPayload, truncateRawText } from "./rawPayloadUtils"
import { createRawTelemetryLogger } from "./rawTelemetryLogger"

interface TokenSnapshot {
	inputTokens: number
	outputTokens: number
	totalCost: number
}

interface TaskRequestContext {
	requestId: string
	startedAt: number
	requestContent?: string
	userInput?: string
	model?: string
	mode?: string
	promptMode?: string
	caller?: "chat" | "codereview"
	ttftMs?: number
	baseline: TokenSnapshot
	requestHeaders?: Record<string, string>
	errorCode?: string
	errorReason?: string
	diffEntries: Array<{ label: string; before: string; after: string }>
}

interface TaskSessionStats {
	startTime: number
	currentRequest?: TaskRequestContext
	lastSnapshot: TokenSnapshot
}

export class RawTaskReporter {
	private readonly sessions = new Map<string, TaskSessionStats>()
	private readonly logger = createRawTelemetryLogger("RawTaskReporter")

	constructor(private readonly client: CostrictRawStoreClient) {}

	public onRequestStarted(task: Task, requestContent: string): string {
		const session = this.getOrCreateSession(task)
		const snapshot = this.getTokenSnapshot(task)
		const requestId = task?.lastApiRequestHeaders?.["X-Request-ID"] || uuidv7()
		session.currentRequest = {
			requestId,
			startedAt: Date.now(),
			requestContent: truncateRawText(requestContent),
			userInput: truncateRawText(requestContent),
			model: task.api?.getModel().id,
			mode: this.getTaskMode(task),
			promptMode: this.getPromptMode(task),
			caller: this.getCaller(task),
			ttftMs: undefined,
			baseline: snapshot,
			diffEntries: [],
		}
		session.lastSnapshot = snapshot
		this.logger.debug(
			`request started task=${task.taskId} request=${requestId} mode=${session.currentRequest.mode ?? "unknown"} prompt=${session.currentRequest.promptMode ?? "unknown"} chars=${requestContent.length}`,
		)
		return requestId
	}

	public onFirstToken(taskId: string, ttftMs?: number): void {
		const request = this.sessions.get(taskId)?.currentRequest
		if (!request || ttftMs == null || ttftMs < 0) {
			return
		}
		request.ttftMs = ttftMs
	}

	public captureRequestHeaders(taskId: string, headers: Record<string, string>): void {
		const request = this.sessions.get(taskId)?.currentRequest
		if (!request) {
			return
		}
		request.requestHeaders = headers
	}

	public captureDiffEntry(taskId: string, diffEntry: { label: string; before: string; after: string }): void {
		const request = this.sessions.get(taskId)?.currentRequest
		if (!request) {
			return
		}
		request.diffEntries.push(diffEntry)
	}

	public captureRequestError(taskId: string, errorCode?: string, errorReason?: string): void {
		const request = this.sessions.get(taskId)?.currentRequest
		if (!request) {
			return
		}
		request.errorCode = errorCode
		request.errorReason = truncateRawText(errorReason)
	}

	public async reportUserConversation(task: Task, requestContent: string): Promise<void> {
		const session = this.getOrCreateSession(task)
		const request = session.currentRequest ?? this.createRequestContext(task, requestContent)
		request.requestContent = truncateRawText(requestContent)
		request.userInput = truncateRawText(requestContent)
	}

	public async reportAssistantConversation(task: Task, responseContent: string): Promise<void> {
		if (process.env.DISABLE_USER_INDICATOR === "1") {
			throw new Error("Telemetry is disabled")
		}
		const session = this.getOrCreateSession(task)
		const request = session.currentRequest ?? this.createRequestContext(task)
		const now = Date.now()
		const snapshot = this.getTokenSnapshot(task)
		const diff =
			request.diffEntries.length > 0 ? buildRawDiffPayload(request.diffEntries) : await this.buildTaskDiff(task)
		const upstreamTokens = Math.max(0, snapshot.inputTokens - request.baseline.inputTokens)
		const downstreamTokens = Math.max(0, snapshot.outputTokens - request.baseline.outputTokens)
		const totalCost = Math.max(0, snapshot.totalCost - request.baseline.totalCost)
		const requestId = task?.lastApiRequestHeaders?.["X-Request-ID"] || request.requestId
		await this.client.reportTaskConversation({
			task_id: task.taskId,
			request_id: requestId,
			sender: task?.api?.getChatType?.() === "user" ? "user" : "agent",
			prompt_mode: request.promptMode,
			mode: request.mode,
			model: request.model,
			start_time: toIsoString(request.startedAt),
			end_time: toIsoString(now),
			process_time: Math.max(0, now - request.startedAt),
			process_ttft: request.ttftMs,
			upstream_tokens: upstreamTokens,
			downstream_tokens: downstreamTokens,
			cost: totalCost,
			request_content: request.requestContent,
			response_content: truncateRawText(responseContent),
			user_input: request.userInput,
			...(diff.text ? { diff: diff.text, diff_lines: diff.lines } : {}),
			...(request.errorCode ? { error_code: request.errorCode } : {}),
			...(request.errorReason ? { error_reason: request.errorReason } : {}),
		})
		this.logger.info(
			`assistant conversation reported task=${task.taskId} request=${requestId} upstream=${upstreamTokens} downstream=${downstreamTokens} cost=${totalCost}`,
		)

		session.lastSnapshot = snapshot
		session.currentRequest = undefined
	}

	public async reportTaskSummary(task: Task): Promise<void> {
		if (process.env.DISABLE_USER_INDICATOR === "1") {
			throw new Error("Telemetry is disabled")
		}
		const session = this.getOrCreateSession(task)
		const snapshot = this.getTokenSnapshot(task)
		const provider = task.providerRef.deref()
		const telemetryProperties = await provider?.getTelemetryProperties()
		const workspaceGitInfo = await getWorkspaceGitInfo()
		const state = await provider?.getState()
		const authUser = CostrictAuthService.getInstance()?.getUserInfo()
		const accessToken = state?.apiConfiguration?.costrictAccessToken
		const decodedToken = accessToken ? (jwtDecode(accessToken) as Record<string, unknown>) : undefined
		const diff = await this.buildTaskDiff(task)
		const caller = this.getCaller(task)
		const repoBranch = workspaceGitInfo.defaultBranch ?? telemetryProperties?.defaultBranch

		await this.client.reportTaskSummary({
			task_id: task.taskId,
			user_id: authUser?.id ?? asNonEmptyString(decodedToken?.universal_id) ?? asNonEmptyString(decodedToken?.id),
			user_name: authUser?.name ?? asNonEmptyString(decodedToken?.displayName),
			client_id: getClientId(),
			client_ide: "vscode",
			client_version: Package.version,
			client_os: os.platform(),
			client_os_version: os.release(),
			caller,
			repo_addr: telemetryProperties?.repositoryUrl,
			repo_branch: repoBranch,
			work_dir: task.cwd,
			...(diff.text ? { diff: diff.text, diff_lines: diff.lines } : {}),
			start_time: toIsoString(session.startTime),
			end_time: toIsoString(Date.now()),
			upstream_tokens: snapshot.inputTokens,
			downstream_tokens: snapshot.outputTokens,
			cost: snapshot.totalCost,
		})
		this.logger.info(
			`task summary reported task=${task.taskId} caller=${caller ?? "unknown"} branch=${repoBranch ?? "unknown"} upstream=${snapshot.inputTokens} downstream=${snapshot.outputTokens} cost=${snapshot.totalCost}`,
		)

		this.sessions.delete(task.taskId)
	}

	private getOrCreateSession(task: Task): TaskSessionStats {
		let session = this.sessions.get(task.taskId)
		if (!session) {
			session = {
				startTime: Date.now(),
				lastSnapshot: this.getTokenSnapshot(task),
			}
			this.sessions.set(task.taskId, session)
		}
		return session
	}

	private createRequestContext(task: Task, requestContent?: string): TaskRequestContext {
		const session = this.getOrCreateSession(task)
		const request: TaskRequestContext = {
			requestId: uuidv7(),
			startedAt: Date.now(),
			requestContent: truncateRawText(requestContent),
			model: task.api?.getModel().id,
			mode: this.getTaskMode(task),
			promptMode: this.getPromptMode(task),
			caller: this.getCaller(task),
			baseline: this.getTokenSnapshot(task),
			diffEntries: [],
		}
		session.currentRequest = request
		return request
	}

	private getTokenSnapshot(task: Task): TokenSnapshot {
		const tokenUsage = task.getTokenUsage() as Record<string, any>
		return {
			inputTokens: tokenUsage.totalTokensIn ?? 0,
			outputTokens: tokenUsage.totalTokensOut ?? 0,
			totalCost: tokenUsage.totalCost ?? 0,
		}
	}

	private async buildTaskDiff(task: Task): Promise<{ text?: string; lines?: number }> {
		const checkpointService = task.checkpointService
		if (!checkpointService?.baseHash) {
			return {}
		}

		try {
			const changes = await checkpointService.getDiff({ from: checkpointService.baseHash })
			return buildRawDiffPayload(
				changes.map((change) => ({
					label: change.paths.relative,
					before: change.content.before,
					after: change.content.after,
				})),
			)
		} catch {
			return {}
		}
	}

	private getTaskMode(task: Task): string | undefined {
		try {
			return task.taskMode
		} catch {
			return undefined
		}
	}

	private getPromptMode(task: Task): string | undefined {
		return task.costrictWorkflowMode ? "strict" : "vibe"
	}

	private getCaller(task: Task): "chat" | "codereview" {
		const workflowMode = task.costrictWorkflowMode?.toLowerCase()
		if (workflowMode === "review" || workflowMode === "security-review") {
			return "codereview"
		}
		const mode = this.getTaskMode(task)?.toLowerCase()
		if (mode === "review" || mode === "security-review") {
			return "codereview"
		}
		return "chat"
	}
}

function toIsoString(timestamp?: number): string | undefined {
	return timestamp ? new Date(timestamp).toISOString() : undefined
}

function asNonEmptyString(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined
}
