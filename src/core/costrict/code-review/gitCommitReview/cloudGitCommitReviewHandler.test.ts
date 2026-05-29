import { describe, expect, it, vi } from "vitest"

import { CloudGitCommitReviewHandler } from "./cloudGitCommitReviewHandler"

describe("CloudGitCommitReviewHandler", () => {
	describe("shouldOfferReview", () => {
		it("always returns true", async () => {
			const cloudController = {} as any
			const handler = new CloudGitCommitReviewHandler(cloudController)

			const result = await handler.shouldOfferReview({ repo: {} as any, commit: {} as any })
			expect(result).toBe(true)
		})
	})

	describe("startReview", () => {
		it("calls cloudController.reviewCommitHash with commit hash and resolved workspace folder", async () => {
			const mockReviewCommitHash = vi.fn().mockResolvedValue(undefined)
			const cloudController = {
				reviewCommitHash: mockReviewCommitHash,
			} as any

			const handler = new CloudGitCommitReviewHandler(cloudController)

			const repo = {
				rootUri: { fsPath: "/path/to/repo", scheme: "file" },
			} as any

			const commit = { hash: "abc123", message: "feat: test" } as any

			await handler.startReview({ repo, commit })

			expect(mockReviewCommitHash).toHaveBeenCalledWith("abc123", undefined)
		})
	})
})
