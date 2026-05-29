import { EventEmitter } from "node:events"
import path from "node:path"

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
	CostrictAuthConfig: {
		getInstance: vi.fn(() => ({
			getDefaultApiBaseUrl: vi.fn(() => "https://example.test"),
		})),
	},
	CostrictAuthService: {
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

// Mock common review modules used by CodeReviewService
const resolveFromReportFileMock = vi.fn()
const resolveFromReportTextMock = vi.fn()
const buildReviewRequestOptionsMock = vi.fn()

vi.mock("./common/reviewIssueResolver", () => ({
	buildReviewRequestOptions: (...args: any[]) => buildReviewRequestOptionsMock(...args),
	getReviewReportJsonPath: vi.fn((cwd: string, _mode: string) => `${cwd}/code-review_result/review-report.json`),
	getFullReportJsonlPath: vi.fn((cwd: string, _mode: string) => `${cwd}/code-review_result/full_report.jsonl`),
	resolveFromReportFile: (...args: any[]) => resolveFromReportFileMock(...args),
	resolveFromReportText: (...args: any[]) => resolveFromReportTextMock(...args),
}))

// Default: resolveFromReportFile returns empty (overridden per test)
resolveFromReportFileMock.mockResolvedValue({
	issues: [],
	review_task_id: "",
	count: 0,
	title: "",
	conclusion: "",
})

// Default: buildReviewRequestOptions returns empty config
buildReviewRequestOptionsMock.mockReturnValue({})

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
	public readonly getState = vi.fn(async () => ({
		apiConfiguration: {
			costrictAccessToken: "test-token",
			costrictBaseUrl: "https://example.test",
		},
		language: "en",
	}))
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

		// JSON report exists
		;(fileExistsAtPath as any).mockResolvedValue(true)

		resolveFromReportFileMock.mockResolvedValue({
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
			count: 1,
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

		// JSON file existence was checked (the primary path)
		expect(fileExistsAtPath).toHaveBeenCalledWith(
			path.resolve("/workspace", "code-review_result/review-report.json"),
		)

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

	it("resolves issues from review-report.json via the primary path", async () => {
		const provider = new FakeProvider()
		const task = new FakeTask("review-json", "inst-json")

		provider.createTask.mockResolvedValue(task)
		provider.getCurrentTask.mockImplementation(() => task)

		const service = CodeReviewService.getInstance()
		service.setProvider(provider as any)

		// JSON report exists
		;(fileExistsAtPath as any).mockResolvedValue(true)

		resolveFromReportFileMock.mockResolvedValue({
			issues: [
				{
					id: "json-issue-1",
					file_path: "src/json-file.ts",
					start_line: 5,
					end_line: 10,
					title: "JSON Issue",
					message: "Found via JSON",
					status: IssueStatus.INITIAL,
				},
			],
			review_task_id: "json-task-1",
			count: 1,
			title: "JSON Review",
			conclusion: "JSON-based",
		})

		await service.createReviewTask(
			"@/src/json-file.ts",
			{
				type: ReviewTargetType.FILE,
				data: [{ file_path: "src/json-file.ts" }],
			} as any,
			{ mode: "review" },
		)

		// Simulate task completion via completion_result message
		task.clineMessages.push({
			type: "say",
			say: "completion_result",
			text: "I-AM-CODE-REVIEW-REPORT-V1 legacy report",
			partial: false,
		})
		task.emit(RooCodeEventName.Message, {
			message: task.clineMessages[0],
		})

		await vi.runAllTimersAsync()

		// Should have called resolveFromReportFile with the JSON path
		expect(resolveFromReportFileMock).toHaveBeenCalledTimes(1)
		// Should NOT have called resolveFromReportText (no fallback used)
		expect(resolveFromReportTextMock).not.toHaveBeenCalled()

		const issues = service.getAllCachedIssues()
		expect(issues).toHaveLength(1)
		expect(issues[0].id).toBe("json-issue-1")

		const reviewUpdates = getReviewUpdates(provider)
		const finalUpdate = reviewUpdates.at(-1)
		expect(finalUpdate?.values.status).toBe(ReviewTaskStatus.COMPLETED)
		expect(finalUpdate?.values.data.issues).toHaveLength(1)
	})

	it("throws error when review-report.json is not found", async () => {
		const provider = new FakeProvider()
		const task = new FakeTask("review-nofile", "inst-nf")

		provider.createTask.mockResolvedValue(task)
		provider.getCurrentTask.mockImplementation(() => task)

		const service = CodeReviewService.getInstance()
		service.setProvider(provider as any)

		// JSON report does NOT exist
		;(fileExistsAtPath as any).mockResolvedValue(false)

		await service.createReviewTask(
			"@/src/missing.ts",
			{
				type: ReviewTargetType.FILE,
				data: [{ file_path: "src/missing.ts" }],
			} as any,
			{ mode: "review" },
		)

		task.clineMessages.push({
			type: "say",
			say: "completion_result",
			text: "some report text",
			partial: false,
		})
		task.emit(RooCodeEventName.Message, {
			message: task.clineMessages[0],
		})

		await vi.runAllTimersAsync()

		// Should NOT have tried to resolve from file or text
		expect(resolveFromReportFileMock).not.toHaveBeenCalled()
		expect(resolveFromReportTextMock).not.toHaveBeenCalled()

		const reviewUpdates = getReviewUpdates(provider)
		const finalUpdate = reviewUpdates.at(-1)
		expect(finalUpdate?.values.status).toBe(ReviewTaskStatus.ERROR)
	})

	it("throws error when resolveFromReportFile returns no issues", async () => {
		const provider = new FakeProvider()
		const task = new FakeTask("review-empty", "inst-empty")

		provider.createTask.mockResolvedValue(task)
		provider.getCurrentTask.mockImplementation(() => task)

		const service = CodeReviewService.getInstance()
		service.setProvider(provider as any)

		// JSON report exists but resolver returns empty issues
		;(fileExistsAtPath as any).mockResolvedValue(true)

		resolveFromReportFileMock.mockResolvedValue({
			issues: [],
			review_task_id: "",
			count: 0,
			title: "",
			conclusion: "",
		})

		await service.createReviewTask(
			"@/src/empty.ts",
			{
				type: ReviewTargetType.FILE,
				data: [{ file_path: "src/empty.ts" }],
			} as any,
			{ mode: "review" },
		)

		task.clineMessages.push({
			type: "say",
			say: "completion_result",
			text: "empty report",
			partial: false,
		})
		task.emit(RooCodeEventName.Message, {
			message: task.clineMessages[0],
		})

		await vi.runAllTimersAsync()

		// resolveFromReportFile was called but returned empty
		expect(resolveFromReportFileMock).toHaveBeenCalledTimes(1)
		// No fallback to resolveFromReportText
		expect(resolveFromReportTextMock).not.toHaveBeenCalled()

		const reviewUpdates = getReviewUpdates(provider)
		const finalUpdate = reviewUpdates.at(-1)
		expect(finalUpdate?.values.status).toBe(ReviewTaskStatus.ERROR)
	})
})
