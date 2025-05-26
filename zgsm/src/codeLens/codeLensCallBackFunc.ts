/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Copyright (c) 2024 - Sangfor LTD.
 *
 * All rights reserved. Code licensed under the MIT license
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 */
import * as vscode from "vscode"
import { getLanguageClass } from "../langClass/factory"
import { CODELENS_CONST, CODELENS_FUNC } from "../common/constant"
import { throttle } from "../common/util"
import { getLanguageByFilePath } from "../common/lang-util"
import { ClineProvider } from "../../../src/core/webview/ClineProvider"
import { getCommand } from "../../../src/utils/commands"

/**
 * Throttled function for commonCodeLensFunc
 */
const throttleCommonCodeLensFunc = throttle(commonCodeLensFunc, 2000)

/**
 * Action for handling common codelens commands
 * @param editor The document editor where the codelens is located
 * @param args: [documentSymbol, codelensItem]
 */
async function commonCodeLensFunc(editor: any, ...args: any) {
	// Show the webview page first, as there may be time-consuming operations later
	// vscode.commands.executeCommand(getCommand('view.)focus');
	const documentSymbol = args[1]
	const codelensItem = args[2]
	const language = getLanguageByFilePath(editor.document.uri.fsPath)
	const langClass = getLanguageClass(language)

	const docUri = editor.document.uri
	const filePath = docUri.fsPath
	const startLine = documentSymbol.range.start.line
	const endLine = documentSymbol.range.end.line

	const allDiagnostics = vscode.languages.getDiagnostics(docUri)
	const diagnostics = allDiagnostics.filter((d) => {
		const symbolStart = documentSymbol.range.start.line
		const symbolEnd = documentSymbol.range.end.line
		return d.range.start.line <= symbolEnd && d.range.end.line >= symbolStart
	})

	codelensItem.range = {
		startLine: startLine,
		endLine: endLine,
	}
	codelensItem.filePath = filePath
	codelensItem.callType = CODELENS_CONST.funcHead
	codelensItem.language = language
	const params = langClass.codelensGetExtraArgs(editor.document, codelensItem.range, codelensItem)

	// let userInput: string | undefined;
	// if (params.inputPrompt) {
	//     userInput = await vscode.window.showInputBox({
	//         prompt: params.inputPrompt,
	//         placeHolder: params.inputPlaceholder,
	//     });
	// }

	const selectedText = params.code

	const data = {
		...{ filePath, selectedText },
		...(startLine !== undefined ? { startLine: startLine.toString() } : {}),
		...(endLine !== undefined ? { endLine: endLine.toString() } : {}),
		...(diagnostics ? { diagnostics } : {}),
		// ...(userInput ? { userInput } : {}),
	}

	await ClineProvider.handleCodeAction(params.command, params.actionType, data)
}

/**
 * Action for handling the 'More' button in codelens
 */
async function moreCodeLensFunc(editor: any, ...args: any) {
	const codeLens = args[2]
	const options: any[] = []

	for (const [key, codelensItem] of Object.entries(CODELENS_FUNC)) {
		if (key === codeLens.key) {
			continue
		}
		options.push({ label: codelensItem.actionName, data: codelensItem })
	}
	const selection = await vscode.window.showQuickPick(options, {
		placeHolder: "Select a quick command",
	})

	// Handle user selection
	if (selection) {
		args[2] = selection.data
		throttleCommonCodeLensFunc(editor, ...args)
	}
}

/**
 * Callback function for common codelens
 */
export const codeLensCallBackCommand = {
	command: getCommand("codelens_button"),
	callback: (event: any) => throttleCommonCodeLensFunc,
}

/**
 * Callback function for the 'More' button in codelens
 */
export const codeLensCallBackMoreCommand = {
	command: getCommand("codelens_more_button"),
	callback: (event: any) => moreCodeLensFunc,
}
