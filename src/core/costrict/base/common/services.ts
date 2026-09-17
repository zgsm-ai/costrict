/**
 * Copyright (c) 2024 - Sangfor LTD.
 *
 * All rights reserved. Code licensed under the MIT license
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 */
import * as vscode from "vscode"
import { configCodeLens } from "./constant"
import { LangSetting, LangDisables } from "./lang-util"

/**
 * Update settings related to [Function Quick Menu]
 */
export function updateCodelensConfig() {
	const config = vscode.workspace.getConfiguration(configCodeLens)
	const disables: LangDisables = config.get("disableLanguages") || {}
	const enabled = config.get("enabled")

	if (enabled) {
		LangSetting.codelensEnabled = true
	} else {
		LangSetting.codelensEnabled = false
	}
	LangSetting.setCodelensDisables(disables)
}

/**
 * Initialize language settings
 */
export function initLangSetting() {
	updateCodelensConfig()
	// Save the disables once during initialization, which can write all supported languages of the extension to the configuration items for easy user settings later.
	const config = vscode.workspace.getConfiguration(configCodeLens)
	const disables = LangSetting.getCodelensDisables()
	config.update("disableLanguages", disables, vscode.ConfigurationTarget.Global)
}
