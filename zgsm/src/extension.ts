import { initZgsmApiConfiguration } from "./../../src/shared/zgsmInitialize"
/**
 * Copyright (c) 2024 - Sangfor LTD.
 *
 * All rights reserved. Code licensed under the MIT license
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 */
import * as vscode from "vscode"
import { registerZGSMCodeActions } from "./chatView/chat-view-menu"
import { shortKeyCut } from "./codeCompletion/completionCommands"
import { CompletionStatusBar } from "./codeCompletion/completionStatusBar"
import { AICompletionProvider } from "./codeCompletion/completionProvider"
import { codeLensCallBackCommand, codeLensCallBackMoreCommand } from "./codeLens/codeLensCallBackFunc"
import { MyCodeLensProvider } from "./codeLens/codeLensProvider"
import { configCompletion, configCodeLens, OPENAI_CLIENT_NOT_INITIALIZED, ZGSM_API_KEY } from "./common/constant"
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
import { defaultZgsmAuthConfig } from "../../src/zgsmAuth/config"
import { getCommand } from "../../src/utils/commands"

/**
 * Initialization entry
 */
async function initialize(provider: ClineProvider) {
	printLogo()
	initLangSetting()
	loadLocalLanguageExtensions()
	await initZgsmApiConfiguration(provider)
}

/**
 * Entry function when the extension is activated
 */
export async function activate(context: vscode.ExtensionContext, provider: ClineProvider) {
	await initialize(provider)

	// TODO: it will cause coredump
	// authProvider.checkToken();

	setupExtensionUpdater(context)
	doExtensionOnce(context)
	CompletionStatusBar.create(context)

	context.subscriptions.push(
		// Register codelens related commands
		vscode.commands.registerTextEditorCommand(
			codeLensCallBackCommand.command,
			codeLensCallBackCommand.callback(context),
		),
		// Costrict instruction set
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
		vscode.commands.registerCommand(getCommand("chat"), () => {
			vscode.commands.executeCommand(getCommand("SidebarProvider.focus"))
		}),
	)

	// Register the 'User Manual' command
	context.subscriptions.push(
		vscode.commands.registerCommand(getCommand("view.userHelperDoc"), () => {
			vscode.env.openExternal(vscode.Uri.parse(`${defaultZgsmAuthConfig.zgsmSite}`))
		}),
	)
	// Register the 'Report Issue' command
	context.subscriptions.push(
		vscode.commands.registerCommand(getCommand("view.issue"), () => {
			vscode.env.openExternal(vscode.Uri.parse(`${defaultZgsmAuthConfig.baseUrl}/issue/`))
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
