import { describe, expect, it, vi } from "vitest"

const { mockReportCommit } = vi.hoisted(() => ({
	mockReportCommit: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("../telemetry", () => ({
	getRawCommitReporter: vi.fn(() => ({
		reportCommit: mockReportCommit,
	})),
}))

import { GitCommitListener } from "./gitCommitListener"

describe("GitCommitListener raw commit telemetry", () => {
	it("reports a new commit through the raw commit reporter before saving the last seen hash", async () => {
		const context = {
			globalState: {
				get: vi.fn(() => undefined),
				update: vi.fn().mockResolvedValue(undefined),
			},
		} as any
		const provider = {
			getState: vi.fn().mockResolvedValue({
				experiments: {},
				apiConfiguration: { apiProvider: "costrict" },
			}),
		} as any
		const reviewService = {
			getProvider: vi.fn(() => provider),
			checkApiProviderSupport: vi.fn().mockResolvedValue(false),
			createReviewTask: vi.fn(),
		} as any
		const listener = new GitCommitListener(context, reviewService)
		const repo = {
			getCommit: vi.fn().mockResolvedValue({ hash: "abc123", message: "feat: test" }),
			onDidCommit: vi.fn((cb) => {
				void cb()
				return { dispose: vi.fn() }
			}),
		} as any

		await (listener as any).handleNewCommit(repo)

		expect(mockReportCommit).toHaveBeenCalledWith(repo, { hash: "abc123", message: "feat: test" }, provider)
		expect(context.globalState.update).toHaveBeenCalledWith("lastSeenCommitHash", "abc123")
	})
})
