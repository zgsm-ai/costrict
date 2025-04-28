/**
 * Copyright (c) 2024 - Sangfor LTD.
 *
 * All rights reserved. Code licensed under the MIT license
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 */
import * as vscode from "vscode"
import { StatusBarItem } from "vscode"
import { configCompletion } from "../common/constant"
import { Logger } from "../common/log-util"
import { statusBarCommand, turnOffCompletion, turnOnCompletion } from "./completionCommands"

/**
 * Status bar at the bottom right of vscode
 */
export class CompletionStatusBar {
	// Singleton to ensure a globally unique instance
	private static instance: StatusBarItem

	// Private constructor to prevent external instantiation
	/* eslint-disable @typescript-eslint/no-empty-function */
	private constructor() {}

	/**
	 * Create the status bar for the completion feature, which needs to be called in the plugin registration function
	 */
	public static create(context?: vscode.ExtensionContext): StatusBarItem {
		if (this.instance) {
			return this.instance
		}
		const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right)
		statusBar.command = statusBarCommand.command
		if (!context) {
			Logger.log("Plugin exception, completionStatusBar instance is abnormally lost")
			throw new Error("Plugin exception, completionStatusBar instance is abnormally lost")
		}
		const statusUpdateCallback = (callback: any, showIcon: boolean) => async () => {
			await callback()
			if (showIcon) {
				statusBar.show()
			} else {
				statusBar.hide()
			}
		}
		// Define commands
		context.subscriptions.push(
			vscode.commands.registerCommand(statusBar.command, statusBarCommand.callback),
			vscode.commands.registerCommand(
				turnOnCompletion.command,
				statusUpdateCallback(turnOnCompletion.callback, true),
			),
			vscode.commands.registerCommand(
				turnOffCompletion.command,
				statusUpdateCallback(turnOffCompletion.callback, false),
			),
		)

		this.instance = statusBar

		return this.instance
	}

	/**
	 * Initialize the initial display status of the status bar based on the configuration
	 */
	public static initByConfig(suggestion_switch?: boolean) {
		if (suggestion_switch === undefined) {
			suggestion_switch = vscode.workspace.getConfiguration(configCompletion).get("enabled")
		}
		this.instance.text = "$(check) SHENMA"
		if (suggestion_switch) {
			this.instance.tooltip = `SHENMA - Code Completion - Enabled`
		} else {
			this.instance.tooltip = `SHENMA - Code Completion - Disabled`
		}
		this.instance.show()
	}

	/**
	 * Waiting for request results
	 */
	public static loading() {
		this.instance.tooltip = "SHENMA - Code Completion - Waiting for request results"
		this.instance.text = "$(loading~spin) SHENMA - In Progress"
	}

	/**
	 * Completion is done
	 */
	public static complete() {
		this.instance.tooltip = "SHENMA - Code Completion - Completed"
		this.instance.text = "$(check) SHENMA"
	}

	/**
	 * Completion failed
	 */
	public static fail() {
		this.instance.tooltip = "SHENMA - Code Completion - Failed"
		this.instance.text = "$(alert) SHENMA - Exception"
	}

	/**
	 * Completion succeeded, but no suggestions
	 */
	public static noSuggest() {
		this.instance.text = "$(check) SHENMA - No Suggestions"
	}
}
