import { EventEmitter } from "node:events"

import { RooCodeEventName } from "@roo-code/types"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { IssueStatus, ReviewTargetType, ReviewTaskStatus } from "../../../shared/codeReview"
import { fileExistsAtPath } from "../../../utils/fs"
import { CodeReviewService } from "./codeReviewService"

vi.mock("vscode", () => ({
	window: {
		showInformationMessage: vi.fn(),
		showWarningMessage: vi.fn(),
		showErrorMessage: vi.fn(),
		createOutputChannel: vi.fn(() => ({
			appendLine: vi.fn(),
			append: vi.fn(),
			show: vi.fn(),
			dispose: vi.fn(),
		})),
	},
	workspace: {
		applyEdit: vi.fn().mockResolvedValue(true),
	},
	Uri: {
		joinPath: vi.fn((...parts: Array<{ fsPath?: string } | string>) => ({
			fsPath: parts.map((part) => (typeof part === "string" ? part : (part.fsPath ?? ""))).join("/"),
		})),
		file: vi.fn((fsPath: string) => ({ fsPath })),
	},
	MarkdownString: class {
		constructor(public value: string) {}
	},
	CommentMode: {
		Preview: 0,
	},
	Range: class {
		constructor(..._args: any[]) {}
	},
	WorkspaceEdit: class {
		replace = vi.fn()
	},
}))

vi.mock("./HistoryManager", () => ({
	HistoryManager: class {
		addEntry = vi.fn().mockResolvedValue(undefined)
		loadAll = vi.fn().mockResolvedValue([])
		deleteEntry = vi.fn().mockResolvedValue(undefined)
		dispose = vi.fn().mockResolvedValue(undefined)
	},
}))

vi.mock("./api", () => ({
	updateIssueStatusAPI: vi.fn(),
	getPrompt: vi.fn(),
	reportIssue: vi.fn(),
	getIssueByTaskId: vi.fn(),
}))

vi.mock("../../../utils/logger", () => ({
	createLogger: vi.fn(() => ({
		info: vi.fn(),
		error: vi.fn(),
	})),
}))

vi.mock("../../../utils/getClientId", () => ({
	getClientId: vi.fn(() => "client-1"),
}))

vi.mock("../../../i18n", () => ({
	t: vi.fn((key: string) => key),
}))

vi.mock("../../../shared/package", () => ({
	Package: {
		outputChannel: {},
	},
}))

vi.mock("../auth", () => ({
	ZgsmAuthConfig: {
		getInstance: vi.fn(() => ({
			getDefaultApiBaseUrl: vi.fn(() => "https://example.test"),
		})),
	},
	ZgsmAuthService: {
		openStatusBarLoginTip: vi.fn().mockResolvedValue(undefined),
	},
}))

vi.mock("../../../integrations/comment", () => ({
	CommentService: class {},
}))

vi.mock("@roo-code/telemetry", () => ({
	TelemetryService: {
		instance: {
			captureError: vi.fn(),
		},
	},
}))

vi.mock("../../../shared/headers", () => ({
	COSTRICT_DEFAULT_HEADERS: {},
}))

vi.mock("../../../utils/fs", () => ({
	fileExistsAtPath: vi.fn().mockResolvedValue(true),
}))

vi.mock("../../../utils/platform", () => ({
	isJetbrainsPlatform: vi.fn(() => false),
}))

vi.mock("./reviewComment", () => ({
	ReviewComment: class {},
}))

class FakeTask extends EventEmitter {
	public readonly clineMessages: any[] = []
	public readonly updateMode = vi.fn()

	constructor(
		public readonly taskId: string,
		public readonly instanceId: string,
	) {
		super()
	}
}

class FakeProvider extends EventEmitter {
	public readonly cwd = "/workspace"
	public readonly contextProxy = { extensionUri: { fsPath: "/extension" } }
	public readonly postMessageToWebview = vi.fn()
	public readonly createTask = vi.fn<(...args: any[]) => Promise<FakeTask>>()
	public readonly getMode = vi.fn(async () => "code")
	public readonly handleModeSwitch = vi.fn(async () => undefined)
	public readonly removeClineFromStack = vi.fn(async () => undefined)
	public readonly refreshWorkspace = vi.fn(async () => undefined)
	public readonly getCurrentTask = vi.fn<() => FakeTask | undefined>()
}

function getReviewUpdates(provider: FakeProvider) {
	return provider.postMessageToWebview.mock.calls
		.map(([message]) => message)
		.filter((message) => message?.type === "reviewTaskUpdate")
}

describe("CodeReviewService delegation lifecycle", () => {
	beforeEach(() => {
		vi.useFakeTimers()
		vi.clearAllMocks()
		;(CodeReviewService as any).instance = null
	})

	afterEach(async () => {
		const instance = (CodeReviewService as any).instance as CodeReviewService | null
		await instance?.dispose()
		;(CodeReviewService as any).instance = null
		vi.useRealTimers()
	})

	it("keeps the review alive across delegated subtasks and completes on the resumed root task", async () => {
		const provider = new FakeProvider()
		const rootTask = new FakeTask("review-root", "inst-root")
		let currentTask: FakeTask | undefined = rootTask

		provider.createTask.mockResolvedValue(rootTask)
		provider.getCurrentTask.mockImplementation(() => currentTask)

		const service = CodeReviewService.getInstance()
		service.setProvider(provider as any)

		vi.spyOn(service as any, "getIssues").mockResolvedValue({
			issues: [
				{
					id: "issue-1",
					file_path: "src/a.ts",
					start_line: 1,
					end_line: 1,
					title: "Issue",
					message: "Problem found",
					status: IssueStatus.INITIAL,
				},
			],
			review_task_id: "review-task-1",
			title: "Security review",
			conclusion: "Done",
		})

		await service.createReviewTask(
			"@/src/a.ts",
			{
				type: ReviewTargetType.FILE,
				data: [{ file_path: "src/a.ts" }],
			} as any,
			{ mode: "security-review" },
		)

		rootTask.emit(RooCodeEventName.TaskAborted)
		provider.emit(RooCodeEventName.TaskDelegated, "review-root", "child-1")
		await vi.advanceTimersByTimeAsync(350)

		expect(
			getReviewUpdates(provider).some(
				(update) =>
					update.values.status === ReviewTaskStatus.ERROR &&
					update.values.data.error === "common:review.tip.task_cancelled",
			),
		).toBe(false)

		const resumedTask = new FakeTask("review-root", "inst-root-2")
		resumedTask.clineMessages.push({
			type: "say",
			say: "completion_result",
			text: "I-AM-CODE-REVIEW-REPORT-V1 final report",
			partial: false,
		})
		currentTask = resumedTask

		provider.emit(RooCodeEventName.TaskCreated, resumedTask as any)
		provider.emit(RooCodeEventName.TaskDelegationResumed, "review-root", "child-1")
		resumedTask.emit(RooCodeEventName.Message, {
			message: resumedTask.clineMessages[0],
		})

		await vi.runAllTimersAsync()

		expect(fileExistsAtPath).toHaveBeenCalledWith("/workspace/src/a.ts")
		expect(service.getAllCachedIssues()).toHaveLength(1)

		const reviewUpdates = getReviewUpdates(provider)
		expect(
			reviewUpdates.some(
				(update) =>
					update.values.status === ReviewTaskStatus.ERROR &&
					update.values.data.error === "common:review.tip.task_cancelled",
			),
		).toBe(false)

		const finalUpdate = reviewUpdates.at(-1)
		expect(finalUpdate?.values.status).toBe(ReviewTaskStatus.COMPLETED)
		expect(finalUpdate?.values.data.error).toBeUndefined()
		expect(finalUpdate?.values.data.issues).toHaveLength(1)
		expect(provider.removeClineFromStack).toHaveBeenCalledTimes(1)
		expect(resumedTask.updateMode).toHaveBeenCalledWith("code")
	})
})
