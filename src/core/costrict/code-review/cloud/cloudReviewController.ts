import * as vscode from "vscode"
import type { Mode } from "../../../../shared/modes"
import { ReviewTargetType } from "../../../../shared/codeReview"
import type { ReviewTarget } from "../../../../shared/codeReview"
import type { AxiosRequestConfig } from "axios"
import type { AssistantUIContextMessage } from "../../../cs-cloud/extension/types"
import { sendContextToCloudWithFocus } from "../../../cs-cloud/extension/contextBridge"
import { getChangedFiles } from "../../../../utils/git"
import { toRelativePath } from "../../../../utils/path"
import { t } from "../../../../i18n"
import * as cloudReviewReportWatcher from "../cloudReviewReportWatcher"
import type { ResolveConfig } from "../cloudReviewReportWatcher"
import {
	resolveWorkspaceFolderForPath,
	buildFileListArgs,
	buildSelectedCodePrompt,
	getSelectedCodeParams,
	resolveGitChangesContent,
	getSecurityReviewAutoExecuteMessage,
	getSlashCommandPrefix,
	getPreviewLabel,
} from "../common/reviewContext"
import {
	getReviewReportJsonRelativePath,
	getReviewReportMdRelativePath,
	type ResolveInput,
} from "../common/reviewIssueResolver"

/**
 * CloudReviewController handles all cloud-mode review entry points.
 *
 * It depends only on VS Code APIs, the cloud context bridge, the report
 * watcher, and common helpers. It does **not** import ClineProvider or
 * CodeReviewService, keeping the cloud path decoupled from classic internals.
 */
export class CloudReviewController {
	/**
	 * @param requestOptionsBuilder - Optional factory for Axios request config.
	 *   When provided, the controller builds ReviewTarget objects and passes
	 *   ResolveConfig to the report watcher so it can resolve issues from the
	 *   JSON report. Created by cloudReviewLifecycle from the global auth service.
	 */
	constructor(private readonly requestOptionsBuilder?: () => Promise<AxiosRequestConfig>) {}

	/**
	 * Build ResolveInput suitable for passing to the report watcher.
	 * Returns undefined when no requestOptionsBuilder is configured.
	 */
	private async buildResolveInput(reviewTarget: ReviewTarget, workspace: string): Promise<ResolveInput | undefined> {
		if (!this.requestOptionsBuilder) return undefined
		const requestOptions = await this.requestOptionsBuilder()
		return {
			source: "cloud",
			reviewTarget,
			workspace,
			requestOptions,
		}
	}

	/**
	 * Build ResolveConfig from a ResolveInput and a mode, for a given
	 * workspace folder. Returns undefined when input is undefined.
	 */
	private buildResolveConfig(
		input: ResolveInput | undefined,
		workspaceFolder: vscode.WorkspaceFolder | undefined,
		mode: Mode,
	): ResolveConfig | undefined {
		if (!input || !workspaceFolder) return undefined
		return {
			input,
			jsonAbsolutePath: vscode.Uri.joinPath(workspaceFolder.uri, getReviewReportJsonRelativePath(mode)).fsPath,
		}
	}

	/**
	 * Send a review payload to the cloud AI context and start watching for
	 * the resulting report files (Markdown for preview, JSON for issue resolution).
	 */
	private async sendCloudReviewPayload(
		payload: AssistantUIContextMessage,
		workspaceFolder: vscode.WorkspaceFolder | undefined,
		reportRelativePath: string,
		resolveConfig?: ResolveConfig,
	): Promise<void> {
		if (workspaceFolder) {
			cloudReviewReportWatcher.startWatching(workspaceFolder, reportRelativePath, resolveConfig)
		}

		try {
			const result = await sendContextToCloudWithFocus(payload)
			if (result === "unavailable" && workspaceFolder) {
				cloudReviewReportWatcher.stopWatching(workspaceFolder)
			}
		} catch (error) {
			if (workspaceFolder) {
				cloudReviewReportWatcher.stopWatching(workspaceFolder)
			}
			throw error
		}
	}

	/**
	 * Initiate a file or folder review in cloud mode.
	 */
	async startFileOrFolderReview(paths: readonly string[], mode: Mode = "review"): Promise<void> {
		const workspaceFolder = resolveWorkspaceFolderForPath(paths[0])
		const cwd = workspaceFolder?.uri.fsPath.toPosix() ?? ""

		// Build ReviewTarget
		const reviewTarget: ReviewTarget = {
			type: ReviewTargetType.FILE,
			data: paths.map((filePath) => ({
				file_path: toRelativePath(filePath.toPosix(), cwd),
			})),
		}

		// Build resolve config for JSON issue resolution
		const input = await this.buildResolveInput(reviewTarget, cwd)
		const resolveConfig = this.buildResolveConfig(input, workspaceFolder, mode)

		const chatMessage = buildFileListArgs(paths)
		const slashCommand = getSlashCommandPrefix(mode)

		const payload: AssistantUIContextMessage = {
			type: "assistantUIContext",
			text: `${slashCommand}${chatMessage}`,
			focus: true,
			newThread: true,
			autoSend: true,
		}

		await this.sendCloudReviewPayload(payload, workspaceFolder, getReviewReportMdRelativePath(mode), resolveConfig)
	}

	/**
	 * Initiate a selected-code review in cloud mode.
	 */
	async startSelectedCodeReview(mode: Mode = "review"): Promise<void> {
		const editor = vscode.window.activeTextEditor
		if (!editor) return

		const fileUri = editor.document.uri
		const workspaceFolder = vscode.workspace.getWorkspaceFolder(fileUri) ?? vscode.workspace.workspaceFolders?.[0]
		if (!workspaceFolder) return

		const cwd = workspaceFolder.uri.fsPath.toPosix()
		const params = getSelectedCodeParams(editor, cwd)

		// Build ReviewTarget for selected code
		const reviewTarget: ReviewTarget = {
			type: ReviewTargetType.CODE,
			data: [
				{
					file_path: params.filePath,
					line_range: [parseInt(params.startLine, 10), parseInt(params.endLine, 10)],
				},
			],
		}

		const input = await this.buildResolveInput(reviewTarget, cwd)
		const resolveConfig = this.buildResolveConfig(input, workspaceFolder, mode)

		let prompt = buildSelectedCodePrompt(params)

		// For security-review mode, append auto-confirmation message
		if (mode === "security-review") {
			prompt = `${prompt}\n\n${getSecurityReviewAutoExecuteMessage()}`
		}

		const slashCommand = getSlashCommandPrefix(mode)
		const previewLabel = getPreviewLabel(mode)

		const payload: AssistantUIContextMessage = {
			type: "assistantUIContext",
			text: `${slashCommand}${prompt}`,
			previewText: `${previewLabel}${params.filePath}`,
			focus: true,
			newThread: true,
			autoSend: true,
		}

		await this.sendCloudReviewPayload(payload, workspaceFolder, getReviewReportMdRelativePath(mode), resolveConfig)
	}

	/**
	 * Initiate a git changes review in cloud mode.
	 */
	async reviewCommit(): Promise<void> {
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
		if (!workspaceFolder) return

		const cwd = workspaceFolder.uri.fsPath
		const changedFiles = await getChangedFiles(cwd)
		if (changedFiles.length === 0) {
			vscode.window.showInformationMessage(t("common:review.tip.no_changed_files"))
			return
		}

		// Build ReviewTarget for git changes
		const reviewTarget: ReviewTarget = {
			type: ReviewTargetType.FILE,
			data: changedFiles.map((file_path) => ({ file_path })),
		}

		const input = await this.buildResolveInput(reviewTarget, cwd)
		const resolveConfig = this.buildResolveConfig(input, workspaceFolder, "review")

		const gitChangesContent = await resolveGitChangesContent(cwd)

		const payload: AssistantUIContextMessage = {
			type: "assistantUIContext",
			text: `/review ${gitChangesContent}`,
			focus: true,
			newThread: true,
			autoSend: true,
		}

		await this.sendCloudReviewPayload(
			payload,
			workspaceFolder,
			cloudReviewReportWatcher.CODE_REVIEW_REPORT_RELATIVE_PATH,
			resolveConfig,
		)
	}

	/**
	 * Initiate a commit review for a specific commit hash in cloud mode.
	 *
	 * Sends `/review commit <hash>` to the cloud AI input box and starts
	 * watching for the review report file.
	 */
	async reviewCommitHash(commitHash: string, workspaceFolder?: vscode.WorkspaceFolder): Promise<void> {
		const cwd = workspaceFolder?.uri.fsPath ?? ""

		// Build ReviewTarget for commit hash
		const reviewTarget: ReviewTarget = {
			type: ReviewTargetType.COMMIT,
			commit: commitHash,
		}

		const input = await this.buildResolveInput(reviewTarget, cwd)
		const resolveConfig = this.buildResolveConfig(input, workspaceFolder, "review")

		const payload: AssistantUIContextMessage = {
			type: "assistantUIContext",
			text: `/review commit ${commitHash}`,
			focus: true,
			newThread: true,
			autoSend: true,
		}

		await this.sendCloudReviewPayload(
			payload,
			workspaceFolder,
			cloudReviewReportWatcher.CODE_REVIEW_REPORT_RELATIVE_PATH,
			resolveConfig,
		)
	}

	/**
	 * Handle the codeReviewButtonClicked action in cloud mode.
	 * Simply focuses the cloud AI sidebar.
	 */
	async codeReviewButtonClicked(): Promise<void> {
		await vscode.commands.executeCommand("costrict.AssistantUISidebarProvider.focus")
	}
}
