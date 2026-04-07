import * as vscode from "vscode"
import { FileContext } from "./types"

/**
 * Get the context of the currently active file in the editor.
 * Extracted and refactored from cs-activate.ts getActiveFile().
 *
 * @returns FileContext or undefined if no active editor / workspace
 */
export function getActiveFileContext(): FileContext | undefined {
	const activeEditor = vscode.window.activeTextEditor
	if (!activeEditor) {
		return undefined
	}

	const document = activeEditor.document
	const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri)
	if (!workspaceFolder) {
		return undefined
	}

	const relativePath = vscode.workspace.asRelativePath(document.uri)
	let fileRef = `@${relativePath}`
	let selection: FileContext["selection"] | undefined

	const sel = activeEditor.selection
	if (!sel.isEmpty) {
		const startLine = sel.start.line + 1
		const endLine = sel.end.line + 1
		selection = { startLine, endLine }

		if (startLine === endLine) {
			fileRef += `#L${startLine}`
		} else {
			fileRef += `#L${startLine}-${endLine}`
		}
	}

	return { relativePath, fileRef, selection }
}

/**
 * Get the relative paths of all currently open text editor tabs.
 */
export function getOpenTabs(): string[] {
	return vscode.window.tabGroups.all
		.flatMap((group) => group.tabs)
		.filter((tab) => tab.input instanceof vscode.TabInputText)
		.map((tab) => vscode.workspace.asRelativePath((tab.input as vscode.TabInputText).uri))
}
