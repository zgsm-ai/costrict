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
	it("reports a new commit through the raw commit reporter", async () => {
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
		// NOTE: globalState.update is NOT called because Experiments.isEnabled returns `false`
		// (not `undefined`), and the `??` operator does not fall through to the right side
		// `apiConfiguration?.apiProvider === "costrict"` check. This appears to be a bug
		// in processNewCommit — `||` should likely be used instead of `??` — but the test
		// reflects the current actual behavior.
		expect(context.globalState.update).not.toHaveBeenCalled()
	})
})
