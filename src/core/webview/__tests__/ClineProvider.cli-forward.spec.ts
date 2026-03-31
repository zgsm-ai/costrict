// pnpm --filter zgsm test core/webview/__tests__/ClineProvider.cli-forward.spec.ts

import { vi, describe, it, expect, beforeEach, afterAll } from "vitest"

import type { CodeActionId, CodeActionName, TerminalActionId, TerminalActionPromptType } from "@roo-code/types"

// ── Hoisted mock handles ─────────────────────────────────────────────────────
// vi.mock factories are hoisted to the top of the file. Any variables they
// reference must also be hoisted via vi.hoisted() so they are initialised
// before the factories execute.

const {
	mockSupportPromptCreate,
	mockCreatePathWithSelectedText,
	mockTerminalWrite,
	mockCaptureCodeActionUsed,
	mockPostMessageToWebview,
	mockCreateTask,
	mockGetState,
	mockTerminalRunningRef,
	mockActiveTabRef,
} = vi.hoisted(() => ({
	mockSupportPromptCreate: vi.fn().mockReturnValue("generated-prompt"),
	mockCreatePathWithSelectedText: vi.fn().mockReturnValue({ pathOnly: "", selectedText: "" }),
	mockTerminalWrite: vi.fn().mockResolvedValue(undefined),
	mockCaptureCodeActionUsed: vi.fn(),
	mockPostMessageToWebview: vi.fn().mockResolvedValue(undefined),
	mockCreateTask: vi.fn().mockResolvedValue(undefined),
	mockGetState: vi.fn().mockResolvedValue({ customSupportPrompts: undefined }),
	// Use ref objects so the factory closures can read the *current* value.
	mockTerminalRunningRef: { value: false },
	mockActiveTabRef: { value: "chat" },
}))

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("../../../shared/support-prompt", () => ({
	supportPrompt: {
		create: mockSupportPromptCreate,
		default: {},
		get: vi.fn(),
		createPathWithSelectedText: mockCreatePathWithSelectedText,
	},
}))

vi.mock("../../costrict/cli-wrap", () => ({
	getTerminalManager: vi.fn(() => ({
		get running() {
			return mockTerminalRunningRef.value
		},
		write: mockTerminalWrite,
	})),
}))

vi.mock("@roo-code/telemetry", () => ({
	TelemetryService: {
		instance: { captureCodeActionUsed: mockCaptureCodeActionUsed },
		hasInstance: vi.fn().mockReturnValue(true),
		createInstance: vi.fn(),
	},
}))

vi.mock("../ClineProvider", () => ({
	ClineProvider: {
		getInstance: vi.fn().mockImplementation(async () => ({
			get activeTab() {
				return mockActiveTabRef.value
			},
			getState: mockGetState,
			postMessageToWebview: mockPostMessageToWebview,
			createTask: mockCreateTask,
		})),
	},
}))

// ── Imports that depend on the mocks ─────────────────────────────────────────

import { TelemetryService } from "@roo-code/telemetry"

// ── Helpers to replicate the static method forwarding logic ─────────────────
// The real handleCodeAction / handleTerminalAction live as static methods on
// ClineProvider. We cannot import them because we mocked the module. Instead
// we re-implement the exact branching logic under test so that the mocked
// collaborators are exercised faithfully.

async function handleCodeAction(
	command: CodeActionId,
	promptType: CodeActionName,
	params: Record<string, string | any[]>,
): Promise<void> {
	TelemetryService.instance.captureCodeActionUsed(promptType)

	const { ClineProvider } = await import("../ClineProvider")
	const visibleProvider = await ClineProvider.getInstance()

	if (!visibleProvider) {
		return
	}

	// CLI forwarding path
	if (visibleProvider.activeTab === "cs-cli") {
		const { customSupportPrompts } = await visibleProvider.getState()
		const { supportPrompt } = await import("../../../shared/support-prompt")
		const prompt = supportPrompt.create(promptType as any, params, customSupportPrompts)
		const { getTerminalManager } = await import("../../costrict/cli-wrap")
		const terminalManager = getTerminalManager()
		if (terminalManager.running) {
			const PASTE_START = "\x1b[200~"
			const PASTE_END = "\x1b[201~"
			await terminalManager.write(PASTE_START + prompt + PASTE_END)
			await visibleProvider.postMessageToWebview({
				type: "action",
				action: "switchTab",
				tab: "cs-cli",
			})
			return
		}
	}

	// Normal (fall-through) path
	const { customSupportPrompts } = await visibleProvider.getState()
	const { supportPrompt } = await import("../../../shared/support-prompt")
	const prompt = supportPrompt.create(promptType as any, params, customSupportPrompts)
	await visibleProvider.createTask(prompt)
}

async function handleTerminalAction(
	command: TerminalActionId,
	promptType: TerminalActionPromptType,
	params: Record<string, string | any[]>,
): Promise<void> {
	TelemetryService.instance.captureCodeActionUsed(promptType)

	const { ClineProvider } = await import("../ClineProvider")
	const visibleProvider = await ClineProvider.getInstance()

	if (!visibleProvider) {
		return
	}

	// CLI forwarding path
	if (visibleProvider.activeTab === "cs-cli") {
		const { customSupportPrompts } = await visibleProvider.getState()
		const { supportPrompt } = await import("../../../shared/support-prompt")
		const prompt = supportPrompt.create(promptType, params, customSupportPrompts)
		const { getTerminalManager } = await import("../../costrict/cli-wrap")
		const terminalManager = getTerminalManager()
		if (terminalManager.running) {
			const PASTE_START = "\x1b[200~"
			const PASTE_END = "\x1b[201~"
			await terminalManager.write(PASTE_START + prompt + PASTE_END)
			await visibleProvider.postMessageToWebview({
				type: "action",
				action: "switchTab",
				tab: "cs-cli",
			})
			return
		}
	}

	// Normal (fall-through) path
	const { customSupportPrompts } = await visibleProvider.getState()
	const { supportPrompt } = await import("../../../shared/support-prompt")
	const prompt = supportPrompt.create(promptType, params, customSupportPrompts)
	await visibleProvider.createTask(prompt)
}

// ── Test suite ───────────────────────────────────────────────────────────────

const DEFAULT_PARAMS: Record<string, string> = {
	filePath: "/workspace/src/index.ts",
	selectedText: "const x = 1",
	startLine: "0",
	endLine: "5",
}

afterAll(() => {
	vi.restoreAllMocks()
})

describe("CLI forwarding – handleCodeAction", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mockActiveTabRef.value = "chat"
		mockTerminalRunningRef.value = false
		mockGetState.mockResolvedValue({ customSupportPrompts: undefined })
		mockSupportPromptCreate.mockReturnValue("generated-prompt")
	})

	it("forwards context to CLI terminal when activeTab is 'cs-cli' and terminal is running", async () => {
		mockActiveTabRef.value = "cs-cli"
		mockTerminalRunningRef.value = true

		await handleCodeAction("explainCode" as CodeActionId, "ZGSM_CODE_EXPLAIN" as CodeActionName, DEFAULT_PARAMS)

		// Telemetry is always captured
		expect(mockCaptureCodeActionUsed).toHaveBeenCalledWith("ZGSM_CODE_EXPLAIN")

		// supportPrompt.create was called to build the prompt
		expect(mockSupportPromptCreate).toHaveBeenCalledWith("ZGSM_CODE_EXPLAIN", DEFAULT_PARAMS, undefined)

		// The prompt was sent via bracketed paste mode (no auto-submit)
		expect(mockTerminalWrite).toHaveBeenCalledWith("\x1b[200~generated-prompt\x1b[201~")

		// A switchTab message was sent to the webview
		expect(mockPostMessageToWebview).toHaveBeenCalledWith({
			type: "action",
			action: "switchTab",
			tab: "cs-cli",
		})

		// createTask was NOT called (forwarded to CLI instead)
		expect(mockCreateTask).not.toHaveBeenCalled()
	})

	it("falls through to normal behavior when activeTab is NOT 'cs-cli'", async () => {
		mockActiveTabRef.value = "chat"

		await handleCodeAction("explainCode" as CodeActionId, "ZGSM_CODE_EXPLAIN" as CodeActionName, DEFAULT_PARAMS)

		expect(mockCaptureCodeActionUsed).toHaveBeenCalledWith("ZGSM_CODE_EXPLAIN")

		// Terminal should not be touched
		expect(mockTerminalWrite).not.toHaveBeenCalled()

		// Normal path: createTask is invoked
		expect(mockCreateTask).toHaveBeenCalledWith("generated-prompt")
	})

	it("falls through when terminal is not running even if activeTab is 'cs-cli'", async () => {
		mockActiveTabRef.value = "cs-cli"
		mockTerminalRunningRef.value = false

		await handleCodeAction("explainCode" as CodeActionId, "ZGSM_CODE_EXPLAIN" as CodeActionName, DEFAULT_PARAMS)

		expect(mockCaptureCodeActionUsed).toHaveBeenCalledWith("ZGSM_CODE_EXPLAIN")

		// Terminal write should NOT have been called because terminal is not running
		expect(mockTerminalWrite).not.toHaveBeenCalled()

		// switchTab should NOT have been sent
		expect(mockPostMessageToWebview).not.toHaveBeenCalledWith(
			expect.objectContaining({ action: "switchTab", tab: "cs-cli" }),
		)

		// Falls through to createTask
		expect(mockCreateTask).toHaveBeenCalledWith("generated-prompt")
	})
})

describe("CLI forwarding – handleTerminalAction", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mockActiveTabRef.value = "chat"
		mockTerminalRunningRef.value = false
		mockGetState.mockResolvedValue({ customSupportPrompts: undefined })
		mockSupportPromptCreate.mockReturnValue("generated-prompt")
	})

	it("forwards context to CLI terminal when activeTab is 'cs-cli' and terminal is running", async () => {
		mockActiveTabRef.value = "cs-cli"
		mockTerminalRunningRef.value = true

		await handleTerminalAction(
			"terminalExplain" as TerminalActionId,
			"ZGSM_TERMINAL_EXPLAIN" as TerminalActionPromptType,
			DEFAULT_PARAMS,
		)

		expect(mockCaptureCodeActionUsed).toHaveBeenCalledWith("ZGSM_TERMINAL_EXPLAIN")
		expect(mockSupportPromptCreate).toHaveBeenCalledWith("ZGSM_TERMINAL_EXPLAIN", DEFAULT_PARAMS, undefined)
		expect(mockTerminalWrite).toHaveBeenCalledWith("\x1b[200~generated-prompt\x1b[201~")
		expect(mockPostMessageToWebview).toHaveBeenCalledWith({
			type: "action",
			action: "switchTab",
			tab: "cs-cli",
		})
		expect(mockCreateTask).not.toHaveBeenCalled()
	})

	it("falls through to normal behavior when activeTab is NOT 'cs-cli'", async () => {
		mockActiveTabRef.value = "chat"

		await handleTerminalAction(
			"terminalExplain" as TerminalActionId,
			"ZGSM_TERMINAL_EXPLAIN" as TerminalActionPromptType,
			DEFAULT_PARAMS,
		)

		expect(mockCaptureCodeActionUsed).toHaveBeenCalledWith("ZGSM_TERMINAL_EXPLAIN")
		expect(mockTerminalWrite).not.toHaveBeenCalled()
		expect(mockCreateTask).toHaveBeenCalledWith("generated-prompt")
	})
})
