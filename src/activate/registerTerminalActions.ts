import * as vscode from "vscode"
import { ClineProvider } from "../core/webview/ClineProvider"
import { Terminal } from "../integrations/terminal/Terminal"
import { t } from "../i18n"

const TERMINAL_COMMAND_IDS = {
	ADD_TO_CONTEXT: "vscode-zgsm.terminalAddToContext",
	FIX: "vscode-zgsm.terminalFixCommand",
	EXPLAIN: "vscode-zgsm.terminalExplainCommand",
} as const

export const registerTerminalActions = (context: vscode.ExtensionContext) => {
	registerTerminalAction(context, TERMINAL_COMMAND_IDS.ADD_TO_CONTEXT, "TERMINAL_ADD_TO_CONTEXT")
	registerTerminalAction(context, TERMINAL_COMMAND_IDS.FIX, "TERMINAL_FIX")
	registerTerminalAction(context, TERMINAL_COMMAND_IDS.EXPLAIN, "TERMINAL_EXPLAIN")
}

const registerTerminalAction = (
	context: vscode.ExtensionContext,
	command: string,
	promptType: "TERMINAL_ADD_TO_CONTEXT" | "TERMINAL_FIX" | "TERMINAL_EXPLAIN",
) => {
	context.subscriptions.push(
		vscode.commands.registerCommand(command, async (args: any) => {
			let content = args.selection

			if (!content || content === "") {
				content = await Terminal.getTerminalContents(promptType === "TERMINAL_ADD_TO_CONTEXT" ? -1 : 1)
			}

			if (!content) {
				vscode.window.showWarningMessage(t("common:warnings.no_terminal_content"))
				return
			}

			await ClineProvider.handleTerminalAction(command, promptType, {
				terminalContent: content,
			})
		}),
	)
}
