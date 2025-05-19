/**
 * Copyright (c) 2024 - Sangfor LTD.
 *
 * All rights reserved. Code licensed under the MIT license
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 */
import * as vscode from "vscode"
// import Auth0AuthenticationProvider from './common/authProvider';
import { registerZGSMCodeActions } from "./chatView/chat-view-menu"
import { ChatViewProvider } from "./chatView/chat-view-provider"
import { shortKeyCut } from "./codeCompletion/completionCommands"
import { CompletionStatusBar } from "./codeCompletion/completionStatusBar"
import { AICompletionProvider } from "./codeCompletion/completionProvider"
import { codeLensCallBackCommand, codeLensCallBackMoreCommand } from "./codeLens/codeLensCallBackFunc"
import { MyCodeLensProvider } from "./codeLens/codeLensProvider"
import { configCompletion, configCodeLens, OPENAI_CLIENT_NOT_INITIALIZED, ZGSM_API_KEY } from "./common/constant"
// import { initEnv, updateEnv } from "./common/env"
// import { Logger } from "./common/log-util"
import {
	setupExtensionUpdater,
	doExtensionOnce,
	updateCodelensConfig,
	updateCompletionConfig,
	initLangSetting,
} from "./common/services"
import { printLogo } from "./common/vscode-util"
import { loadLocalLanguageExtensions } from "./common/lang-util"
import { ClineProvider } from "../../src/core/webview/ClineProvider"

/**
 * Initialization entry
 */
async function initialize() {
	printLogo()
	// initEnv()
	initLangSetting()

	loadLocalLanguageExtensions()
}

/**
 * Entry function when the extension is activated
 */
export async function activate(context: vscode.ExtensionContext, provider: ClineProvider) {
	initialize()

	// TODO: it will cause coredump
	// const authProvider = Auth0AuthenticationProvider.getInstance(context);
	// authProvider.checkToken();

	setupExtensionUpdater(context)
	doExtensionOnce(context)
	CompletionStatusBar.create(context)
	const cvProvider = ChatViewProvider.getInstance(context)

	context.subscriptions.push(
		// Register codelens related commands
		vscode.commands.registerTextEditorCommand(
			codeLensCallBackCommand.command,
			codeLensCallBackCommand.callback(context),
		),
		// Shenma instruction set
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
	// Register the command for the right-click menu
	registerZGSMCodeActions(context)
	// Register the 'Start Chat' command
	context.subscriptions.push(
		vscode.commands.registerCommand("vscode-zgsm.chat", () => {
			vscode.commands.executeCommand("vscode-zgsm.SidebarProvider.focus")
		}),
	)
	// Register the 'Logout' command
	context.subscriptions.push(
		vscode.commands.registerCommand("vscode-zgsm.view.logout", () => {
			cvProvider.logout()
		}),
	)
	// Register the command for clearing sessions
	context.subscriptions.push(
		vscode.commands.registerCommand("vscode-zgsm.clearSession", () => {
			context.globalState.update("chatgpt-session-token", null)
		}),
	)
	// Register the 'User Manual' command
	context.subscriptions.push(
		vscode.commands.registerCommand("vscode-zgsm.view.userHelperDoc", () => {
			cvProvider.userHelperDocPanel()
		}),
	)
	// Register the 'Report Issue' command
	context.subscriptions.push(
		vscode.commands.registerCommand("vscode-zgsm.view.issue", () => {
			cvProvider.userFeedbackIssue()
		}),
	)
	// get zgsmApiKey without webview resolve
	const key = await context.secrets.get(ZGSM_API_KEY)

	key
		? CompletionStatusBar.initByConfig()
		: CompletionStatusBar.fail({
				message: OPENAI_CLIENT_NOT_INITIALIZED,
			})
}

// eslint-disable-next-line @typescript-eslint/no-empty-function
export function deactivate() {}
