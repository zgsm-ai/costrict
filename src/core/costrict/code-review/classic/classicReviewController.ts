import * as vscode from "vscode"
import type { Mode } from "../../../../shared/modes"
import { IssueStatus, ReviewTargetType } from "../../../../shared/codeReview"
import { toRelativePath } from "../../../../utils/path"
import { getChangedFiles } from "../../../../utils/git"
import { t } from "../../../../i18n"
import type { ReviewComment } from "../reviewComment"
import { getSelectedCodeParams, buildSelectedCodeArgs } from "../common/reviewContext"
import { CodeReviewService } from "../codeReviewService"
import { ClineProvider } from "../../../webview/ClineProvider"
import { getVisibleProviderOrLog } from "../../../../activate/registerCommands"
import { CommentService } from "../../../../integrations/comment"

// ── Context value helpers ────────────────────────────────────────────

/**
 * The context value assigned to comment threads that are created from the
 * current (active) review task. Comments loaded from history carry the
 * review task ID as their context value instead.
 */
const INITIAL_REVIEW_COMMENT_CONTEXT = "Intial"

/**
 * Returns `true` when the context value indicates an initial (non-history)
 * review comment.
 */
function isInitialCommentContext(value: string | undefined): boolean {
	return value === INITIAL_REVIEW_COMMENT_CONTEXT || value === "Initial" || value === "intial"
}

/**
 * ClassicReviewController handles all classic-mode review entry points.
 *
 * It owns the classic-only ClineProvider interactions and delegates the actual
 * review lifecycle to CodeReviewService. JetBrains-specific variants are also
 * hosted here.
 */
export class ClassicReviewController {
	constructor(private readonly reviewService: CodeReviewService) {}

	private async ensureProvider(): Promise<ClineProvider | undefined> {
		const provider = await ClineProvider.getInstance()
		if (provider) {
			this.reviewService.setProvider(provider)
		}
		return provider ?? undefined
	}

	private async ensureProviderWithSupport(): Promise<boolean> {
		const provider = await this.ensureProvider()
		if (!provider) return false
		return this.reviewService.checkApiProviderSupport()
	}

	private async getVisibleOrFetchProvider(outputChannel: vscode.OutputChannel): Promise<ClineProvider | undefined> {
		let provider = getVisibleProviderOrLog(outputChannel)
		if (!provider) {
			provider = await ClineProvider.getInstance()
		}
		return provider ?? undefined
	}

	private getCwd(): string {
		return this.reviewService.getProvider()?.cwd.toPosix() ?? ""
	}

	private log(message: string): void {
		this.reviewService.getProvider()?.log(message)
	}

	// ── File / folder review ──────────────────────────────────────────

	async startFileOrFolderReview(paths: readonly string[], mode: Mode = "review"): Promise<void> {
		console.log(`[CodeReview] startFileOrFolderReview called with mode=${mode}`)
		if (!(await this.ensureProviderWithSupport())) return

		const cwd = this.getCwd()
		await this.reviewService.startReview(
			{
				type: ReviewTargetType.FILE,
				data: paths.map((filePath) => ({
					file_path: toRelativePath(filePath.toPosix(), cwd),
				})),
			},
			mode,
		)
	}

	async startUriFileOrFolderReview(selectedUris: readonly vscode.Uri[], mode: Mode = "review"): Promise<void> {
		await this.startFileOrFolderReview(
			selectedUris.map((uri) => uri.fsPath),
			mode,
		)
	}

	// ── Selected code review ──────────────────────────────────────────

	async startSelectedCodeReview(mode: Mode = "review"): Promise<void> {
		console.log(`[CodeReview] startSelectedCodeReview called with mode=${mode}`)
		const provider = await this.ensureProvider()
		const editor = vscode.window.activeTextEditor
		if (!provider || !editor) return

		if (!(await this.reviewService.checkApiProviderSupport())) return

		const cwd = this.getCwd()
		const params = getSelectedCodeParams(editor, cwd)
		const args = buildSelectedCodeArgs(params)
		const prompt = await this.reviewService.buildReviewPrompt(mode as "review" | "security-review", args)

		await this.reviewService.createReviewTask(
			prompt,
			{
				type: ReviewTargetType.CODE,
				data: [
					{
						file_path: params.filePath,
						line_range: [parseInt(params.startLine, 10), parseInt(params.endLine, 10)],
					},
				],
			},
			{ mode },
		)
	}

	// ── Git changes review ────────────────────────────────────────────

	async reviewCommit(): Promise<void> {
		if (!(await this.ensureProviderWithSupport())) return

		this.log("[CodeReview] Reviewing git changes")

		const cwd = this.getCwd()
		const changedFiles = await getChangedFiles(cwd)

		if (changedFiles.length === 0) {
			vscode.window.showInformationMessage(t("common:review.tip.no_changed_files"))
			return
		}

		this.log(`[CodeReview] Found ${changedFiles.length} changed files`)

		const reviewPrompt = await this.reviewService.buildReviewPrompt("review", "@git-changes")
		await this.reviewService.createReviewTask(
			reviewPrompt,
			{
				type: ReviewTargetType.FILE,
				data: changedFiles.map((file_path) => ({
					file_path,
				})),
			},
			{ mode: "review" },
		)
	}

	// ── Button clicked ────────────────────────────────────────────────

	async codeReviewButtonClicked(outputChannel: vscode.OutputChannel): Promise<void> {
		const provider = await this.getVisibleOrFetchProvider(outputChannel)
		provider?.postMessageToWebview({ type: "action", action: "codeReviewButtonClicked" })
	}

	// ── Comment thread operations ─────────────────────────────────────

	async acceptIssue(thread: vscode.CommentThread): Promise<void> {
		if (!(await this.ensureProvider())) return
		const comments = thread.comments as ReviewComment[]
		await Promise.all(
			comments.map(async (comment) => {
				if (isInitialCommentContext(comment.contextValue)) {
					await this.reviewService.updateIssueStatus(comment.id, IssueStatus.ACCEPT)
					return
				}
				await this.reviewService.updateHistoryIssueStatus(comment.id, comment.contextValue!, IssueStatus.ACCEPT)
			}),
		)
	}

	async rejectIssue(thread: vscode.CommentThread): Promise<void> {
		if (!(await this.ensureProvider())) return
		const comments = thread.comments as ReviewComment[]
		await Promise.all(
			comments.map(async (comment) => {
				if (isInitialCommentContext(comment.contextValue)) {
					await this.reviewService.updateIssueStatus(comment.id, IssueStatus.REJECT)
					return
				}
				await this.reviewService.updateHistoryIssueStatus(comment.id, comment.contextValue!, IssueStatus.REJECT)
			}),
		)
	}

	async askReviewSuggestionWithAI(thread: vscode.CommentThread): Promise<void> {
		if (!(await this.ensureProvider())) return
		const comment = thread.comments[0] as ReviewComment
		if (comment) {
			this.reviewService.askWithAI(
				comment.id,
				isInitialCommentContext(comment.contextValue) ? undefined : comment.contextValue,
			)
		}
	}

	// ── JetBrains variants ────────────────────────────────────────────

	async codeReviewJetbrains(args: any): Promise<void> {
		if (!(await this.ensureProviderWithSupport())) return
		this.log(`[CodeReview] start review ${args}`)

		const data = args?.[0]?.[0]
		if (!data) {
			this.log("[CodeReview] Invalid args structure")
			return
		}

		const { startLine, endLine, filePath } = data
		this.log(`[CodeReview] extracted data: filePath=${filePath}, startLine=${startLine}, endLine=${endLine}`)

		const cwd = this.getCwd()
		const reviewArgs = `@/${filePath}:${startLine}-${endLine}`
		const prompt = await this.reviewService.buildReviewPrompt("review", reviewArgs)
		this.reviewService.createReviewTask(
			prompt,
			{
				type: ReviewTargetType.CODE,
				data: [
					{
						file_path: toRelativePath(filePath.toPosix(), cwd),
						line_range: [startLine, endLine],
					},
				],
			},
			{ mode: "review" },
		)
	}

	async reviewFilesAndFoldersJetbrains(args: any): Promise<void> {
		const data = args?.[0]?.[0]
		const filePaths = data?.filePaths
		if (!filePaths) {
			const provider = await this.ensureProvider()
			provider?.log("[CodeReview] Invalid args structure")
			return
		}
		await this.startFileOrFolderReview(filePaths, "review")
	}

	async securityFilesAndFoldersJetbrains(args: any): Promise<void> {
		const data = args?.[0]?.[0]
		const filePaths = data?.filePaths
		if (!filePaths) {
			const provider = await this.ensureProvider()
			provider?.log("[CodeReview] Invalid args structure")
			return
		}
		await this.startFileOrFolderReview(filePaths, "security-review")
	}

	async acceptIssueJetbrains(args: any): Promise<void> {
		if (!(await this.ensureProvider())) return
		this.log(`[CodeReview] accept issue ${JSON.stringify(args)}`)
		const data = args?.[0]?.[0]
		if (!data) {
			this.log("[CodeReview] Invalid args structure")
			return
		}
		const { id } = data
		this.reviewService.updateIssueStatus(id, IssueStatus.ACCEPT)
	}

	async rejectIssueJetbrains(args: any): Promise<void> {
		if (!(await this.ensureProvider())) return
		this.log(`[CodeReview] reject issue ${JSON.stringify(args)}`)
		const data = args?.[0]?.[0]
		if (!data) {
			this.log("[CodeReview] Invalid args structure")
			return
		}
		const { id } = data
		this.reviewService.updateIssueStatus(id, IssueStatus.REJECT)
	}

	async askReviewSuggestionWithAIJetbrains(args: any): Promise<void> {
		if (!(await this.ensureProvider())) return
		this.log(`[CodeReview] ask review suggestion with AI ${JSON.stringify(args)}`)
		const data = args?.[0]?.[0]
		if (!data) {
			this.log("[CodeReview] Invalid args structure")
			return
		}
		const { id } = data
		if (id) {
			this.reviewService.askWithAI(id)
		}
	}
}

/**
 * Create the classic review controller and wire up the CodeReviewService
 * singleton with the given provider and comment service.
 */
export function createClassicReviewController({
	provider,
}: {
	context: vscode.ExtensionContext
	provider: ClineProvider
}): ClassicReviewController {
	const reviewService = CodeReviewService.getInstance()
	const commentService = CommentService.getInstance()

	reviewService.setProvider(provider)
	reviewService.setCommentService(commentService)

	return new ClassicReviewController(reviewService)
}
