import * as vscode from "vscode"
import delay from "delay"

import { CommandId, Package, ProviderSettings } from "../schemas"
import { getCommand } from "../utils/commands"
import { ClineProvider } from "../core/webview/ClineProvider"
import { ContextProxy } from "../core/config/ContextProxy"
import { telemetryService } from "../services/telemetry/TelemetryService"
import { CodeReviewService } from "../services/codeReview/codeReviewService"

import { registerHumanRelayCallback, unregisterHumanRelayCallback, handleHumanRelayResponse } from "./humanRelay"
import { handleNewTask } from "./handleTask"
import { ReviewTarget, ReviewTargetType } from "../services/codeReview/types"
import { ReviewComment } from "../services/codeReview/reviewComment"
import { IssueStatus } from "../shared/codeReview"
import { toRelativePath } from "../utils/path"
import { EditorContext, EditorUtils } from "../integrations/editor/EditorUtils"

interface UriSource {
	path: string
	external: string
	fsPath: string
}

/**
 * Helper to get the visible ClineProvider instance or log if not found.
 */
export function getVisibleProviderOrLog(outputChannel: vscode.OutputChannel): ClineProvider | undefined {
	const visibleProvider = ClineProvider.getVisibleInstance()
	if (!visibleProvider) {
		outputChannel.appendLine("Cannot find any visible Costrict instances.")
		return undefined
	}
	return visibleProvider
}

// Store panel references in both modes
let sidebarPanel: vscode.WebviewView | undefined = undefined
let tabPanel: vscode.WebviewPanel | undefined = undefined

/**
 * Get the currently active panel
 * @returns WebviewPanel or WebviewView
 */
export function getPanel(): vscode.WebviewPanel | vscode.WebviewView | undefined {
	return tabPanel || sidebarPanel
}

/**
 * Set panel references
 */
export function setPanel(
	newPanel: vscode.WebviewPanel | vscode.WebviewView | undefined,
	type: "sidebar" | "tab",
): void {
	if (type === "sidebar") {
		sidebarPanel = newPanel as vscode.WebviewView
		tabPanel = undefined
	} else {
		tabPanel = newPanel as vscode.WebviewPanel
		sidebarPanel = undefined
	}
}

export type RegisterCommandOptions = {
	context: vscode.ExtensionContext
	outputChannel: vscode.OutputChannel
	provider: ClineProvider
}

export const registerCommands = (options: RegisterCommandOptions) => {
	const { context } = options

	for (const [id, callback] of Object.entries(getCommandsMap(options))) {
		const command = getCommand(id as CommandId)
		context.subscriptions.push(vscode.commands.registerCommand(command, callback))
	}
}

const getCommandsMap = ({ context, outputChannel, provider }: RegisterCommandOptions): Record<CommandId, any> => ({
	activationCompleted: () => {},
	plusButtonClicked: async () => {
		const visibleProvider = getVisibleProviderOrLog(outputChannel)

		if (!visibleProvider) {
			return
		}

		telemetryService.captureTitleButtonClicked("plus")

		await visibleProvider.removeClineFromStack()
		await visibleProvider.postStateToWebview()
		await visibleProvider.postMessageToWebview({ type: "action", action: "chatButtonClicked" })
	},
	mcpButtonClicked: () => {
		const visibleProvider = getVisibleProviderOrLog(outputChannel)

		if (!visibleProvider) {
			return
		}

		telemetryService.captureTitleButtonClicked("mcp")

		visibleProvider.postMessageToWebview({ type: "action", action: "mcpButtonClicked" })
	},
	promptsButtonClicked: () => {
		const visibleProvider = getVisibleProviderOrLog(outputChannel)

		if (!visibleProvider) {
			return
		}

		telemetryService.captureTitleButtonClicked("prompts")

		visibleProvider.postMessageToWebview({ type: "action", action: "promptsButtonClicked" })
	},
	popoutButtonClicked: () => {
		telemetryService.captureTitleButtonClicked("popout")

		return openClineInNewTab({ context, outputChannel })
	},
	openInNewTab: () => openClineInNewTab({ context, outputChannel }),
	settingsButtonClicked: () => {
		const visibleProvider = getVisibleProviderOrLog(outputChannel)

		if (!visibleProvider) {
			return
		}

		telemetryService.captureTitleButtonClicked("settings")

		visibleProvider.postMessageToWebview({ type: "action", action: "settingsButtonClicked" })
		// Also explicitly post the visibility message to trigger scroll reliably
		visibleProvider.postMessageToWebview({ type: "action", action: "didBecomeVisible" })
	},
	historyButtonClicked: () => {
		const visibleProvider = getVisibleProviderOrLog(outputChannel)

		if (!visibleProvider) {
			return
		}

		telemetryService.captureTitleButtonClicked("history")

		visibleProvider.postMessageToWebview({ type: "action", action: "historyButtonClicked" })
	},
	helpButtonClicked: () => {
		vscode.env.openExternal(vscode.Uri.parse("https://costrict.ai"))
	},
	showHumanRelayDialog: (params: { requestId: string; promptText: string }) => {
		const panel = getPanel()

		if (panel) {
			panel?.webview.postMessage({
				type: "showHumanRelayDialog",
				requestId: params.requestId,
				promptText: params.promptText,
			})
		}
	},
	registerHumanRelayCallback: registerHumanRelayCallback,
	unregisterHumanRelayCallback: unregisterHumanRelayCallback,
	handleHumanRelayResponse: handleHumanRelayResponse,
	newTask: handleNewTask,
	setCustomStoragePath: async () => {
		const { promptForCustomStoragePath } = await import("../utils/storage")
		await promptForCustomStoragePath()
	},
	focusInput: async () => {
		try {
			const panel = getPanel()

			if (!panel) {
				await vscode.commands.executeCommand(`workbench.view.extension.${Package.name}-ActivityBar`)
			} else if (panel === tabPanel) {
				panel.reveal(vscode.ViewColumn.Active, false)
			} else if (panel === sidebarPanel) {
				await vscode.commands.executeCommand(`${ClineProvider.sideBarId}.focus`)
				provider.postMessageToWebview({ type: "action", action: "focusInput" })
			}
		} catch (error) {
			outputChannel.appendLine(`Error focusing input: ${error}`)
		}
	},
	acceptInput: () => {
		const visibleProvider = getVisibleProviderOrLog(outputChannel)

		if (!visibleProvider) {
			return
		}

		visibleProvider.postMessageToWebview({ type: "acceptInput" })
	},
	moreButtonClicked: () => {
		const visibleProvider = getVisibleProviderOrLog(outputChannel)

		if (!visibleProvider) return

		telemetryService.captureTitleButtonClicked("more")
	},
	codeReviewButtonClicked: async () => {
		let visibleProvider = getVisibleProviderOrLog(outputChannel)

		if (!visibleProvider) {
			visibleProvider = await ClineProvider.getInstance()
		}

		visibleProvider?.postMessageToWebview({ type: "action", action: "codeReviewButtonClicked" })
	},
	codeReview: () => {
		const codeReviewService = CodeReviewService.getInstance()
		const provider = codeReviewService.getProvider()
		const editor = vscode.window.activeTextEditor
		if (!provider || !editor) {
			return
		}
		const fileUri = editor.document.uri
		const range = editor.selection
		const cwd = provider.cwd
		provider.startReviewTask([
			{
				type: ReviewTargetType.CODE,
				file_path: toRelativePath(fileUri.fsPath, cwd),
				line_range: [range.start.line, range.end.line],
			},
		])
	},
	reviewFilesAndFolders: async (_: vscode.Uri, selectedUris: vscode.Uri[]) => {
		const codeReviewService = CodeReviewService.getInstance()
		const provider = codeReviewService.getProvider()

		if (!provider) {
			return
		}
		const cwd = provider.cwd
		const targets: ReviewTarget[] = await Promise.all(
			selectedUris.map(async (uri) => {
				const stat = await vscode.workspace.fs.stat(uri)
				return {
					type: stat.type === vscode.FileType.Directory ? ReviewTargetType.FOLDER : ReviewTargetType.FILE,
					file_path: toRelativePath(uri.fsPath, cwd),
				}
			}),
		)
		provider.startReviewTask(targets)
	},
	reviewRepo: async () => {
		const codeReviewService = CodeReviewService.getInstance()
		const provider = codeReviewService.getProvider()

		if (!provider) {
			return
		}
		provider.startReviewTask(
			[
				{
					type: ReviewTargetType.FOLDER,
					file_path: "",
				},
			],
			true,
		)
	},
	acceptIssue: async (thread: vscode.CommentThread) => {
		const codeReviewService = CodeReviewService.getInstance()
		const provider = codeReviewService.getProvider()

		if (!provider) {
			return
		}
		const comments = thread.comments as ReviewComment[]
		provider.updateIssueStatus(comments, IssueStatus.ACCEPT)
	},
	rejectIssue: async (thread: vscode.CommentThread) => {
		const codeReviewService = CodeReviewService.getInstance()
		const provider = codeReviewService.getProvider()

		if (!provider) {
			return
		}
		const comments = thread.comments as ReviewComment[]
		provider.updateIssueStatus(comments, IssueStatus.REJECT)
	},
	addFileToContext: async (...args: [UriSource] | [unknown, UriSource[]]) => {
		const visibleProvider = await ClineProvider.getInstance()
		if (!visibleProvider) {
			return
		}

		// --- Logic to determine target resources ---
		let sources: (UriSource | EditorContext)[] = []

		// Check if args[1] is a valid UriSource array
		if (args.length > 1 && Array.isArray(args[1]) && args[1].length > 0) {
			sources = args[1]
		} else {
			// Handle a single file (from the old context menu or command palette)
			let singleSource: UriSource | EditorContext | undefined | null
			if (args.length > 0) {
				// Get a single file from the context menu
				;[singleSource] = args as [UriSource]
			} else {
				// Called from the command palette, get the file from the active editor
				singleSource = EditorUtils.getEditorContext()
			}

			if (singleSource) {
				sources = [singleSource]
			}
		}

		if (sources.length === 0) {
			return
		}
		// --- End of resource determination logic ---

		// Return early if no valid file sources were found.
		const aliasedPathPromises = sources.map(async (source) => {
			// The 'path' property should be common to both UriSource and EditorContext.
			if (!(source as UriSource).path) {
				return null
			}
			const resourceUri = vscode.Uri.parse((source as UriSource).path)
			// Await the dedicated function to get the aliased path.
			return createAliasedPath(resourceUri)
		})

		// Wait for all promises to resolve, then filter out any failed path generations (which return null).
		const validAliasedPaths = (await Promise.all(aliasedPathPromises)).filter((p): p is string => !!p)

		if (validAliasedPaths.length === 0) {
			return
		}

		// Join all valid paths with a space and add a trailing space at the end.
		const chatMessage = validAliasedPaths.join(" ") + " "

		await Promise.all([
			visibleProvider.postMessageToWebview({ type: "action", action: "chatButtonClicked" }),
			visibleProvider.postMessageToWebview({
				type: "invoke",
				invoke: "setChatBoxMessageByContext",
				text: chatMessage,
			}),
		])
	},
})

async function createAliasedPath(resourceUri: vscode.Uri): Promise<string | null> {
	const workspaceFolder = vscode.workspace.getWorkspaceFolder(resourceUri)
	if (!workspaceFolder) {
		console.warn(`Resource ${resourceUri.fsPath} is not in an open workspace folder.`)
		return null
	}

	let stat: vscode.FileStat
	try {
		stat = await vscode.workspace.fs.stat(resourceUri)
	} catch (error) {
		// This can happen if the file is deleted after the command is invoked.
		return null
	}

	const rootPath = workspaceFolder.uri.path
	const fullPath = resourceUri.path

	// Using substring is slightly more performant and direct than replace for prefixes.
	let relativePath = fullPath.startsWith(rootPath) ? fullPath.substring(rootPath.length) : fullPath

	// Ensure folder paths end with a slash.
	if (stat.type === vscode.FileType.Directory && !relativePath.endsWith("/")) {
		relativePath += "/"
	}

	return `@${relativePath}`
}

export const openClineInNewTab = async ({ context, outputChannel }: Omit<RegisterCommandOptions, "provider">) => {
	// (This example uses webviewProvider activation event which is necessary to
	// deserialize cached webview, but since we use retainContextWhenHidden, we
	// don't need to use that event).
	// https://github.com/microsoft/vscode-extension-samples/blob/main/webview-sample/src/extension.ts
	const contextProxy = await ContextProxy.getInstance(context)
	const tabProvider = new ClineProvider(
		context,
		outputChannel,
		"editor",
		contextProxy,
		async (providerSettings: ProviderSettings): Promise<ProviderSettings> => {
			if (typeof providerSettings.zgsmApiKeyUpdatedAt !== "string") {
				providerSettings.zgsmApiKeyUpdatedAt = `${providerSettings.zgsmApiKeyUpdatedAt ?? ""}`
			}

			if (typeof providerSettings.zgsmApiKeyExpiredAt !== "string") {
				providerSettings.zgsmApiKeyExpiredAt = `${providerSettings.zgsmApiKeyExpiredAt ?? ""}`
			}

			return providerSettings
		},
	)
	const lastCol = Math.max(...vscode.window.visibleTextEditors.map((editor) => editor.viewColumn || 0))

	// Check if there are any visible text editors, otherwise open a new group
	// to the right.
	const hasVisibleEditors = vscode.window.visibleTextEditors.length > 0

	if (!hasVisibleEditors) {
		await vscode.commands.executeCommand("workbench.action.newGroupRight")
	}

	const targetCol = hasVisibleEditors ? Math.max(lastCol + 1, 1) : vscode.ViewColumn.Two

	const newPanel = vscode.window.createWebviewPanel(ClineProvider.tabPanelId, "COSTRICT", targetCol, {
		enableScripts: true,
		retainContextWhenHidden: true,
		localResourceRoots: [context.extensionUri],
	})

	// Save as tab type panel.
	setPanel(newPanel, "tab")

	// TODO: Use better svg icon with light and dark variants (see
	// https://stackoverflow.com/questions/58365687/vscode-extension-iconpath).
	newPanel.iconPath = vscode.Uri.joinPath(
		context.extensionUri,
		"zgsm",
		"assets",
		"images",
		"shenma_robot_logo_big.png",
	)
	// newPanel.iconPath = {
	// 	light: vscode.Uri.joinPath(context.extensionUri, "assets", "icons", "panel_light.png"),
	// 	dark: vscode.Uri.joinPath(context.extensionUri, "assets", "icons", "panel_dark.png"),
	// }

	await tabProvider.resolveWebviewView(newPanel)

	// Add listener for visibility changes to notify webview
	newPanel.onDidChangeViewState(
		(e) => {
			const panel = e.webviewPanel
			if (panel.visible) {
				panel.webview.postMessage({ type: "action", action: "didBecomeVisible" }) // Use the same message type as in SettingsView.tsx
			}
		},
		null, // First null is for `thisArgs`
		context.subscriptions, // Register listener for disposal
	)

	// Handle panel closing events.
	newPanel.onDidDispose(
		() => {
			setPanel(undefined, "tab")
		},
		null,
		context.subscriptions, // Also register dispose listener
	)

	// Lock the editor group so clicking on files doesn't open them over the panel.
	await delay(100)
	await vscode.commands.executeCommand("workbench.action.lockEditorGroup")

	return tabProvider
}
