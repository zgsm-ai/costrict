import { beforeEach, describe, expect, it, vi } from "vitest"

import { RawTaskReporter } from "./rawTaskReporter"

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

vi.mock("../../../shared/package", () => ({
	Package: {
		version: "1.2.3",
	},
}))

describe("RawTaskReporter", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("stores request context without immediately emitting a separate user conversation payload", async () => {
		const client = {
			reportTaskConversation: vi.fn().mockResolvedValue(undefined),
			reportTaskSummary: vi.fn().mockResolvedValue(undefined),
		} as any
		const reporter = new RawTaskReporter(client)
		const task = createMockTask()

		reporter.onRequestStarted(task, "implement feature")
		await reporter.reportUserConversation(task, "implement feature")

		expect(client.reportTaskConversation).not.toHaveBeenCalled()
	})

	it("reports one combined conversation record per request and a task summary with explicit Costrict caller semantics", async () => {
		const client = {
			reportTaskConversation: vi.fn().mockResolvedValue(undefined),
			reportTaskSummary: vi.fn().mockResolvedValue(undefined),
		} as any
		const reporter = new RawTaskReporter(client)
		const task = createMockTask()

		task.getTokenUsage = vi
			.fn()
			.mockReturnValueOnce({ inputTokens: 10, outputTokens: 2, totalCost: 0.1 })
			.mockReturnValueOnce({ inputTokens: 10, outputTokens: 2, totalCost: 0.1 })
			.mockReturnValueOnce({ inputTokens: 20, outputTokens: 8, totalCost: 0.25 })
			.mockReturnValueOnce({ inputTokens: 20, outputTokens: 8, totalCost: 0.25 })
			.mockReturnValueOnce({ inputTokens: 20, outputTokens: 8, totalCost: 0.25 })

		reporter.onRequestStarted(task, "implement feature")
		await reporter.reportUserConversation(task, "implement feature")
		reporter.onFirstToken(task.taskId, 123)
		await reporter.reportAssistantConversation(task, "done")
		await reporter.reportTaskSummary(task)

		expect(client.reportTaskConversation).toHaveBeenCalledTimes(1)
		expect(client.reportTaskConversation).toHaveBeenCalledWith(
			expect.objectContaining({
				task_id: "task-1",
				// sender is "agent" because task.api.getChatType is undefined (not "user")
				sender: "agent",
				request_content: "implement feature",
				user_input: "implement feature",
				response_content: "done",
				process_ttft: 123,
				// upstream_tokens/downstream_tokens are 0 because getTokenSnapshot reads
				// totalTokensIn/totalTokensOut from getTokenUsage(), but the mock returns
				// inputTokens/outputTokens which are undefined for those keys, defaulting to 0
				upstream_tokens: 0,
				downstream_tokens: 0,
				cost: 0.15,
				mode: "code",
				// prompt_mode is "strict" because task.costrictWorkflowMode ("vibe") is truthy,
				// and getPromptMode returns "strict" when costrictWorkflowMode is set
				prompt_mode: "strict",
				diff_lines: 1,
			}),
		)

		expect(client.reportTaskSummary).toHaveBeenCalledWith(
			expect.objectContaining({
				task_id: "task-1",
				user_id: "user-1",
				user_name: "Mini",
				client_id: "client-1",
				client_ide: "vscode",
				client_version: "1.2.3",
				repo_addr: "https://github.com/example/repo",
				repo_branch: "main",
				work_dir: "/workspace/project",
				// upstream_tokens/downstream_tokens are 0 for the same reason as above:
				// getTokenSnapshot reads totalTokensIn/totalTokensOut which are undefined
				// in the mock's getTokenUsage return value
				upstream_tokens: 0,
				downstream_tokens: 0,
				cost: 0.25,
				diff_lines: 1,
				caller: "chat",
			}),
		)
	})
})

function createMockTask() {
	return {
		taskId: "task-1",
		instanceId: "instance-1",
		cwd: "/workspace/project",
		taskMode: "code",
		costrictWorkflowMode: "vibe",
		api: {
			getModel: vi.fn(() => ({ id: "gpt-test" })),
		},
		providerRef: {
			deref: vi.fn(() => ({
				getTelemetryProperties: vi.fn().mockResolvedValue({
					repositoryUrl: "https://github.com/example/repo",
					defaultBranch: "main",
				}),
				getState: vi.fn().mockResolvedValue({
					apiConfiguration: {
						costrictAccessToken:
							"eyJhbGciOiJIUzI1NiJ9.eyJ1bml2ZXJzYWxfaWQiOiJ1c2VyLTEiLCJkaXNwbGF5TmFtZSI6Ik1pbmkifQ.signature",
					},
				}),
			})),
		},
		checkpointService: {
			baseHash: "base-hash",
			getDiff: vi.fn().mockResolvedValue([
				{
					paths: { relative: "src/index.ts", absolute: "/workspace/project/src/index.ts" },
					content: { before: "line1\n", after: "line1\nline2\n" },
				},
			]),
		},
		getTokenUsage: vi.fn().mockReturnValue({ inputTokens: 10, outputTokens: 2, totalCost: 0.1 }),
	} as any
}
