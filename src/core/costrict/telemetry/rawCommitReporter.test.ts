import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { RawCommitReporter } from "./rawCommitReporter"

vi.mock("../../../utils/getClientId", () => ({
	getClientId: vi.fn(() => "client-1"),
}))

vi.mock("../auth", () => ({
	CostrictAuthService: {
		getInstance: vi.fn(() => ({
			getUserInfo: vi.fn(() => ({ id: "user-1", name: "Mini" })),
		})),
	},
}))

describe("RawCommitReporter", () => {
	const originalDisableUserIndicator = process.env.DISABLE_USER_INDICATOR

	beforeEach(() => {
		delete process.env.DISABLE_USER_INDICATOR
		vi.clearAllMocks()
	})

	afterEach(() => {
		if (originalDisableUserIndicator !== undefined) {
			process.env.DISABLE_USER_INDICATOR = originalDisableUserIndicator
		}
	})

	it("builds and reports a commit payload with repo metadata, comment, and diff summary", async () => {
		const client = {
			reportCommit: vi.fn().mockResolvedValue(undefined),
		} as any
		const reporter = new RawCommitReporter(client)
		const repo = createMockRepo()
		const provider = createMockProvider()
		const commit = {
			hash: "abc123",
			message: "feat: add raw commit reporting",
			authorName: "Git User",
			authorEmail: "git@example.com",
			commitDate: new Date("2026-04-08T11:00:00.000Z"),
		} as any

		await reporter.reportCommit(repo, commit, provider)

		expect(client.reportCommit).toHaveBeenCalledWith(
			expect.objectContaining({
				commit_id: "abc123",
				commit_time: "2026-04-08T11:00:00.000Z",
				repo_addr: "https://github.com/example/repo.git",
				repo_branch: "main",
				git_user_name: "Git User",
				git_user_email: "git@example.com",
				user_id: "user-1",
				user_name: "Mini",
				client_id: "client-1",
				work_path: "/workspace/project",
				comment: "feat: add raw commit reporting",
				diff_lines: 1,
			}),
		)
	})

	it("falls back to repo config and sanitizes remote URL when telemetry properties are missing", async () => {
		const client = {
			reportCommit: vi.fn().mockResolvedValue(undefined),
		} as any
		const reporter = new RawCommitReporter(client)
		const repo = createMockRepo({ repositoryUrl: undefined })
		const provider = createMockProvider({ repositoryUrl: undefined, defaultBranch: undefined })
		const commit = {
			hash: "def456",
			message: "fix: fallback metadata",
			commitDate: new Date("2026-04-08T12:00:00.000Z"),
		} as any

		await reporter.reportCommit(repo, commit, provider)

		expect(client.reportCommit).toHaveBeenCalledWith(
			expect.objectContaining({
				commit_id: "def456",
				repo_addr: "https://github.com/example/repo.git",
				repo_branch: "main",
				git_user_name: "Fallback User",
				git_user_email: "fallback@example.com",
				comment: "fix: fallback metadata",
			}),
		)
	})

	it("truncates commit comments to 150 characters", async () => {
		const client = {
			reportCommit: vi.fn().mockResolvedValue(undefined),
		} as any
		const reporter = new RawCommitReporter(client)
		const repo = createMockRepo()
		const provider = createMockProvider()
		const commit = {
			hash: "ghi789",
			message: "x".repeat(180),
			commitDate: new Date("2026-04-08T13:00:00.000Z"),
		} as any

		await reporter.reportCommit(repo, commit, provider)

		expect(client.reportCommit).toHaveBeenCalledWith(
			expect.objectContaining({
				commit_id: "ghi789",
				comment: "x".repeat(150),
			}),
		)
	})
})

function createMockProvider(overrides: { repositoryUrl?: string; defaultBranch?: string } = {}) {
	return {
		cwd: { toPosix: () => "/workspace/project" },
		getTelemetryProperties: vi.fn().mockResolvedValue({
			repositoryUrl: overrides.repositoryUrl ?? "https://github.com/example/repo.git",
			defaultBranch: overrides.defaultBranch ?? "main",
		}),
	} as any
}

function createMockRepo(overrides: { repositoryUrl?: string } = {}) {
	return {
		rootUri: { fsPath: "/workspace/project" },
		state: {
			HEAD: { name: "main" },
		},
		getConfigs: vi
			.fn()
			.mockResolvedValue([
				{ key: "remote.origin.url", value: overrides.repositoryUrl ?? "git@github.com:example/repo.git" },
			]),
		getConfig: vi.fn(async (key: string) => {
			if (key === "user.name") {
				return "Fallback User"
			}
			if (key === "user.email") {
				return "fallback@example.com"
			}
			return ""
		}),
		diffBetween: vi.fn(async (_from: string, _to: string, path?: string) => {
			if (!path) {
				return [{ uri: { fsPath: "/workspace/project/src/index.ts" } }]
			}
			return "@@ -1 +1,2 @@\n line1\n+line2"
		}),
	} as any
}
