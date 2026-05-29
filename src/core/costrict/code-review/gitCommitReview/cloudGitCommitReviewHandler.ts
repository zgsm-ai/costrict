import type { GitCommitReviewHandler, GitCommitReviewContext } from "../gitCommitListener"
import type { CloudReviewController } from "../cloud/cloudReviewController"
import { resolveWorkspaceFolderForUri } from "../common/reviewContext"

/**
 * Cloud-mode Git commit review handler.
 *
 * Does **not** depend on ClineProvider or CodeReviewService. Instead it sends
 * `/review commit <hash>` to the cloud AI input box via CloudReviewController
 * and lets the cloud review report watcher handle result detection.
 */
export class CloudGitCommitReviewHandler implements GitCommitReviewHandler {
	constructor(private cloudController: CloudReviewController) {}

	async shouldOfferReview(_context: GitCommitReviewContext): Promise<boolean> {
		return true
	}

	async startReview(context: GitCommitReviewContext): Promise<void> {
		const workspaceFolder = resolveWorkspaceFolderForUri(context.repo.rootUri)
		await this.cloudController.reviewCommitHash(context.commit.hash, workspaceFolder)
	}
}
