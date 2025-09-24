/**
 * Tests for coworkflow commands functionality
 */

import * as vscode from "vscode"
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import {
	registerCoworkflowCommands,
	setCommandHandlerDependencies,
	clearCommandHandlerDependencies,
	COWORKFLOW_COMMANDS,
	isCoworkflowDocument,
} from "../commands"
import { CoworkflowCodeLens } from "../types"
import { supportPrompt } from "../../../../shared/support-prompt"

// Mock vscode module
vi.mock("vscode", () => ({
	commands: {
		registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
		executeCommand: vi.fn(),
	},
	window: {
		showInformationMessage: vi.fn(),
		showWarningMessage: vi.fn(),
		showErrorMessage: vi.fn(),
		activeTextEditor: undefined,
		createOutputChannel: vi.fn(() => ({
			appendLine: vi.fn(),
			show: vi.fn(),
			dispose: vi.fn(),
		})),
		createTextEditorDecorationType: vi.fn(() => ({
			dispose: vi.fn(),
		})),
	},
	workspace: {
		getWorkspaceFolder: vi.fn(),
		createFileSystemWatcher: vi.fn(() => ({
			onDidChange: vi.fn(),
			onDidCreate: vi.fn(),
			onDidDelete: vi.fn(),
			dispose: vi.fn(),
		})),
	},
	Uri: {
		file: vi.fn((path: string) => ({ fsPath: path, path })),
	},
	Range: vi.fn((start, end) => ({ start, end })),
	Selection: vi.fn(),
	TextEditorRevealType: {
		InCenter: 1,
	},
	env: {
		uriScheme: "vscode",
	},
	RelativePattern: vi.fn((base, pattern) => ({ base, pattern })),
}))

// Mock supportPrompt
vi.mock("../../../../shared/support-prompt", () => ({
	supportPrompt: {
		create: vi.fn((type: string, params: any) => `Mock prompt for ${type} with params: ${JSON.stringify(params)}`),
	},
}))

// Mock ClineProvider
const mockHandleWorkflowAction = vi.fn()
const mockClineProvider = {
	getInstance: vi.fn().mockResolvedValue({
		getCurrentTask: vi.fn().mockReturnValue({
			clineMessages: [],
			checkpointService: {
				isInitialized: true,
				git: { show: vi.fn() },
			},
		}), // 返回有效的 task 对象
	}),
	handleWorkflowAction: mockHandleWorkflowAction,
}

vi.mock("../../webview/ClineProvider", () => ({
	ClineProvider: {
		...mockClineProvider,
		handleWorkflowAction: mockHandleWorkflowAction, // 静态方法需要直接在类上定义
	},
}))

// Mock diff-utils
vi.mock("./diff-utils", () => ({
	getCospecFileDiff: vi.fn().mockResolvedValue({
		filePath: "test.md",
		checkpointContent: null,
		localContent: null,
		diffString: null,
		hasDifference: false,
	}),
}))

// Mock utils/path
vi.mock("../../../utils/path", () => ({
	getWorkspacePath: vi.fn().mockReturnValue("/test"),
}))

// Mock SectionContentExtractor
vi.mock("./SectionContentExtractor", () => ({
	SectionContentExtractor: vi.fn().mockImplementation(() => ({
		extractContentForCodeLens: vi.fn().mockResolvedValue({
			success: true,
			content: "Test document content",
			type: "selection",
		}),
	})),
	createContentExtractionContext: vi.fn().mockReturnValue({}),
}))

// Mock path module
vi.mock("path", async (importOriginal) => {
	const actual = (await importOriginal()) as any
	return {
		...actual,
		default: {
			dirname: vi.fn((p: string) => p.split("/").slice(0, -1).join("/")),
			relative: vi.fn((from: string, to: string) => to.replace(from, "").replace(/^\//, "")),
			join: vi.fn((...paths: string[]) => paths.join("/")),
		},
	}
})

describe("Coworkflow Commands", () => {
	let mockContext: vscode.ExtensionContext
	let mockCodeLens: CoworkflowCodeLens

	beforeEach(() => {
		vi.clearAllMocks()

		mockContext = {
			subscriptions: [],
		} as any

		mockCodeLens = {
			range: new vscode.Range(0, 0, 0, 10),
			command: {
				title: "Test Command",
				command: "test.command",
			},
			documentType: "requirements",
			actionType: "update",
			context: {
				sectionTitle: "Test Section",
				lineNumber: 0,
			},
		} as CoworkflowCodeLens

		// Mock active editor
		const mockDocument = {
			uri: vscode.Uri.file("/test/.cospec/requirements.md"),
			getText: vi.fn(() => "Test document content"),
			lineCount: 10,
		}

		const mockEditor = {
			document: mockDocument,
			selection: {
				isEmpty: false,
			},
		}

		vi.mocked(vscode.window).activeTextEditor = mockEditor as any
		vi.mocked(vscode.workspace.getWorkspaceFolder).mockReturnValue({
			uri: vscode.Uri.file("/test"),
		} as any)
	})

	afterEach(() => {
		clearCommandHandlerDependencies()
	})

	describe("registerCoworkflowCommands", () => {
		it("should register all coworkflow commands", () => {
			const disposables = registerCoworkflowCommands(mockContext)

			expect(disposables).toHaveLength(5)
			expect(vscode.commands.registerCommand).toHaveBeenCalledTimes(5)

			// Verify all commands are registered
			expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
				expect.stringContaining(COWORKFLOW_COMMANDS.UPDATE_SECTION),
				expect.any(Function),
			)
			expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
				expect.stringContaining(COWORKFLOW_COMMANDS.RUN_TASK),
				expect.any(Function),
			)
			expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
				expect.stringContaining(COWORKFLOW_COMMANDS.RETRY_TASK),
				expect.any(Function),
			)
		})

		it("should handle registration errors gracefully", () => {
			vi.mocked(vscode.commands.registerCommand).mockImplementationOnce(() => {
				throw new Error("Registration failed")
			})

			expect(() => registerCoworkflowCommands(mockContext)).toThrow("Registration failed")
		})
	})

	describe("handleUpdateSection", () => {
		it("should create correct prompt for requirements update", async () => {
			const disposables = registerCoworkflowCommands(mockContext)

			// Get the registered handler
			const registerCalls = vi.mocked(vscode.commands.registerCommand).mock.calls
			const updateSectionCall = registerCalls.find((call) => call[0].includes(COWORKFLOW_COMMANDS.UPDATE_SECTION))
			const handler = updateSectionCall?.[1] as (codeLens: CoworkflowCodeLens) => Promise<void>

			// 模拟用户点击确认按钮
			vi.mocked(vscode.window.showInformationMessage).mockResolvedValue("Execute" as any)

			await handler(mockCodeLens)

			expect(mockHandleWorkflowAction).toHaveBeenCalledWith(
				"WORKFLOW_RQS_UPDATE",
				{
					scope: ".cospec",
					selectedText: "Test document content",
					mode: "architect",
				},
				"architect",
			)

			disposables.forEach((d) => d.dispose())
		})

		it("should create correct prompt for design update", async () => {
			mockCodeLens.documentType = "design"

			const disposables = registerCoworkflowCommands(mockContext)
			const registerCalls = vi.mocked(vscode.commands.registerCommand).mock.calls
			const updateSectionCall = registerCalls.find((call) => call[0].includes(COWORKFLOW_COMMANDS.UPDATE_SECTION))
			const handler = updateSectionCall?.[1] as (codeLens: CoworkflowCodeLens) => Promise<void>

			// 模拟用户点击确认按钮
			vi.mocked(vscode.window.showInformationMessage).mockResolvedValue("Execute" as any)

			await handler(mockCodeLens)

			expect(mockHandleWorkflowAction).toHaveBeenCalledWith(
				"WORKFLOW_DESIGN_UPDATE",
				{
					scope: ".cospec",
					selectedText: "Test document content",
					mode: "task",
				},
				"task",
			)

			disposables.forEach((d) => d.dispose())
		})

		it("should throw error for unsupported document type", async () => {
			mockCodeLens.documentType = "tasks"

			const disposables = registerCoworkflowCommands(mockContext)
			const registerCalls = vi.mocked(vscode.commands.registerCommand).mock.calls
			const updateSectionCall = registerCalls.find((call) => call[0].includes(COWORKFLOW_COMMANDS.UPDATE_SECTION))
			const handler = updateSectionCall?.[1] as (codeLens: CoworkflowCodeLens) => Promise<void>

			await handler(mockCodeLens)

			expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
				expect.stringContaining("Unsupported document type for update"),
			)

			disposables.forEach((d) => d.dispose())
		})
	})

	describe("handleRunTask", () => {
		beforeEach(() => {
			mockCodeLens.documentType = "tasks"
			mockCodeLens.actionType = "run"
			mockCodeLens.context = {
				taskId: "1.1",
				sectionTitle: "Test Task",
				lineNumber: 5,
			}
		})

		it("should create correct prompt for task run", async () => {
			const disposables = registerCoworkflowCommands(mockContext)
			const registerCalls = vi.mocked(vscode.commands.registerCommand).mock.calls
			const runTaskCall = registerCalls.find((call) => call[0].includes(COWORKFLOW_COMMANDS.RUN_TASK))
			const handler = runTaskCall?.[1] as (codeLens: CoworkflowCodeLens) => Promise<void>

			// 模拟用户点击确认按钮
			vi.mocked(vscode.window.showInformationMessage).mockResolvedValue("Execute" as any)

			await handler(mockCodeLens)

			expect(mockHandleWorkflowAction).toHaveBeenCalledWith(
				"WORKFLOW_TASK_RUN",
				{
					scope: ".cospec",
					selectedText: "Test document content",
					mode: "code",
				},
				"code",
			)

			disposables.forEach((d) => d.dispose())
		})

		it("should validate document type", async () => {
			mockCodeLens.documentType = "requirements"

			const disposables = registerCoworkflowCommands(mockContext)
			const registerCalls = vi.mocked(vscode.commands.registerCommand).mock.calls
			const runTaskCall = registerCalls.find((call) => call[0].includes(COWORKFLOW_COMMANDS.RUN_TASK))
			const handler = runTaskCall?.[1] as (codeLens: CoworkflowCodeLens) => Promise<void>

			await handler(mockCodeLens)

			expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
				expect.stringContaining("Run task command requires a tasks document CodeLens"),
			)

			disposables.forEach((d) => d.dispose())
		})
	})

	describe("handleRetryTask", () => {
		beforeEach(() => {
			mockCodeLens.documentType = "tasks"
			mockCodeLens.actionType = "retry"
			mockCodeLens.context = {
				taskId: "2.1",
				sectionTitle: "Retry Task",
				lineNumber: 10,
			}
		})

		it("should create correct prompt for task retry", async () => {
			const disposables = registerCoworkflowCommands(mockContext)
			const registerCalls = vi.mocked(vscode.commands.registerCommand).mock.calls
			const retryTaskCall = registerCalls.find((call) => call[0].includes(COWORKFLOW_COMMANDS.RETRY_TASK))
			const handler = retryTaskCall?.[1] as (codeLens: CoworkflowCodeLens) => Promise<void>

			// 模拟用户点击重试按钮
			vi.mocked(vscode.window.showWarningMessage).mockResolvedValue("Retry" as any)

			await handler(mockCodeLens)

			expect(mockHandleWorkflowAction).toHaveBeenCalledWith(
				"WORKFLOW_TASK_RETRY",
				{
					scope: ".cospec",
					selectedText: "Test document content",
					mode: "code",
				},
				"code",
			)

			disposables.forEach((d) => d.dispose())
		})
	})

	describe("isCoworkflowDocument", () => {
		it("should return true for valid coworkflow documents", () => {
			const requirementsUri = vscode.Uri.file("/test/.cospec/requirements.md")
			const designUri = vscode.Uri.file("/test/.cospec/design.md")
			const tasksUri = vscode.Uri.file("/test/.cospec/tasks.md")

			expect(isCoworkflowDocument(requirementsUri)).toBe(true)
			expect(isCoworkflowDocument(designUri)).toBe(true)
			expect(isCoworkflowDocument(tasksUri)).toBe(true)
		})

		it("should return false for invalid coworkflow documents", () => {
			const invalidUri1 = vscode.Uri.file("/test/requirements.md")
			const invalidUri2 = vscode.Uri.file("/test/.cospec/other.md")
			const invalidUri3 = vscode.Uri.file("/test/.cospec/requirements.txt")

			expect(isCoworkflowDocument(invalidUri1)).toBe(false)
			expect(isCoworkflowDocument(invalidUri2)).toBe(false)
			expect(isCoworkflowDocument(invalidUri3)).toBe(false)
		})
	})

	describe("Command Handler Dependencies", () => {
		it("should set and clear dependencies correctly", () => {
			const mockDependencies = {
				codeLensProvider: { refresh: vi.fn() },
				decorationProvider: { refreshAll: vi.fn() },
				fileWatcher: { initialize: vi.fn() },
			}

			setCommandHandlerDependencies(mockDependencies)

			// Dependencies should be set (we can't directly test this without exposing internals)
			// But we can test that clearCommandHandlerDependencies doesn't throw
			expect(() => clearCommandHandlerDependencies()).not.toThrow()
		})
	})
})
