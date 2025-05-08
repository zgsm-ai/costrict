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
import { configCompletion, OPENAI_CLIENT_NOT_INITIALIZED } from "../common/constant"
import { Logger } from "../common/log-util"
import { statusBarCommand, turnOffCompletion, turnOnCompletion } from "./completionCommands"
import { t } from "../../../src/i18n"

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
		this.instance.text = t("common:completion.status.complete.text")
		if (suggestion_switch) {
			this.instance.tooltip = t("common:completion.status.enabled.tooltip")
		} else {
			this.instance.tooltip = t("common:completion.status.disabled.tooltip")
		}
		this.instance.show()
	}

	/**
	 * Waiting for request results
	 */
	public static loading() {
		this.instance.tooltip = t("common:completion.status.loading.tooltip")
		this.instance.text = t("common:completion.status.loading.text")
	}

	/**
	 * Completion is done
	 */
	public static complete() {
		this.instance.tooltip = t("common:completion.status.complete.tooltip")
		this.instance.text = t("common:completion.status.complete.text")
	}

	/**
	 * Completion failed
	 */
	public static fail(error: any) {
		let errorMsg

		// Build user-friendly error message
		if (error.status === 401) {
			errorMsg = t("common:completion.status.fail.401")
		} else if (error.status === 400) {
			errorMsg = t("common:completion.status.fail.400")
		} else if (error.status === 403) {
			errorMsg = t("common:completion.status.fail.403")
		} else if (error.status === 404) {
			errorMsg = t("common:completion.status.fail.404")
		} else if (error.status === 500) {
			errorMsg = t("common:completion.status.fail.500")
		} else if (error.status === 502) {
			errorMsg = t("common:completion.status.fail.502")
		} else if (error.status === 503) {
			errorMsg = t("common:completion.status.fail.503")
		} else if (error.status === 504) {
			errorMsg = t("common:completion.status.fail.504")
		} else if (error.status === 429) {
			errorMsg = t("common:completion.status.fail.429")
		} else if (error.error?.metadata?.raw) {
			errorMsg = JSON.stringify(error.error.metadata.raw, null, 2)
		} else if (error.message) {
			if (error.message === OPENAI_CLIENT_NOT_INITIALIZED) {
				errorMsg = t("common:completion.status.fail.401")
			} else {
				errorMsg = error.message
			}
		} else {
			errorMsg = t("common:completion.status.fail.unknown")
		}

		const backendMsg = error.error?.metadata?.raw?.message || error.message

		this.instance.tooltip = t("common:completion.status.fail.tooltip") + errorMsg + `\n` + 
		`${(error.message && !error.status) ? '' : (t("apiErrors:request.backend_message") + backendMsg)}`
		this.instance.text = t("common:completion.status.fail.text") + errorMsg
	}

	/**
	 * Completion succeeded, but no suggestions
	 */
	public static noSuggest() {
		this.instance.tooltip = t("common:completion.status.noSuggest.tooltip")
		this.instance.text = t("common:completion.status.noSuggest.text")
	}
}
