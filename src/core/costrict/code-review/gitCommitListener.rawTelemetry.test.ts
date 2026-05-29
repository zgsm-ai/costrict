import { describe, expect, it, vi } from "vitest"

import { GitCommitListener, type GitCommitReviewHandler } from "./gitCommitListener"

describe("GitCommitListener general flow", () => {
	it("delegates reportCommit, shouldOfferReview, and startReview to the handler", async () => {
		const mockReportCommit = vi.fn()
		const mockStartReview = vi.fn()

		const handler: GitCommitReviewHandler = {
			reportCommit: mockReportCommit,
			shouldOfferReview: vi.fn().mockResolvedValue(true),
			startReview: mockStartReview,
		}

		const context = {
			globalState: {
				get: vi.fn(() => undefined),
				update: vi.fn().mockResolvedValue(undefined),
			},
		} as any

		const getHandler = vi.fn(() => handler)
		const listener = new GitCommitListener(context, getHandler)

		const repo = {
			getCommit: vi.fn().mockResolvedValue({ hash: "abc123", message: "feat: test" }),
			onDidCommit: vi.fn((cb) => {
				void cb()
				return { dispose: vi.fn() }
			}),
		} as any

		await (listener as any).handleNewCommit(repo)

		expect(mockReportCommit).toHaveBeenCalledWith({ repo, commit: { hash: "abc123", message: "feat: test" } })
		expect(handler.shouldOfferReview).toHaveBeenCalled()
		expect(mockStartReview).not.toHaveBeenCalled() // user didn't click "Review"
	})

	it("skips duplicate commit hashes", async () => {
		const handler: GitCommitReviewHandler = {
			reportCommit: vi.fn(),
			shouldOfferReview: vi.fn().mockResolvedValue(true),
			startReview: vi.fn(),
		}

		const context = {
			globalState: {
				get: vi.fn(() => undefined),
				update: vi.fn().mockResolvedValue(undefined),
			},
		} as any

		const getHandler = vi.fn(() => handler)
		const listener = new GitCommitListener(context, getHandler)

		// Set a previously seen hash
		;(listener as any).lastSeenCommitHash = "abc123"

		const repo = {
			getCommit: vi.fn().mockResolvedValue({ hash: "abc123", message: "feat: test" }),
		} as any

		await (listener as any).processNewCommit({ hash: "abc123", message: "feat: test" }, repo)

		expect(handler.reportCommit).not.toHaveBeenCalled()
		expect(handler.shouldOfferReview).not.toHaveBeenCalled()
	})

	it("skips notification when shouldOfferReview returns false", async () => {
		const handler: GitCommitReviewHandler = {
			reportCommit: vi.fn(),
			shouldOfferReview: vi.fn().mockResolvedValue(false),
			startReview: vi.fn(),
		}

		const context = {
			globalState: {
				get: vi.fn(() => undefined),
				update: vi.fn().mockResolvedValue(undefined),
			},
		} as any

		const getHandler = vi.fn(() => handler)
		const listener = new GitCommitListener(context, getHandler)

		const repo = {
			getCommit: vi.fn().mockResolvedValue({ hash: "abc123", message: "feat: test" }),
		} as any

		await (listener as any).processNewCommit({ hash: "abc123", message: "feat: test" }, repo)

		expect(handler.reportCommit).toHaveBeenCalled()
		expect(handler.shouldOfferReview).toHaveBeenCalled()
		expect(context.globalState.update).not.toHaveBeenCalled()
	})
})
