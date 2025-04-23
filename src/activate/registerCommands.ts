import * as vscode from "vscode"
import delay from "delay"

import { ClineProvider } from "../core/webview/ClineProvider"

/**
 * Helper to get the visible ClineProvider instance or log if not found.
 */
export function getVisibleProviderOrLog(outputChannel: vscode.OutputChannel): ClineProvider | undefined {
	const visibleProvider = ClineProvider.getVisibleInstance()
	if (!visibleProvider) {
		outputChannel.appendLine("Cannot find any visible Cline instances.")
		return undefined
	}
	return visibleProvider
}

import { registerHumanRelayCallback, unregisterHumanRelayCallback, handleHumanRelayResponse } from "./humanRelay"
import { handleNewTask } from "./handleTask"

// Store panel references in both modes
let sidebarPanel: vscode.WebviewView | undefined = undefined
let tabPanel: vscode.WebviewPanel | undefined = undefined

/**
 * Get the currently active panel
 * @returns WebviewPanel或WebviewView
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
	const { context, outputChannel } = options

	for (const [command, callback] of Object.entries(getCommandsMap(options))) {
		context.subscriptions.push(vscode.commands.registerCommand(command, callback))
	}
}

const getCommandsMap = ({ context, outputChannel, provider }: RegisterCommandOptions) => {
	return {
		"vscode-zgsm.activationCompleted": () => {},
		"vscode-zgsm.plusButtonClicked": async () => {
			const visibleProvider = getVisibleProviderOrLog(outputChannel)
			if (!visibleProvider) return
			await visibleProvider.removeClineFromStack()
			await visibleProvider.postStateToWebview()
			await visibleProvider.postMessageToWebview({ type: "action", action: "chatButtonClicked" })
		},
		"vscode-zgsm.mcpButtonClicked": () => {
			const visibleProvider = getVisibleProviderOrLog(outputChannel)
			if (!visibleProvider) return
			visibleProvider.postMessageToWebview({ type: "action", action: "mcpButtonClicked" })
		},
		"vscode-zgsm.promptsButtonClicked": () => {
			const visibleProvider = getVisibleProviderOrLog(outputChannel)
			if (!visibleProvider) return
			visibleProvider.postMessageToWebview({ type: "action", action: "promptsButtonClicked" })
		},
		"vscode-zgsm.popoutButtonClicked": () => openClineInNewTab({ context, outputChannel }),
		"vscode-zgsm.openInNewTab": () => openClineInNewTab({ context, outputChannel }),
		"vscode-zgsm.settingsButtonClicked": () => {
			const visibleProvider = getVisibleProviderOrLog(outputChannel)
			if (!visibleProvider) return
			visibleProvider.postMessageToWebview({ type: "action", action: "settingsButtonClicked" })
		},
		"vscode-zgsm.historyButtonClicked": () => {
			const visibleProvider = getVisibleProviderOrLog(outputChannel)
			if (!visibleProvider) return
			visibleProvider.postMessageToWebview({ type: "action", action: "historyButtonClicked" })
		},
		"vscode-zgsm.helpButtonClicked": () => {
			vscode.env.openExternal(vscode.Uri.parse("https://zgsm.ai"))
		},
		"vscode-zgsm.showHumanRelayDialog": (params: { requestId: string; promptText: string }) => {
			const panel = getPanel()

			if (panel) {
				panel?.webview.postMessage({
					type: "showHumanRelayDialog",
					requestId: params.requestId,
					promptText: params.promptText,
				})
			}
		},
		"vscode-zgsm.registerHumanRelayCallback": registerHumanRelayCallback,
		"vscode-zgsm.unregisterHumanRelayCallback": unregisterHumanRelayCallback,
		"vscode-zgsm.handleHumanRelayResponse": handleHumanRelayResponse,
		"vscode-zgsm.newTask": handleNewTask,
		"vscode-zgsm.setCustomStoragePath": async () => {
			const { promptForCustomStoragePath } = await import("../shared/storagePathManager")
			await promptForCustomStoragePath()
		},
		"vscode-zgsm.focusInput": () => {
			provider.postMessageToWebview({ type: "action", action: "focusInput" })
		},
	}
}

export const openClineInNewTab = async ({ context, outputChannel }: Omit<RegisterCommandOptions, "provider">) => {
	// (This example uses webviewProvider activation event which is necessary to
	// deserialize cached webview, but since we use retainContextWhenHidden, we
	// don't need to use that event).
	// https://github.com/microsoft/vscode-extension-samples/blob/main/webview-sample/src/extension.ts
	const tabProvider = new ClineProvider(context, outputChannel, "editor")
	const lastCol = Math.max(...vscode.window.visibleTextEditors.map((editor) => editor.viewColumn || 0))

	// Check if there are any visible text editors, otherwise open a new group
	// to the right.
	const hasVisibleEditors = vscode.window.visibleTextEditors.length > 0

	if (!hasVisibleEditors) {
		await vscode.commands.executeCommand("workbench.action.newGroupRight")
	}

	const targetCol = hasVisibleEditors ? Math.max(lastCol + 1, 1) : vscode.ViewColumn.Two

	const newPanel = vscode.window.createWebviewPanel(ClineProvider.tabPanelId, "Roo Code", targetCol, {
		enableScripts: true,
		retainContextWhenHidden: true,
		localResourceRoots: [context.extensionUri],
	})

	// Save as tab type panel.
	setPanel(newPanel, "tab")

	// TODO: Use better svg icon with light and dark variants (see
	// https://stackoverflow.com/questions/58365687/vscode-extension-iconpath).
	newPanel.iconPath = {
		light: vscode.Uri.joinPath(context.extensionUri, "assets", "icons", "panel_light.png"),
		dark: vscode.Uri.joinPath(context.extensionUri, "assets", "icons", "panel_dark.png"),
	}

	await tabProvider.resolveWebviewView(newPanel)

	// Handle panel closing events.
	newPanel.onDidDispose(() => {
		setPanel(undefined, "tab")
	})

	// Lock the editor group so clicking on files doesn't open them over the panel.
	await delay(100)
	await vscode.commands.executeCommand("workbench.action.lockEditorGroup")

	return tabProvider
}
