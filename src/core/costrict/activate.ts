/**
 * ZGSM Core Activation Module
 *
 * Handles the activation and initialization of all ZGSM functionality
 * including completion providers, codelens providers, and command registration.
 */

import * as vscode from "vscode"
import { ClineProvider } from "../webview/ClineProvider"
// import { initZgsmApiConfiguration } from "../../shared/zgsmInitialize"
// import { registerCodeAction } from "../../activate/registerCodeActions"
// import { defaultZgsmAuthConfig } from "../../zgsmAuth/config"
// import { getCommand } from "../../utils/commands"
// import { CodeActionId } from "../../schemas"

// import { COMMAND_IDS } from "../../activate/CodeActionProvider"

// Import from migrated modules
import { AICompletionProvider, CompletionStatusBar, shortKeyCut } from "./completion"

import { MyCodeLensProvider, codeLensCallBackCommand, codeLensCallBackMoreCommand } from "./codelens"

import {
	configCompletion,
	configCodeLens,
	OPENAI_CLIENT_NOT_INITIALIZED,
	updateCodelensConfig,
	updateCompletionConfig,
	initLangSetting,
	printLogo,
	loadLocalLanguageExtensions,
	LangSetting,
} from "./base/common"
import { ZgsmAuthStorage } from "./auth"
import { initCodeReview } from "./code-review"
import { Package } from "../../shared/package"
import { createLogger, deactivate as loggerDeactivate } from "../../utils/logger"

// import { registerCodeAction } from "../../activate/registerCodeActions"

// import { CodeActionId } from "@roo-code/types"

/**
 * Initialization entry
 */
async function initialize(provider: ClineProvider) {
	printLogo()
	initLangSetting()
	loadLocalLanguageExtensions()
	// await initZgsmApiConfiguration(provider)
}

/**
 * Register ZGSM-specific code actions
 */
// function registerZGSMCodeActions(context: vscode.ExtensionContext) {
// 	registerCodeAction(context, COMMAND_IDS.ZGSM_EXPLAIN as CodeActionId, "ZGSM_EXPLAIN")

// 	registerCodeAction(context, COMMAND_IDS.ZGSM_ADD_COMMENT as CodeActionId, "ZGSM_ADD_COMMENT")

// 	registerCodeAction(context, COMMAND_IDS.ZGSM_ADD_DEBUG_CODE as CodeActionId, "ZGSM_ADD_DEBUG_CODE")

// 	registerCodeAction(context, COMMAND_IDS.ZGSM_ADD_STRONG_CODE as CodeActionId, "ZGSM_ADD_STRONG_CODE")

// 	registerCodeAction(context, COMMAND_IDS.ZGSM_SIMPLIFY_CODE as CodeActionId, "ZGSM_SIMPLIFY_CODE")

// 	registerCodeAction(context, COMMAND_IDS.ZGSM_PERFORMANCE as CodeActionId, "ZGSM_PERFORMANCE")
// }

/**
 * Entry function when the ZGSM extension is activated
 */
export async function activate(
	context: vscode.ExtensionContext,
	provider: ClineProvider,
	outputChannel: vscode.OutputChannel,
) {
	await initialize(provider)
	createLogger(Package.outputChannel, { channel: outputChannel })
	initCodeReview(context, provider, outputChannel)
	CompletionStatusBar.create(context)

	context.subscriptions.push(
		// Register codelens related commands
		vscode.commands.registerTextEditorCommand(
			codeLensCallBackCommand.command,
			codeLensCallBackCommand.callback(context),
		),
		// Construct instruction set
		vscode.commands.registerTextEditorCommand(
			codeLensCallBackMoreCommand.command,
			codeLensCallBackMoreCommand.callback(context),
		),
		// Register function header menu
		vscode.languages.registerCodeLensProvider("*", new MyCodeLensProvider()),
	)

	// Listen for configuration changes
	const configChanged = vscode.workspace.onDidChangeConfiguration((e) => {
		if (e.affectsConfiguration(configCompletion)) {
			// Code completion settings changed
			updateCompletionConfig()
		}
		if (e.affectsConfiguration(configCodeLens)) {
			// Function Quick Commands settings changed
			updateCodelensConfig()
		}
		CompletionStatusBar.initByConfig()
	})
	context.subscriptions.push(configChanged)

	context.subscriptions.push(
		// Code completion service
		vscode.languages.registerInlineCompletionItemProvider(
			{ pattern: "**" },
			new AICompletionProvider(context, provider),
		),
		// Shortcut command to trigger auto-completion manually
		vscode.commands.registerCommand(shortKeyCut.command, () => {
			shortKeyCut.callback(context)
		}),
	)

	// // Register the command for the right-click menu
	// registerZGSMCodeActions(context)

	// // Register the 'Start Chat' command
	// context.subscriptions.push(
	// 	vscode.commands.registerCommand(getCommand("chat"), () => {
	// 		vscode.commands.executeCommand(getCommand("SidebarProvider.focus"))
	// 	}),
	// )

	// // Register the 'User Manual' command
	// context.subscriptions.push(
	// 	vscode.commands.registerCommand(getCommand("view.userHelperDoc"), () => {
	// 		vscode.env.openExternal(vscode.Uri.parse(`${defaultZgsmAuthConfig.zgsmSite}`))
	// 	}),
	// )

	// // Register the 'Report Issue' command
	// context.subscriptions.push(
	// 	vscode.commands.registerCommand(getCommand("view.issue"), () => {
	// 		vscode.env.openExternal(vscode.Uri.parse(`${defaultZgsmAuthConfig.baseUrl}/issue/`))
	// 	}),
	// )

	// Get zgsmRefreshToken without webview resolve
	const tokens = await ZgsmAuthStorage.getInstance().getTokens()
	if (tokens?.access_token) {
		CompletionStatusBar.initByConfig()
	} else {
		CompletionStatusBar.fail({
			message: OPENAI_CLIENT_NOT_INITIALIZED,
		})
	}
}

/**
 * Deactivation function for ZGSM
 */
export function deactivate() {
	// Currently no specific cleanup needed
	loggerDeactivate()
}
