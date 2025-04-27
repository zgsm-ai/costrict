/**
 * Copyright (c) 2024 - Sangfor LTD.
 *
 * All rights reserved. Code licensed under the MIT license
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 */
import * as path from "path"
import * as vscode from "vscode"
import { getLanguageExtensions } from "./api"
import { CODELENS_CONST, COMPLETION_CONST } from "./constant"

/**
 * Definition of programming language extensions,
 * By redefining this data structure, you can support custom programming file extensions at a low cost
 */
export interface LanguageExtension {
	language: string
	file_extensions: string[]
}

export let languageExtensions: LanguageExtension[]

/**
 * Load language extension data from the server
 */
export async function loadRemoteLanguageExtensions() {
	const response = await getLanguageExtensions()
	if (response && response?.data.length > 0) {
		languageExtensions = response?.data
	}
}

/**
 * Load local language extensions, defined in a JSON file
 */
export function loadLocalLanguageExtensions() {
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	const languageExtensionData = require("../data/language-extension-data.json")
	languageExtensions = languageExtensionData
}

/**
 * Get the file extension from the filename
 */
function getExtensionByFilename(filename: string): string {
	if (!filename.includes(".")) {
		return ""
	} else if (/^\.[0-9a-zA-Z_]+$/.test(filename)) {
		return filename
	}
	return filename.split(".").pop() || ""
}

/**
 * Get the language based on the filename
 */
export function getLanguageByFilename(filename: string) {
	const fileExtension = getExtensionByFilename(filename).toLowerCase()
	const language = languageExtensions.find((item) => item.file_extensions.includes(fileExtension))?.language || ""
	if (language) {
		return language.toLowerCase()
	} else {
		const editor = vscode.window.activeTextEditor
		if (!editor) {
			return "plaintext"
		} else {
			return fileExtension || editor.document.languageId
		}
	}
}

/**
 * Get the language based on the file path
 */
export function getLanguageByFilePath(filePath: string) {
	const filename = path.basename(filePath)
	return getLanguageByFilename(filename)
}

/**
 * Disable status table for each language's feature
 */
export type LangDisables = {
	[key: string]: string
}
/**
 * Language feature switch
 */
export enum LangSwitch {
	Enabled = 0, // Enabled
	Disabled = 1, // Disabled
	Unsupported = 2, // The language does not support this feature
}
/**
 * Language feature settings
 */
export class LangSetting {
	public static completionEnabled = true
	public static codelensEnabled = true

	private completionSwitchs = new Map<string, LangSwitch>()
	private codelensSwitchs = new Map<string, LangSwitch>()
	private static readonly completionDefault = LangSwitch.Enabled
	private static readonly codelensDefault = LangSwitch.Unsupported
	private static instance: LangSetting | undefined = undefined

	/**
	 * Get completion disable items
	 */
	public static getCompletionDisables(): LangDisables {
		return this.getDisables(this.getInstance().completionSwitchs)
	}
	/**
	 * Get quick menu disable items
	 */
	public static getCodelensDisables(): LangDisables {
		return this.getDisables(this.getInstance().codelensSwitchs)
	}
	/**
	 * Set completion disable items
	 */
	public static setCompletionDisables(disables: LangDisables) {
		this.setDisables(this.getInstance().completionSwitchs, disables, this.completionDefault)
	}
	/**
	 * Set quick menu disable items
	 */
	public static setCodelensDisables(disables: LangDisables) {
		this.setDisables(this.getInstance().codelensSwitchs, disables, this.codelensDefault)
	}
	/**
	 * Check if completion is disabled for a language
	 */
	public static getCompletionDisable(lang: string): LangSwitch {
		return this.getInstance().completionSwitchs.get(lang) ?? this.completionDefault
	}
	/**
	 * Check if codelens is disabled for a language
	 */
	public static getCodelensDisable(lang: string): LangSwitch {
		return this.getInstance().codelensSwitchs.get(lang) ?? this.codelensDefault
	}

	/**
	 * Singleton pattern
	 */
	private static getInstance(): LangSetting {
		if (!this.instance) {
			this.instance = new LangSetting()
			this.setSupports(this.instance.codelensSwitchs, CODELENS_CONST.allowableLanguages)
			this.setSupports(this.instance.completionSwitchs, COMPLETION_CONST.allowableLanguages)
		}
		return this.instance
	}
	/**
	 * Set the list of languages supported for a feature (code completion/quick menu)
	 */
	private static setSupports(switchs: Map<string, LangSwitch>, langs: string[]) {
		for (let i = 0; i < langs.length; i++) {
			const lang = langs[i]
			switchs.set(lang, LangSwitch.Enabled)
		}
	}
	/**
	 * Apply language disable settings
	 */
	private static setDisables(switchs: Map<string, LangSwitch>, disables: LangDisables, def: LangSwitch) {
		Object.entries(disables).forEach(([key, value]) => {
			let sw_value = LangSwitch.Enabled
			if (value.toLowerCase() === "true") {
				sw_value = LangSwitch.Disabled
			}
			const sw = switchs.get(key)
			if (sw === LangSwitch.Enabled || sw === LangSwitch.Disabled) {
				switchs.set(key, sw_value)
			} else if (sw === undefined) {
				if (def !== LangSwitch.Unsupported) {
					switchs.set(key, sw_value)
				}
			}
		})
	}
	private static getDisables(switchs: Map<string, LangSwitch>): LangDisables {
		let disables: LangDisables = {}
		switchs.forEach((value, key) => {
			if (value === LangSwitch.Disabled) {
				disables[key] = "true"
			} else if (value === LangSwitch.Enabled) {
				disables[key] = "false"
			}
		})
		return disables
	}
}
