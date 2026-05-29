import type { GitCommitReviewHandler, GitCommitReviewContext } from "../gitCommitListener"
import { CodeReviewService } from "../codeReviewService"
import { EXPERIMENT_IDS, experiments } from "../../../../shared/experiments"
import { ReviewTargetType } from "../../../../shared/codeReview"
import { getRawCommitReporter } from "../../telemetry"

/**
 * Classic-mode Git commit review handler.
 *
 * Preserves the existing behaviour of the original GitCommitListener:
 * - Reports raw commit telemetry via RawCommitReporter.
 * - Checks experiment flags and costrict provider before offering review.
 * - Creates a classic review task with ReviewTargetType.COMMIT.
 */
export class ClassicGitCommitReviewHandler implements GitCommitReviewHandler {
	constructor(private reviewService: CodeReviewService) {}

	async reportCommit(ctx: GitCommitReviewContext): Promise<void> {
		const provider = this.reviewService.getProvider()
		if (provider) {
			void getRawCommitReporter()?.reportCommit(ctx.repo, ctx.commit, provider)
		}
	}

	async shouldOfferReview(_context: GitCommitReviewContext): Promise<boolean> {
		const provider = this.reviewService.getProvider()
		if (!provider) {
			return false
		}

		const state = await provider.getState()
		const { experiments: exps = {}, apiConfiguration } = state

		return (
			experiments.isEnabled(exps ?? {}, EXPERIMENT_IDS.COMMIT_REVIEW) ??
			apiConfiguration?.apiProvider === "costrict"
		)
	}

	async startReview(ctx: GitCommitReviewContext): Promise<void> {
		if (!(await this.reviewService.checkApiProviderSupport())) {
			return
		}

		const prompt = await this.reviewService.buildReviewPrompt("review", `commit ${ctx.commit.hash}`)
		await this.reviewService.createReviewTask(
			prompt,
			{
				type: ReviewTargetType.COMMIT,
				commit: ctx.commit.hash,
			},
			{ mode: "review" },
		)
	}
}
