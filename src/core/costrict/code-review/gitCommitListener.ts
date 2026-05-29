import * as vscode from "vscode"
import { API as GitAPI, Repository, Commit, GitExtension } from "./git"
import { t } from "../../../i18n"

export interface GitCommitReviewContext {
	repo: Repository
	commit: Commit
}

export interface GitCommitReviewHandler {
	shouldOfferReview(context: GitCommitReviewContext): Promise<boolean>
	startReview(context: GitCommitReviewContext): Promise<void>
	reportCommit?(context: GitCommitReviewContext): Promise<void> | void
}

/**
 * Mode-agnostic Git commit event listener.
 *
 * Listens for Git commits via the VS Code Git extension and delegates
 * review decisions to a configurable handler (classic or cloud).
 * This class no longer depends on CodeReviewService or ClineProvider.
 */
export class GitCommitListener {
	private lastSeenCommitHash: string | undefined
	private disposables: vscode.Disposable[] = []
	private context: vscode.ExtensionContext
	private getHandler: () => GitCommitReviewHandler

	constructor(context: vscode.ExtensionContext, getHandler: () => GitCommitReviewHandler) {
		this.context = context
		this.getHandler = getHandler
		this.lastSeenCommitHash = context.globalState.get<string>("lastSeenCommitHash")
	}

	getDisposables(): vscode.Disposable[] {
		return this.disposables
	}

	async startListening(): Promise<void> {
		const gitAPI = await this.getGitAPI()
		if (!gitAPI) {
			console.warn("Git extension not available")
			return
		}

		// Setup listeners for existing repositories
		gitAPI.repositories.forEach((repo) => {
			this.setupRepositoryListener(repo)
		})

		// Setup listener for new repositories
		const newRepoDisposable = gitAPI.onDidOpenRepository((repo) => {
			this.setupRepositoryListener(repo)
		})
		this.disposables.push(newRepoDisposable)
	}

	private async getGitAPI(): Promise<GitAPI | undefined> {
		const gitExtension = vscode.extensions.getExtension<GitExtension>("vscode.git")
		if (!gitExtension) {
			return undefined
		}

		const git = gitExtension.exports
		if (!git.enabled) {
			return undefined
		}

		return git.getAPI(1)
	}

	private setupRepositoryListener(repo: Repository): void {
		const disposable = repo.onDidCommit(async () => {
			await this.handleNewCommit(repo)
		})
		this.disposables.push(disposable)
	}

	private async handleNewCommit(repo: Repository): Promise<void> {
		try {
			const commit = await repo.getCommit("HEAD")
			await this.processNewCommit(commit, repo)
		} catch (error) {
			console.error("Failed to handle new commit:", error)
		}
	}

	private async processNewCommit(commit: Commit, repo: Repository): Promise<void> {
		if (commit.hash === this.lastSeenCommitHash) {
			return
		}

		this.lastSeenCommitHash = commit.hash

		const ctx = { repo, commit }
		const handler = this.getHandler()

		await handler.reportCommit?.(ctx)

		if (!(await handler.shouldOfferReview(ctx))) {
			return
		}

		await this.context.globalState.update("lastSeenCommitHash", commit.hash)

		const message = t("common:review.tip.new_commit_notification", { commitMessage: commit.message })
		const confirmText = "Review"
		const result = await vscode.window.showInformationMessage(message, confirmText)
		if (result === confirmText) {
			await handler.startReview(ctx)
		}
	}
}
