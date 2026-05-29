import type { Mock } from "vitest"
import * as vscode from "vscode"
import { ClineProvider } from "../../core/webview/ClineProvider"

import { getCommandsMap, getVisibleProviderOrLog } from "../registerCommands"
import { RemoteAgentInstaller } from "../../core/costrict/remote-agent-installer"

vi.mock("execa", () => ({
	execa: vi.fn(),
}))

vi.mock("../../core/costrict/remote-agent-installer", () => ({
	RemoteAgentInstaller: {
		getInstance: vi.fn(() => ({
			triggerManualInstall: vi.fn(),
			getPackageName: vi.fn().mockReturnValue("Test Package"),
		})),
	},
}))

const mockTerminalManager = {
	running: false,
	write: vi.fn(),
}

vi.mock("../../core/costrict/cli-wrap", () => ({
	getTerminalManager: () => mockTerminalManager,
}))

vi.mock("vscode", async () => {
	return {
		CodeActionKind: {
			QuickFix: { value: "quickfix" },
			RefactorRewrite: { value: "refactor.rewrite" },
		},
		FileType: {
			File: 1,
			Directory: 2,
		},
		Uri: {
			parse: vi.fn(),
		},
		window: {
			createTextEditorDecorationType: vi.fn().mockReturnValue({ dispose: vi.fn() }),
			createOutputChannel: () => ({
				appendLine: vi.fn(),
				show: vi.fn(),
			}),
			showInformationMessage: vi.fn(),
		},
		workspace: {
			workspaceFolders: [
				{
					uri: {
						fsPath: "/mock/workspace",
						path: "/mock/workspace",
					},
				},
			],
			fs: {
				stat: vi.fn(),
			},
			getWorkspaceFolder: vi.fn(),
			createFileSystemWatcher: vi.fn().mockReturnValue({
				onDidCreate: vi.fn().mockReturnValue({ dispose: vi.fn() }),
				onDidChange: vi.fn().mockReturnValue({ dispose: vi.fn() }),
				onDidDelete: vi.fn().mockReturnValue({ dispose: vi.fn() }),
				dispose: vi.fn(),
			}),
		},
		RelativePattern: vi.fn().mockImplementation((base, pattern) => ({ base, pattern })),
		extensions: {
			getExtension: (extensionId: string) => ({
				extensionPath: "/mock/extension/path",
				extensionUri: { fsPath: "/mock/extension/path", path: "/mock/extension/path", scheme: "file" },
				packageJSON: {
					name: "costrict",
					publisher: "zgsm-ai",
					version: "2.0.27",
				},
			}),
			all: [],
		},
		env: {
			uriScheme: "vscode",
		},
	}
})

vi.mock("../../core/webview/ClineProvider")

describe("registerCommands", () => {
	let mockOutputChannel: vscode.OutputChannel

	beforeEach(() => {
		mockOutputChannel = {
			appendLine: vi.fn(),
			append: vi.fn(),
			clear: vi.fn(),
			hide: vi.fn(),
			name: "mock",
			replace: vi.fn(),
			show: vi.fn(),
			dispose: vi.fn(),
		}
		mockTerminalManager.running = false
		mockTerminalManager.write.mockReset()
		vi.clearAllMocks()
		vi.mocked(vscode.Uri.parse).mockReset()
		vi.mocked(vscode.workspace.getWorkspaceFolder).mockReset()
		vi.mocked(vscode.workspace.fs.stat).mockReset()
	})

	it("returns the visible provider if found", () => {
		const mockProvider = {} as ClineProvider
		;(ClineProvider.getVisibleInstance as Mock).mockReturnValue(mockProvider)

		const result = getVisibleProviderOrLog(mockOutputChannel)

		expect(result).toBe(mockProvider)
		expect(mockOutputChannel.appendLine).not.toHaveBeenCalled()
	})

	it("logs and returns undefined if no provider found", () => {
		;(ClineProvider.getVisibleInstance as Mock).mockReturnValue(undefined)

		const result = getVisibleProviderOrLog(mockOutputChannel)

		expect(result).toBeUndefined()
		expect(mockOutputChannel.appendLine).toHaveBeenCalledWith("Cannot find any visible CoStrict instances.")
	})

	it("posts a CLI toast when inserting file paths into a running CoStrict CLI terminal", async () => {
		const mockProvider = {
			cwd: "/mock/workspace",
			activeTab: "cs-cli",
			postMessageToWebview: vi.fn().mockResolvedValue(undefined),
		} as unknown as ClineProvider
		;(ClineProvider.getInstance as Mock).mockResolvedValue(mockProvider)
		mockTerminalManager.running = true
		mockTerminalManager.write.mockResolvedValue(undefined)
		vi.mocked(vscode.Uri.parse).mockReturnValue({
			fsPath: "/mock/workspace/src/file.ts",
			path: "/mock/workspace/src/file.ts",
		} as any)
		vi.mocked(vscode.workspace.getWorkspaceFolder).mockReturnValue({ uri: { path: "/mock/workspace" } } as any)
		vi.mocked(vscode.workspace.fs.stat).mockResolvedValue({ type: vscode.FileType.File } as any)

		const commands = getCommandsMap({
			context: {} as vscode.ExtensionContext,
			outputChannel: mockOutputChannel,
			provider: mockProvider,
		})

		await commands.addFileToContext({
			path: "file:///mock/workspace/src/file.ts",
			external: "file:///mock/workspace/src/file.ts",
			fsPath: "/mock/workspace/src/file.ts",
		})

		expect(mockTerminalManager.write).toHaveBeenCalledWith("\x1b[200~@/src/file.ts \x1b[201~")
		expect(mockProvider.postMessageToWebview).toHaveBeenNthCalledWith(1, {
			type: "action",
			action: "switchTab",
			tab: "cs-cli",
		})
		expect(mockProvider.postMessageToWebview).toHaveBeenNthCalledWith(2, {
			type: "CostrictCliToast",
			text: "File path inserted into CoStrict CLI",
		})
	})
})

describe("registerCommands installAgentPackage (US-002 FR-008)", () => {
	let mockOutputChannel: vscode.OutputChannel

	beforeEach(() => {
		mockOutputChannel = {
			appendLine: vi.fn(),
			append: vi.fn(),
			clear: vi.fn(),
			hide: vi.fn(),
			name: "mock",
			replace: vi.fn(),
			show: vi.fn(),
			dispose: vi.fn(),
		}
		vi.clearAllMocks()
		vi.mocked(vscode.window.showInformationMessage).mockClear()
	})

	// T017 [US2]: 手动命令触发 noUpdate 时应调用 triggerManualInstall
	// Note: showInformationMessage is called inside RemoteAgentInstaller.triggerManualInstall()
	// via notifyResult(), not by registerCommands itself. Since the mock bypasses that
	// internal logic, we only verify that triggerManualInstall is called.
	it("installAgentPackage should call triggerManualInstall on manual noUpdate", async () => {
		const mockInstaller = {
			triggerManualInstall: vi.fn().mockResolvedValue({ state: "noUpdate" }),
			getPackageName: vi.fn().mockReturnValue("Test Package"),
		}
		;(RemoteAgentInstaller.getInstance as Mock).mockReturnValue(mockInstaller)

		const commands = getCommandsMap({
			context: {} as vscode.ExtensionContext,
			outputChannel: mockOutputChannel,
			provider: {} as ClineProvider,
		})

		await commands.installAgentPackage()

		expect(mockInstaller.triggerManualInstall).toHaveBeenCalled()
	})
})
