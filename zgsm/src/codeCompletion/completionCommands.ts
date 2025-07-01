/**
 * Copyright (c) 2024 - Sangfor LTD.
 *
 * All rights reserved. Code licensed under the MIT license
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 */
import * as vscode from "vscode"
import { Logger } from "../common/log-util"
import { handleStatusBarClick } from "../common/services"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Command = { command: string; callback: (...args: any[]) => any; thisArg?: any }

/**
 * Add a command to the completion status bar item.
 */
export const statusBarCommand: Command = {
	command: "zgsm-statusBar.showInformationMessage",
	callback: () => handleStatusBarClick(),
}

/**
 * Set the enabled status of the completion extension.
 */
function setExtensionStatus(enabled: boolean) {
	const config = vscode.workspace.getConfiguration()
	const target = vscode.ConfigurationTarget.Global
	Logger.info("Set the status of 'zgsm-completion.enabled' to", enabled)
	config.update("zgsm-completion.enabled", enabled, target, false).then(console.error)
}

/**
 * Command to enable completion.
 */
export const turnOnCompletion: Command = {
	command: "zgsm-completion.enable",
	callback: () => setExtensionStatus(true),
}

/**
 * Command to disable completion.
 */
export const turnOffCompletion: Command = {
	command: "zgsm-completion.disable",
	callback: () => setExtensionStatus(false),
}

/**
 * Command for completion shortcut instructions.
 */
export const shortKeyCut: Command = {
	command: "zgsm-completion.shortKeyCut",
	callback: (context: vscode.ExtensionContext) => {
		context.workspaceState.update("shortCutKeys", true)
		vscode.commands.executeCommand("editor.action.inlineSuggest.trigger")
	},
}
