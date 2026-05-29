import { describe, expect, it, vi, beforeEach } from "vitest"

const { mockReportCommit } = vi.hoisted(() => ({
	mockReportCommit: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("../../telemetry", () => ({
	getRawCommitReporter: vi.fn(() => ({
		reportCommit: mockReportCommit,
	})),
}))

import { ClassicGitCommitReviewHandler } from "./classicGitCommitReviewHandler"

describe("ClassicGitCommitReviewHandler", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	describe("reportCommit", () => {
		it("reports raw commit telemetry when provider is available", async () => {
			const provider = { getState: vi.fn() } as any
			const reviewService = {
				getProvider: vi.fn(() => provider),
			} as any

			const handler = new ClassicGitCommitReviewHandler(reviewService)
			const repo = {} as any
			const commit = { hash: "abc123", message: "feat: test" } as any

			await handler.reportCommit!({ repo, commit })

			expect(mockReportCommit).toHaveBeenCalledWith(repo, commit, provider)
		})

		it("does not report when provider is null", async () => {
			const reviewService = {
				getProvider: vi.fn(() => null),
			} as any

			const handler = new ClassicGitCommitReviewHandler(reviewService)

			await handler.reportCommit!({ repo: {} as any, commit: {} as any })

			expect(mockReportCommit).not.toHaveBeenCalled()
		})
	})

	describe("shouldOfferReview", () => {
		it("returns false when provider is null", async () => {
			const reviewService = {
				getProvider: vi.fn(() => null),
			} as any

			const handler = new ClassicGitCommitReviewHandler(reviewService)

			const result = await handler.shouldOfferReview({ repo: {} as any, commit: {} as any })
			expect(result).toBe(false)
		})

		it("returns false when only apiProvider is costrict without experiment enabled", async () => {
			// NOTE: experiments.isEnabled returns false (not undefined),
			// so the ?? operator does not fall through to the apiProvider check.
			// This preserves the existing behaviour of the original GitCommitListener.
			const provider = {
				getState: vi.fn().mockResolvedValue({
					experiments: {},
					apiConfiguration: { apiProvider: "costrict" },
				}),
			} as any
			const reviewService = {
				getProvider: vi.fn(() => provider),
			} as any

			const handler = new ClassicGitCommitReviewHandler(reviewService)

			const result = await handler.shouldOfferReview({ repo: {} as any, commit: {} as any })
			expect(result).toBe(false)
		})

		it("returns false when no experiment and not costrict", async () => {
			const provider = {
				getState: vi.fn().mockResolvedValue({
					experiments: {},
					apiConfiguration: { apiProvider: "other" },
				}),
			} as any
			const reviewService = {
				getProvider: vi.fn(() => provider),
			} as any

			const handler = new ClassicGitCommitReviewHandler(reviewService)

			const result = await handler.shouldOfferReview({ repo: {} as any, commit: {} as any })
			expect(result).toBe(false)
		})
	})

	describe("startReview", () => {
		it("creates a review task with COMMIT target type", async () => {
			const reviewService = {
				checkApiProviderSupport: vi.fn().mockResolvedValue(true),
				buildReviewPrompt: vi.fn().mockResolvedValue("review prompt"),
				createReviewTask: vi.fn().mockResolvedValue(undefined),
			} as any

			const handler = new ClassicGitCommitReviewHandler(reviewService)
			const commit = { hash: "abc123", message: "feat: test" } as any

			await handler.startReview({ repo: {} as any, commit })

			expect(reviewService.buildReviewPrompt).toHaveBeenCalledWith("review", "commit abc123")
			expect(reviewService.createReviewTask).toHaveBeenCalledWith(
				"review prompt",
				{ type: "commit", commit: "abc123" },
				{ mode: "review" },
			)
		})

		it("returns early when API provider is not supported", async () => {
			const reviewService = {
				checkApiProviderSupport: vi.fn().mockResolvedValue(false),
				buildReviewPrompt: vi.fn(),
				createReviewTask: vi.fn(),
			} as any

			const handler = new ClassicGitCommitReviewHandler(reviewService)

			await handler.startReview({ repo: {} as any, commit: { hash: "abc123" } as any })

			expect(reviewService.buildReviewPrompt).not.toHaveBeenCalled()
			expect(reviewService.createReviewTask).not.toHaveBeenCalled()
		})
	})
})
