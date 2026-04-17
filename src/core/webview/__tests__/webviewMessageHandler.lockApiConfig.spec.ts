// npx vitest run core/webview/__tests__/webviewMessageHandler.lockApiConfig.spec.ts

vi.mock("../../../i18n", () => ({
	t: vi.fn((key: string) => key),
	changeLanguage: vi.fn(),
}))

vi.mock("vscode", async (importOriginal) => ({
	...(await importOriginal()),
	extensions: {
		getExtension: (_extensionId: string) => ({
			extensionPath: "/mock/extension/path",
			extensionUri: { fsPath: "/mock/extension/path", path: "/mock/extension/path" },
		}),
		all: [],
	},
	commands: {
		executeCommand: vi.fn().mockResolvedValue(undefined),
	},
	window: {
		showInformationMessage: vi.fn(),
		showErrorMessage: vi.fn(),
		showWarningMessage: vi.fn(),
		createTextEditorDecorationType: vi.fn(() => ({ dispose: vi.fn() })),
		createOutputChannel: vi.fn(() => ({
			appendLine: vi.fn(),
			append: vi.fn(),
			clear: vi.fn(),
			show: vi.fn(),
			hide: vi.fn(),
			dispose: vi.fn(),
		})),
		onDidChangeActiveTextEditor: vi.fn(() => ({ dispose: vi.fn() })),
	},
	workspace: {
		getConfiguration: vi.fn().mockReturnValue({
			get: vi.fn().mockReturnValue([]),
			update: vi.fn(),
		}),
		onDidChangeConfiguration: vi.fn(() => ({ dispose: vi.fn() })),
		onDidSaveTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
		onDidChangeTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
		onDidOpenTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
		onDidCloseTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
	},
}))

import * as vscode from "vscode"
import { webviewMessageHandler } from "../webviewMessageHandler"
import type { ClineProvider } from "../ClineProvider"

describe("webviewMessageHandler - lockApiConfigAcrossModes", () => {
	let mockProvider: {
		context: {
			workspaceState: {
				get: ReturnType<typeof vi.fn>
				update: ReturnType<typeof vi.fn>
			}
		}
		contextProxy: {
			getValue: ReturnType<typeof vi.fn>
			setValue: ReturnType<typeof vi.fn>
		}
		getState: ReturnType<typeof vi.fn>
		postStateToWebview: ReturnType<typeof vi.fn>
		activateProviderProfile: ReturnType<typeof vi.fn>
		renameStickyProviderProfileInTaskHistory: ReturnType<typeof vi.fn>
		clearDeletedProviderProfileFromTaskHistory: ReturnType<typeof vi.fn>
		log: ReturnType<typeof vi.fn>
		providerSettingsManager: {
			setModeConfig: ReturnType<typeof vi.fn>
			listConfig: ReturnType<typeof vi.fn>
			getProfile: ReturnType<typeof vi.fn>
			saveConfig: ReturnType<typeof vi.fn>
			deleteConfig: ReturnType<typeof vi.fn>
		}
		postMessageToWebview: ReturnType<typeof vi.fn>
		getCurrentTask: ReturnType<typeof vi.fn>
	}

	beforeEach(() => {
		vi.clearAllMocks()

		mockProvider = {
			context: {
				workspaceState: {
					get: vi.fn(),
					update: vi.fn().mockResolvedValue(undefined),
				},
			},
			contextProxy: {
				getValue: vi.fn((key: string) => {
					if (key === "currentApiConfigName") {
						return "active-config"
					}
					return undefined
				}),
				setValue: vi.fn().mockResolvedValue(undefined),
			},
			getState: vi.fn().mockResolvedValue({
				currentApiConfigName: "test-config",
				listApiConfigMeta: [{ name: "test-config", id: "config-123" }],
				customModes: [],
			}),
			postStateToWebview: vi.fn(),
			activateProviderProfile: vi.fn().mockResolvedValue(undefined),
			renameStickyProviderProfileInTaskHistory: vi.fn().mockResolvedValue(undefined),
			clearDeletedProviderProfileFromTaskHistory: vi.fn().mockResolvedValue(undefined),
			log: vi.fn(),
			providerSettingsManager: {
				setModeConfig: vi.fn(),
				listConfig: vi.fn().mockResolvedValue([
					{ name: "active-config", id: "config-active" },
					{ name: "other-config", id: "config-other" },
					{ name: "renamed-config", id: "config-other" },
				]),
				getProfile: vi.fn().mockResolvedValue({ id: "config-other" }),
				saveConfig: vi.fn().mockResolvedValue("config-other"),
				deleteConfig: vi.fn().mockResolvedValue(undefined),
			},
			postMessageToWebview: vi.fn(),
			getCurrentTask: vi.fn(),
		}
	})

	it("sets lockApiConfigAcrossModes to true and posts state without mode config fan-out", async () => {
		await webviewMessageHandler(mockProvider as unknown as ClineProvider, {
			type: "lockApiConfigAcrossModes",
			bool: true,
		})

		expect(mockProvider.context.workspaceState.update).toHaveBeenCalledWith("lockApiConfigAcrossModes", true)
		expect(mockProvider.providerSettingsManager.setModeConfig).not.toHaveBeenCalled()
		expect(mockProvider.postStateToWebview).toHaveBeenCalled()
	})

	it("sets lockApiConfigAcrossModes to false without applying to all modes", async () => {
		await webviewMessageHandler(mockProvider as unknown as ClineProvider, {
			type: "lockApiConfigAcrossModes",
			bool: false,
		})

		expect(mockProvider.context.workspaceState.update).toHaveBeenCalledWith("lockApiConfigAcrossModes", false)
		expect(mockProvider.providerSettingsManager.setModeConfig).not.toHaveBeenCalled()
		expect(mockProvider.postStateToWebview).toHaveBeenCalled()
	})

	it("does not activate another profile when renaming a non-current profile", async () => {
		await webviewMessageHandler(
			mockProvider as unknown as ClineProvider,
			{
				type: "renameApiConfiguration",
				values: { oldName: "other-config", newName: "renamed-config" },
				apiConfiguration: { apiProvider: "anthropic" },
			} as any,
		)

		expect(mockProvider.providerSettingsManager.saveConfig).toHaveBeenCalledWith(
			"renamed-config",
			expect.objectContaining({ id: "config-other" }),
		)
		expect(mockProvider.providerSettingsManager.deleteConfig).toHaveBeenCalledWith("other-config")
		expect(mockProvider.renameStickyProviderProfileInTaskHistory).toHaveBeenCalledWith(
			"other-config",
			"renamed-config",
		)
		expect(mockProvider.activateProviderProfile).not.toHaveBeenCalled()
		expect(mockProvider.contextProxy.setValue).toHaveBeenCalledWith("listApiConfigMeta", expect.any(Array))
		expect(mockProvider.postStateToWebview).toHaveBeenCalled()
	})

	it("does not activate another profile when deleting a non-current profile", async () => {
		vi.mocked(vscode.window.showInformationMessage).mockResolvedValue("common:answers.yes" as never)

		await webviewMessageHandler(
			mockProvider as unknown as ClineProvider,
			{
				type: "deleteApiConfiguration",
				text: "other-config",
			} as any,
		)

		expect(vscode.window.showInformationMessage).toHaveBeenCalled()
		expect(mockProvider.providerSettingsManager.deleteConfig).toHaveBeenCalledWith("other-config")
		expect(mockProvider.clearDeletedProviderProfileFromTaskHistory).toHaveBeenCalledWith("other-config")
		expect(mockProvider.activateProviderProfile).not.toHaveBeenCalled()
		expect(mockProvider.contextProxy.setValue).toHaveBeenCalledWith("listApiConfigMeta", expect.any(Array))
		expect(mockProvider.postStateToWebview).toHaveBeenCalled()
	})
})
