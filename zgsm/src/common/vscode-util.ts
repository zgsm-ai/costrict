/**
 * Copyright (c) 2024 - Sangfor LTD.
 *
 * All rights reserved. Code licensed under the MIT license
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 */
import * as vscode from "vscode"
import * as fs from "fs"
import * as path from "path"
import { SELECTION_BG_COLOR, configCompletion } from "./constant"
import { Logger } from "./log-util"

/**
 * Print startup message
 */
export function printLogo(): void {
	const extension = vscode.extensions.getExtension("zgsm-ai.zgsm")
	const version = extension?.packageJSON.version
	Logger.log(`
    ███████╗██╗  ██╗██╗   ██╗ ██████╗ ███████╗       █████╗ ██╗
    ╚══███╔╝██║  ██║██║   ██║██╔════╝ ██╔════╝      ██╔══██╗██║
      ███╔╝ ███████║██║   ██║██║  ███╗█████╗  █████╗███████║██║
     ███╔╝  ██╔══██║██║   ██║██║   ██║██╔══╝  ╚════╝██╔══██║██║
    ███████╗██║  ██║╚██████╔╝╚██████╔╝███████╗      ██║  ██║██║
    ╚══════╝╚═╝  ╚═╝ ╚═════╝  ╚═════╝ ╚══════╝      ╚═╝  ╚═╝╚═╝
                                 by:Zhuge Shenma Team
    vscode:       ${vscode.version}
    zgsm-ai.zgsm: ${version}
    `)
}

/**
 * Read HTML content that can be loaded by a Webview from an HTML file
 * @param context Context
 * @param templatePath Path to the html file relative to the plugin root directory
 */
export async function getWebviewContent(
	context: vscode.ExtensionContext,
	webview: vscode.Webview,
	templatePath: string,
) {
	const resourcePath = path.join(context.extensionPath, templatePath)
	const dirPath = path.dirname(resourcePath)
	let html = await fs.readFileSync(resourcePath, "utf-8")

	// VS Code does not support loading local resources directly, replace the path with its own path
	html = html.replace(/(<link.+?href="|<script.+?src="|<img.+?src=")(.+?)"/g, (m, $1, $2) => {
		const resource = webview.asWebviewUri(vscode.Uri.file(path.resolve(dirPath, $2)))
		return $1 + resource + '"'
	})

	return html
}

export let editorSelectionDecoration: vscode.TextEditorDecorationType | undefined
// /**
//  * Render background color function
//  * @param selection The selected text range, optional parameter, default is the current editor's selected range
//  * @param show Whether to display the background color, default is false
//  * @returns No return value
//  * @example
//  * renderBgColor(); // Clear old rendering
//  * renderBgColor(selection, true); // Render the background color of the selected text as rgba(38, 79, 120)
//  */
// export function renderBgColor(selection: vscode.Selection | undefined, show = false): vscode.Selection | undefined {
// 	const editor = vscode.window.activeTextEditor
// 	if (editor) {
// 		if (editorSelectionDecoration) {
// 			editor.setDecorations(editorSelectionDecoration, [])
// 			editorSelectionDecoration = undefined
// 		}
// 		if (show) {
// 			if (!selection) {
// 				selection = editor.selection
// 			}
// 			if (selection) {
// 				const activeColorThemeKind = vscode.window.activeColorTheme.kind
// 				const backgroundColor =
// 					activeColorThemeKind in SELECTION_BG_COLOR
// 						? SELECTION_BG_COLOR[activeColorThemeKind]
// 						: SELECTION_BG_COLOR[0]
// 				editorSelectionDecoration = vscode.window.createTextEditorDecorationType({
// 					backgroundColor: backgroundColor,
// 					isWholeLine: true,
// 				})
// 				editor.setDecorations(editorSelectionDecoration, [selection])
// 			}
// 		}
// 		return selection
// 	}
// }

/**
 * Get all code from startLine to endLine
 */
export function getFullLineCode(editor: vscode.TextEditor, startLine: number, endLine: number): string {
	// Select code line by line
	const rangeToSelecteLine = new vscode.Range(
		new vscode.Position(startLine, 0),
		new vscode.Position(endLine, Number.MAX_VALUE),
	)

	const sourceCode = editor.document.getText(rangeToSelecteLine)
	return sourceCode
}

/**
 * Get the root path of the workspace
 */
export function getRootPath() {
	return (
		vscode.workspace?.workspaceFolders?.[0].uri.fsPath ||
		path.dirname(vscode.window.activeTextEditor?.document.fileName || "")
	)
}

/**
 * Get the path to the vscode temporary directory/file
 */
export function getVscodeTempFileDir(fileName: string) {
	const rootPath = getRootPath()
	return path.join(rootPath, ".vscode", fileName)
}

/**
 * Write log data to a log file
 */
export function writeLogsSync(fileName: string, content: string) {
	const tempDir = path.join(getRootPath(), ".vscode", "logs")
	const tempFilePath = path.join(tempDir, fileName)
	if (!fs.existsSync(tempDir)) {
		fs.mkdirSync(tempDir, { recursive: true })
	}
	fs.writeFileSync(tempFilePath, content)
}

/**
 * Get the configuration for [Intelligent Code Completion]
 */
export function getCompleteConfig(): vscode.WorkspaceConfiguration {
	const config = vscode.workspace.getConfiguration(configCompletion)
	return config
}
