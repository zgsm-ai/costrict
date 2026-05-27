import * as vscode from "vscode"
// import type { GitExtension } from "./git"

import { ClineProvider } from "../../webview/ClineProvider"
import { getCommand } from "../../../utils/commands"
import { toRelativePath } from "../../../utils/path"
import { CostrictCommandId } from "@roo-code/types"
import { IssueStatus, ReviewTarget, ReviewTargetType } from "../../../shared/codeReview"
import { getVisibleProviderOrLog } from "../../../activate/registerCommands"

import { CodeReviewService } from "./codeReviewService"
import { HistoryManager } from "./HistoryManager"
import { CommentService } from "../../../integrations/comment"
import type { ReviewComment } from "./reviewComment"
import { supportPrompt } from "../../../shared/support-prompt"
import { getChangedFiles, getWorkingState } from "../../../utils/git"
import { t } from "../../../i18n"
import { GitCommitListener } from "./gitCommitListener"
import { isJetbrainsPlatform } from "../../../utils/platform"
import type { Mode } from "../../../shared/modes"
import { getConfiguredUiMode } from "../../../shared/uiMode"
import { sendContextToCloudWithFocus } from "../../cs-cloud/extension/contextBridge"
import type { AssistantUIContextMessage } from "../../cs-cloud/extension/types"
import * as cloudReviewReportWatcher from "./cloudReviewReportWatcher"

let commitListener: GitCommitListener | undefined

export function disposeGitCommitListener(): void {
	if (commitListener) {
		commitListener.getDisposables().forEach((d) => d.dispose())
		commitListener = undefined
	}
}

function resolveWorkspaceFolderForPath(filePath: string | undefined): vscode.WorkspaceFolder | undefined {
	if (filePath) {
		const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath))
		if (workspaceFolder) {
			return workspaceFolder
		}
	}
	return vscode.workspace.workspaceFolders?.[0]
}

function getCloudReviewReportPath(mode: Mode): string {
	return mode === "security-review"
		? cloudReviewReportWatcher.SECURITY_REVIEW_REPORT_RELATIVE_PATH
		: cloudReviewReportWatcher.CODE_REVIEW_REPORT_RELATIVE_PATH
}

async function resolveGitChangesContent(cwd: string): Promise<string> {
	try {
		const workingState = await getWorkingState(cwd)
		return `Working directory changes (see below for details)\n\n<git_working_state>\n${workingState}\n</git_working_state>`
	} catch (error) {
		const errorMsg = error instanceof Error ? error.message : String(error)
		return `Working directory changes (see below for details)\n\n<git_working_state>\nError fetching working state: ${errorMsg}\n</git_working_state>`
	}
}

async function sendCloudReviewPayload(
	payload: AssistantUIContextMessage,
	workspaceFolder: vscode.WorkspaceFolder | undefined,
	reportRelativePath = cloudReviewReportWatcher.CODE_REVIEW_REPORT_RELATIVE_PATH,
): Promise<void> {
	if (workspaceFolder) {
		cloudReviewReportWatcher.startWatching(workspaceFolder, reportRelativePath)
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

export function initCodeReview(
	context: vscode.ExtensionContext,
	provider: ClineProvider,
	outputChannel: vscode.OutputChannel,
) {
	const reviewInstance = CodeReviewService.getInstance()
	const commentService = CommentService.getInstance()
	reviewInstance.setProvider(provider)
	reviewInstance.setCommentService(commentService)
	cloudReviewReportWatcher.setLogger(outputChannel)
	context.subscriptions.push(
		vscode.workspace.onDidChangeWorkspaceFolders((event) => {
			for (const workspaceFolder of event.removed) {
				cloudReviewReportWatcher.stopWatching(workspaceFolder)
			}
		}),
		{ dispose: () => cloudReviewReportWatcher.disposeAll() },
	)
	const isJetbrains = isJetbrainsPlatform()

	if (!isJetbrains) {
		commitListener = new GitCommitListener(context, reviewInstance)
		commitListener.startListening().catch((error) => {
			provider.log(`[GitCommitListener] Failed to start: ${error}`)
		})
	} else {
		console.log("Running on JetBrains platform, Git extension dependency not required")
	}

	const startFileOrFolderReview = async (paths: readonly string[], mode: Mode = "review") => {
		if (getConfiguredUiMode() === "cloud") {
			const workspaceFolder = resolveWorkspaceFolderForPath(paths[0])
			const chatMessage = paths
				.map((p) => {
					const uri = vscode.Uri.file(p)
					const folder = vscode.workspace.getWorkspaceFolder(uri)
					const cwd = folder?.uri.fsPath ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
					const relative = cwd ? toRelativePath(p.toPosix(), cwd.toPosix()) : p.toPosix()
					return `@/${relative}`
				})
				.join(" ")

			const slashCommand = mode === "security-review" ? "/security-review " : "/review "

			const payload: AssistantUIContextMessage = {
				type: "assistantUIContext",
				text: `${slashCommand}${chatMessage}`,
				focus: true,
				newThread: true,
				autoSend: true,
			}
			await sendCloudReviewPayload(payload, workspaceFolder, getCloudReviewReportPath(mode))
			return
		}

		const visibleProvider = await ClineProvider.getInstance()
		if (!visibleProvider) {
			return
		}
		reviewInstance.setProvider(visibleProvider)
		if (!(await reviewInstance.checkApiProviderSupport())) {
			return
		}
		const cwd = visibleProvider.cwd.toPosix()
		await reviewInstance.startReview(
			{
				type: ReviewTargetType.FILE,
				data: paths.map((filePath) => ({
					file_path: toRelativePath(filePath.toPosix(), cwd),
				})),
			},
			mode,
		)
	}

	const startUriFileOrFolderReview = async (selectedUris: readonly vscode.Uri[], mode: Mode = "review") => {
		await startFileOrFolderReview(
			selectedUris.map((uri) => uri.fsPath),
			mode,
		)
	}

	const startSelectedCodeReview = async (mode: Mode = "review"): Promise<void> => {
		if (getConfiguredUiMode() === "cloud") {
			const editor = vscode.window.activeTextEditor
			if (!editor) return

			const fileUri = editor.document.uri
			const workspaceFolder =
				vscode.workspace.getWorkspaceFolder(fileUri) ?? vscode.workspace.workspaceFolders?.[0]
			if (!workspaceFolder) return

			const cwd = workspaceFolder.uri.fsPath.toPosix()
			const range = editor.selection
			const filePath = toRelativePath(fileUri.fsPath.toPosix(), cwd)
			const params = {
				filePath,
				endLine: range.end.line + 1 + "",
				startLine: range.start.line + 1 + "",
				selectedText: editor.document.getText(range),
			}
			let prompt = supportPrompt.create("ADD_TO_CONTEXT", params)

			// For security-review mode, append auto-confirmation message
			if (mode === "security-review") {
				const autoExecuteMessage = t("common:review.tip.auto_execute_with_default_config")
				prompt = `${prompt}\n\n${autoExecuteMessage}`
			}

			const slashCommand = mode === "security-review" ? "/security-review " : "/review "

			const payload: AssistantUIContextMessage = {
				type: "assistantUIContext",
				text: `${slashCommand}${prompt}`,
				previewText: mode === "security-review" ? "Security Review: " + filePath : "Code Review: " + filePath,
				focus: true,
				newThread: true,
				autoSend: true,
			}
			await sendCloudReviewPayload(payload, workspaceFolder, getCloudReviewReportPath(mode))
			return
		}

		const visibleProvider = await ClineProvider.getInstance()
		const editor = vscode.window.activeTextEditor
		if (!visibleProvider || !editor) {
			return
		}
		reviewInstance.setProvider(visibleProvider)
		if (!(await reviewInstance.checkApiProviderSupport())) {
			return
		}
		const fileUri = editor.document.uri
		const range = editor.selection
		const cwd = visibleProvider.cwd.toPosix()
		const filePath = toRelativePath(fileUri.fsPath.toPosix(), cwd)
		const params = {
			filePath,
			endLine: range.end.line + 1 + "",
			startLine: range.start.line + 1 + "",
			selectedText: editor.document.getText(range),
		}
		let prompt = supportPrompt.create("ADD_TO_CONTEXT", params)

		// For security-review mode, append auto-confirmation message
		if (mode === "security-review") {
			const autoExecuteMessage = t("common:review.tip.auto_execute_with_default_config")
			prompt = `${prompt}\n\n${autoExecuteMessage}`
		}

		reviewInstance.createReviewTask(
			prompt,
			{
				type: ReviewTargetType.CODE,
				data: [
					{
						file_path: filePath,
						line_range: [range.start.line, range.end.line],
					},
				],
			},
			mode !== "review" ? { mode } : undefined,
		)
	}

	const commandMap: Partial<Record<CostrictCommandId, any>> = {
		codeReviewButtonClicked: async () => {
			if (getConfiguredUiMode() === "cloud") {
				await vscode.commands.executeCommand("costrict.AssistantUISidebarProvider.focus")
				return
			}

			let visibleProvider = getVisibleProviderOrLog(outputChannel)

			if (!visibleProvider) {
				visibleProvider = await ClineProvider.getInstance()
			}

			visibleProvider?.postMessageToWebview({ type: "action", action: "codeReviewButtonClicked" })
		},
		codeReview: async () => startSelectedCodeReview(),
		securityReviewCode: async () => startSelectedCodeReview("security-review"),
		reviewFilesAndFolders: async (_: vscode.Uri, selectedUris: vscode.Uri[]) => {
			await startUriFileOrFolderReview(selectedUris)
		},
		securityFilesAndFolders: async (_: vscode.Uri, selectedUris: vscode.Uri[]) => {
			await startUriFileOrFolderReview(selectedUris, "security-review")
		},
		acceptIssue: async (thread: vscode.CommentThread) => {
			const visibleProvider = await ClineProvider.getInstance()
			if (!visibleProvider) {
				return
			}
			reviewInstance.setProvider(visibleProvider)
			const comments = thread.comments as ReviewComment[]
			comments.forEach(async (comment) => {
				if (comment.contextValue !== "Intial") {
					await reviewInstance.updateHistoryIssueStatus(comment.id, comment.contextValue!, IssueStatus.ACCEPT)
					return
				}
				reviewInstance.updateIssueStatus(comment.id, IssueStatus.ACCEPT)
			})
		},
		rejectIssue: async (thread: vscode.CommentThread) => {
			const visibleProvider = await ClineProvider.getInstance()
			if (!visibleProvider) {
				return
			}
			reviewInstance.setProvider(visibleProvider)
			const comments = thread.comments as ReviewComment[]
			comments.forEach(async (comment) => {
				if (comment.contextValue !== "Intial") {
					await reviewInstance.updateHistoryIssueStatus(comment.id, comment.contextValue!, IssueStatus.REJECT)
					return
				}
				reviewInstance.updateIssueStatus(comment.id, IssueStatus.REJECT)
			})
		},
		askReviewSuggestionWithAI: async (thread: vscode.CommentThread) => {
			const visibleProvider = await ClineProvider.getInstance()
			if (!visibleProvider) {
				return
			}
			reviewInstance.setProvider(visibleProvider)
			const comment = thread.comments[0] as ReviewComment
			if (comment) {
				reviewInstance.askWithAI(
					comment.id,
					comment.contextValue === "intial" ? undefined : comment.contextValue,
				)
			}
		},
		reviewCommit: async () => {
			if (getConfiguredUiMode() === "cloud") {
				const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
				if (!workspaceFolder) return

				const cwd = workspaceFolder.uri.fsPath
				const changedFiles = await getChangedFiles(cwd)
				if (changedFiles.length === 0) {
					vscode.window.showInformationMessage(t("common:review.tip.no_changed_files"))
					return
				}

				const gitChangesContent = await resolveGitChangesContent(cwd)

				const payload: AssistantUIContextMessage = {
					type: "assistantUIContext",
					text: `/review ${gitChangesContent}`,
					focus: true,
					newThread: true,
					autoSend: true,
				}
				await sendCloudReviewPayload(payload, workspaceFolder)
				return
			}

			const visibleProvider = await ClineProvider.getInstance()
			if (!visibleProvider) {
				return
			}
			reviewInstance.setProvider(visibleProvider)
			if (!(await reviewInstance.checkApiProviderSupport())) {
				return
			}
			visibleProvider.log("[CodeReview] Reviewing git changes")

			// 获取当前 git 变更的文件列表
			const cwd = visibleProvider.cwd.toPosix()
			const changedFiles = await getChangedFiles(cwd)

			if (changedFiles.length === 0) {
				vscode.window.showInformationMessage(t("common:review.tip.no_changed_files"))
				return
			}

			visibleProvider.log(`[CodeReview] Found ${changedFiles.length} changed files`)

			// 使用 @git-changes 来审查当前的 git 变更
			reviewInstance.createReviewTask("@git-changes", {
				type: ReviewTargetType.FILE,
				data: changedFiles.map((file_path) => ({
					file_path,
				})),
			})
		},
		...(!isJetbrains
			? {}
			: {
					codeReviewJetbrains: async (args: any) => {
						const visibleProvider = await ClineProvider.getInstance()
						if (!visibleProvider) {
							return
						}
						reviewInstance.setProvider(visibleProvider)
						if (!(await reviewInstance.checkApiProviderSupport())) {
							return
						}
						visibleProvider.log(`[CodeReview] start review ${args}`)

						const data = args?.[0]?.[0]
						if (!data) {
							visibleProvider.log("[CodeReview] Invalid args structure")
							return
						}

						const { startLine, endLine, filePath, selectedText } = data
						visibleProvider.log(
							`[CodeReview] extracted data: filePath=${filePath}, startLine=${startLine}, endLine=${endLine}`,
						)

						const cwd = visibleProvider.cwd.toPosix()
						const params = {
							filePath,
							endLine: endLine + "",
							startLine: startLine + "",
							selectedText: selectedText,
						}
						const prompt = supportPrompt.create("ADD_TO_CONTEXT", params)
						reviewInstance.createReviewTask(prompt, {
							type: ReviewTargetType.CODE,
							data: [
								{
									file_path: toRelativePath(filePath.toPosix(), cwd),
									line_range: [startLine, endLine],
								},
							],
						})
					},
					reviewFilesAndFoldersJetbrains: async (args: any) => {
						const data = args?.[0]?.[0]
						const filePaths = data?.filePaths
						if (!filePaths) {
							const visibleProvider = await ClineProvider.getInstance()
							visibleProvider?.log("[CodeReview] Invalid args structure")
							return
						}
						await startFileOrFolderReview(filePaths, "review")
					},
					securityFilesAndFoldersJetbrains: async (args: any) => {
						const data = args?.[0]?.[0]
						const filePaths = data?.filePaths
						if (!filePaths) {
							const visibleProvider = await ClineProvider.getInstance()
							visibleProvider?.log("[CodeReview] Invalid args structure")
							return
						}
						await startFileOrFolderReview(filePaths, "security-review")
					},
					acceptIssueJetbrains: async (args: any) => {
						const visibleProvider = await ClineProvider.getInstance()
						if (!visibleProvider) {
							return
						}
						reviewInstance.setProvider(visibleProvider)
						visibleProvider.log(`[CodeReview] accept issue ${JSON.stringify(args)}`)
						const data = args?.[0]?.[0]
						if (!data) {
							visibleProvider.log("[CodeReview] Invalid args structure")
							return
						}

						const { id } = data
						reviewInstance.updateIssueStatus(id, IssueStatus.ACCEPT)
					},
					rejectIssueJetbrains: async (args: any) => {
						const visibleProvider = await ClineProvider.getInstance()
						if (!visibleProvider) {
							return
						}
						reviewInstance.setProvider(visibleProvider)
						visibleProvider.log(`[CodeReview] reject issue ${JSON.stringify(args)}`)
						const data = args?.[0]?.[0]
						if (!data) {
							visibleProvider.log("[CodeReview] Invalid args structure")
							return
						}

						const { id } = data
						reviewInstance.updateIssueStatus(id, IssueStatus.REJECT)
					},
					askReviewSuggestionWithAIJetbrains: async (args: any) => {
						const visibleProvider = await ClineProvider.getInstance()
						if (!visibleProvider) {
							return
						}
						visibleProvider.log(`[CodeReview] ask review suggestion with AI ${JSON.stringify(args)}`)
						reviewInstance.setProvider(visibleProvider)
						const data = args?.[0]?.[0]
						if (!data) {
							visibleProvider.log("[CodeReview] Invalid args structure")
							return
						}

						const { id } = data
						if (id) {
							reviewInstance.askWithAI(id)
						}
					},
				}),
	}
	for (const [id, callback] of Object.entries(commandMap)) {
		const command = getCommand(id as CostrictCommandId)
		context.subscriptions.push(vscode.commands.registerCommand(command, callback))
	}
}

export { CodeReviewService, ReviewTargetType, HistoryManager }
export type { ReviewHistoryEntry } from "../../../shared/codeReview"
