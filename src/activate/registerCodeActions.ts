import * as vscode from "vscode"

import { CodeActionId, CodeActionName } from "../schemas"
import { getCodeActionCommand } from "../utils/commands"
import { EditorUtils } from "../integrations/editor/EditorUtils"
import { ClineProvider } from "../core/webview/ClineProvider"
import { COMMAND_IDS } from "./CodeActionProvider"

export const registerCodeActions = (context: vscode.ExtensionContext) => {
	registerCodeAction(context, COMMAND_IDS.EXPLAIN as CodeActionId, "EXPLAIN")
	registerCodeAction(context, COMMAND_IDS.FIX as CodeActionId, "FIX")
	registerCodeAction(context, COMMAND_IDS.IMPROVE as CodeActionId, "IMPROVE")
	registerCodeAction(context, COMMAND_IDS.ADD_TO_CONTEXT as CodeActionId, "ADD_TO_CONTEXT")
}

export const registerCodeAction = (
	context: vscode.ExtensionContext,
	command: CodeActionId,
	promptType: CodeActionName,
) => {
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	let userInput: string | undefined

	context.subscriptions.push(
		vscode.commands.registerCommand(getCodeActionCommand(command), async (...args: any[]) => {
			// Handle both code action and direct command cases.
			let filePath: string
			let selectedText: string
			let startLine: number | undefined
			let endLine: number | undefined
			let diagnostics: any[] | undefined

			if (args.length > 1) {
				// Called from code action.
				;[filePath, selectedText, startLine, endLine, diagnostics] = args
			} else {
				// Called directly from command palette.
				const context = EditorUtils.getEditorContext()

				if (!context) {
					return
				}

				;({ filePath, selectedText, startLine, endLine, diagnostics } = context)
			}

			const params = {
				...{ filePath, selectedText },
				...(startLine !== undefined ? { startLine: startLine.toString() } : {}),
				...(endLine !== undefined ? { endLine: endLine.toString() } : {}),
				...(diagnostics ? { diagnostics } : {}),
				// ...(userInput ? { userInput } : {}),
			}

			await ClineProvider.handleCodeAction(command, promptType, params)
		}),
	)
}
