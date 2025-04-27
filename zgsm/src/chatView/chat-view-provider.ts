/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Copyright (c) 2024 - Sangfor LTD.
 *
 * All rights reserved. Code licensed under the MIT license
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 */
import * as fs from "fs"
import * as vscode from "vscode"
import * as path from "path"

import { CODELENS_FUNC, WEBVIEW_THEME_CONST, codeLensDiffCodeTempFileDir } from "../common/constant"
import { Logger } from "../common/log-util"
import { getLocalIP, getUuid } from "../common/util"
import { getFullLineCode, getVscodeTempFileDir, getWebviewContent } from "../common/vscode-util"
import { getLanguageByFilePath } from "../common/lang-util"
import { t } from "../../../src/i18n"
import { ClineProvider } from "../../../src/core/webview/ClineProvider"

export class ChatViewProvider implements vscode.WebviewViewProvider {
	private static instance: ChatViewProvider // Singleton, ensuring a globally unique instance
	private static provider?: ClineProvider
	public webView: vscode.WebviewView | null = null // Web view for interaction between the IDE and the chat page (webpage)
	private callBackMap: Map<string, any> = new Map() // Callback function map: When receiving a message from the webview, the result needs to be fed back through the callback
	private leftOverMessage?: any

	constructor(public context: vscode.ExtensionContext) {
		vscode.window.createTextEditorDecorationType({
			gutterIconPath: vscode.Uri.file(context.asAbsolutePath("images/ai-rotate.svg")),
			gutterIconSize: "contain",
			rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
		})
		this.changeActiveColorTheme()
	}

	// Singleton, ensuring a globally unique instance. Other places use this function to get the instance
	public static async getInstance(context?: vscode.ExtensionContext): Promise<ChatViewProvider> {
		if (!ChatViewProvider.instance) {
			if (!context) {
				Logger.log("Plugin error, ChatViewProvider instance is unexpectedly lost")
				throw new Error("Plugin error, ChatViewProvider instance is unexpectedly lost")
			}

			if (!ChatViewProvider.provider) {
				this.provider = await ClineProvider.getCacheInstances()
			}

			ChatViewProvider.instance = new ChatViewProvider(context)
		}
		return ChatViewProvider.instance
	}

	public async resolveWebviewView(webviewView: vscode.WebviewView) {
		this.webView = webviewView

		webviewView.webview.options = {
			// Allow scripts in the webview
			enableScripts: true,
			localResourceRoots: [this.context.extensionUri],
		}

		webviewView.webview.html = await getWebviewContent(
			this.context,
			webviewView.webview,
			"html/webview/dist/index.html",
		)

		webviewView.webview.onDidReceiveMessage(async (message) => {
			if (!ChatViewProvider.provider)
				throw new Error("Plugin error, ChatViewProvider instance is unexpectedly lost")

			const { apiConfiguration } = await ChatViewProvider.provider.getState()

			/* eslint-disable */
			switch (message.action) {
				// Get configuration information
				case "ide.getConfig":
					this.invokeCallback(message, {
						chatUrl: apiConfiguration.zgsmBaseUrl,
						ide: apiConfiguration.zgsmClientId,
						extVersion: clientConfig.extVersion,
						ideVersion: clientConfig.ideVersion,
						hostIp: getLocalIP(),
						model: this.context.globalState.get("model") ?? "",
					})
					break
				// Notification in the lower right corner
				case "ide.notification":
					this.doNotification(message)
					break
				// Insert AI code into the editor
				case "ide.insertCode":
					this.insertCode(message.params)
					break
				// Open AI code in a new file
				case "ide.openNew":
					const document = await vscode.workspace.openTextDocument({
						content: message.value,
						language: message.language,
					})
					vscode.window.showTextDocument(document)
					break
				// Get the selected code
				case "ide.getSelectCode":
					this.doGetSelectCode(message)
					break
				// Get the theme color scheme
				case "ide.getThemeKind":
					// The theme color schemes are divided into two types: vs, vs-dark. Custom color schemes default to vs-dark
					let activeColorThemeKind = WEBVIEW_THEME_CONST[2]
					try {
						activeColorThemeKind = WEBVIEW_THEME_CONST[vscode.window.activeColorTheme.kind]
					} catch (err) {
						Logger.log(
							`Side: Failed to get the current theme kind, default to dark color scheme 2 ${WEBVIEW_THEME_CONST[2]}`,
						)
						activeColorThemeKind = WEBVIEW_THEME_CONST[2]
					}
					this.invokeCallback(message, {
						themeKind: activeColorThemeKind,
					})
					break
				// Listen for callback events
				case "ide.callBack":
					Logger.log("ide.callBack__", message)
					this.callBackDeal(message.params)
					break
				// Open a code comparison page
				case "ide.ideDiffCode":
					this.ideDiffCode(message.params)
					break
				// Jump to the specified file
				case "ide.jumpByPath":
					this.doJumpByPath(message.params)
					break
				// Special processing of file paths in the passed markdown string
				case "ide.dealJumpFilePath":
					this.doDealJumpPath(message)
					break
				// Open the help document
				case "ide.openHelperDoc":
					this.userHelperDocPanel()
					break
				default:
					break
			}
			/* eslint-disable */
		})

		if (this.leftOverMessage != null) {
			// If there were any messages that weren't delivered, render after resolveWebView is called.
			this.sendMessage(this.leftOverMessage)
			this.leftOverMessage = null
		}
	}

	/**
	 * Execute the callback function and callback to the webview
	 */
	private invokeCallback(message: any, data: any) {
		this.webView?.webview.postMessage({ action: "ideCallback", cbid: message.cbid, data: data })
	}

	/**
	 * Handle the event that the webview callbacks to the IDE
	 */
	private callBackDeal(data: any) {
		const cbid = data.cbid
		if (cbid) {
			this.callBackMap.get(cbid)?.(data)
			this.callBackMap.delete(cbid)
		}
	}

	/**
	 * Send a message to the webview
	 */
	public sendMessage(message: any, callBackFunc?: Function) {
		if (this.webView) {
			if (callBackFunc) {
				const cbid = "cb-" + getUuid()
				message = message ? message : { data: {} }
				message.data = message.data ? message.data : {}
				message.data.cbid = cbid

				this.callBackMap.set(cbid, callBackFunc)
			}
			this.webView?.webview.postMessage(message)
		} else {
			this.leftOverMessage = message
		}
	}

	/**
	 * Notify the view that the configuration has been updated
	 */
	public async updateConfig() {
		if (!ChatViewProvider.provider) throw new Error("ChatViewProvider is not initialized")

		const { apiConfiguration } = await ChatViewProvider.provider.getState()

		this.sendMessage({
			action: "ide.updateConfig",
			data: {
				chatUrl: apiConfiguration.zgsmBaseUrl,
			},
		})
	}

	/**
	 * Handle the status notification that the webview needs to display
	 */
	private doNotification(message: any) {
		if (message.params.isError) {
			vscode.window.showErrorMessage(message.params.content)
		} else if (message.params.isReviewSuccess) {
			vscode.window
				.showInformationMessage(
					message.params.content,
					{ title: "View details", isCloseAffordance: false },
					{ title: "Got it", isCloseAffordance: true },
				)
				.then(async (selection) => {
					if (selection && selection.title === "View details") {
						await vscode.commands.executeCommand("vscode-zgsm.view.focus")
						setTimeout(() => {
							this.invokeCallback(message, message.params.data)
						}, 500)
					}
				})
		} else if (message.params.isOpenView) {
			vscode.window
				.showInformationMessage(message.params.content, {
					title: "Open the chat window",
					isCloseAffordance: false,
				})
				.then((selection) => {
					if (selection && selection.title === "Open the chat window") {
						vscode.commands.executeCommand("vscode-zgsm.view.focus")
						setTimeout(() => {
							this.invokeCallback(message, message.params.data)
						}, 500)
					}
				})
		} else {
			vscode.window.showInformationMessage(message.params.content)
		}
	}

	/**
	 * Return the selected code to the webview
	 */
	private doGetSelectCode(message: any) {
		let data = {
			code: "",
			language: "",
			filePath: "",
			startLine: 0,
			endLine: 0,
		}
		const editor = vscode.window.activeTextEditor
		if (!editor || editor.selection.isEmpty) {
			this.invokeCallback(message, data)
			return
		}

		const startLine = editor.selection.start.line
		const endLine = editor.selection.end.line

		if (startLine == endLine) {
			// Get the selected text and remove leading and trailing spaces
			const selectedText = editor.document.getText(editor.selection).trim()
			// Get the full text of the start and end lines and remove leading and trailing spaces
			const startLineText = editor.document.lineAt(startLine).text.trim()
			// Check if the selected text is a full line
			if (selectedText != startLineText) {
				Logger.log("The code obtained by ide.getSelectCode is not a full line, returning directly")
				this.invokeCallback(message, data)
				return
			}
		}

		const code = getFullLineCode(editor, startLine, endLine)
		const filePath = editor.document.uri.fsPath
		const language = getLanguageByFilePath(filePath)
		data = {
			code,
			language: language,
			filePath: filePath,
			startLine: startLine,
			endLine: endLine,
		}

		this.invokeCallback(message, data)
	}

	/**
	 * Create a new file with the content of the string text
	 */
	public createNewFile(text: string, language: string) {
		// Get the current workspace
		const workspace = vscode.workspace
		// If there is no open workspace, return
		if (!workspace) {
			return
		}
		// Create a new unsaved file
		const newFile = workspace.createFileSystemWatcher("untitled:*")
		// Open the newly created file
		workspace.openTextDocument({ content: text }).then((document) => {
			if (language) {
				Logger.log("info language:", language)
				vscode.languages.setTextDocumentLanguage(document, language)
			}
			vscode.window.showTextDocument(document)
		})
	}

	/**
	 * Theme change event for the webView
	 */
	private seedChangeActiveColorTheme(postData: any) {
		this.sendMessage({ action: "editor.changeTheme", data: postData })
	}

	/**
	 * Register the theme change event listener
	 */
	private changeActiveColorTheme() {
		vscode.window.onDidChangeActiveColorTheme((theme) => {
			let themeColor = WEBVIEW_THEME_CONST[2]
			try {
				themeColor = WEBVIEW_THEME_CONST[theme.kind]
				Logger.log(`Side: The current theme kind has changed to: ${theme.kind}, ${themeColor}`)
			} catch (err) {
				Logger.log(
					`Side: Failed to get the current theme kind, default to dark color scheme 2 ${WEBVIEW_THEME_CONST[2]}`,
				)
			}
			this.seedChangeActiveColorTheme({ themeKind: themeColor })
		})
	}

	/**
	 * After the codelens button event is triggered, send a request to the webview to have a conversation with the LLM
	 */
	public codeLensButtonSend(codelensParams: any) {
		vscode.commands.executeCommand("vscode-zgsm.view.focus")
		setTimeout(
			() => {
				try {
					this.sendMessage({
						action: "editor.codeLensButtonSend",
						data: codelensParams,
					})
				} catch (error) {
					Logger.log("Failed to start the webview, retrying in 2 seconds", error)
					setTimeout(() => {
						this.sendMessage({
							action: "editor.codeLensButtonSend",
							data: codelensParams,
						})
					}, 2000)
				}
			},
			this.webView ? 0 : 1000,
		)
	}

	/**
	 * User manual panel event
	 */
	public async userHelperDocPanel() {
		if (!ChatViewProvider.provider) throw new Error("ChatViewProvider.provider is undefined")

		const { apiConfiguration } = await ChatViewProvider.provider?.getState()
		vscode.env.openExternal(vscode.Uri.parse(`${apiConfiguration.zgsmSite}`))
	}

	/**
	 * Open the user feedback entry
	 */
	public async userFeedbackIssue() {
		if (!ChatViewProvider.provider) throw new Error("ChatViewProvider is not initialized")

		const { apiConfiguration } = await ChatViewProvider.provider.getState()
		vscode.env.openExternal(vscode.Uri.parse(`${apiConfiguration.zgsmBaseUrl}/issue/`))
	}

	/**
	 * Open a code comparison diff page
	 */
	public async ideDiffCode(data: any) {
		Logger.log("ideDiffCode", data)
		try {
			let fileUri: vscode.Uri | undefined
			let editor: vscode.TextEditor | undefined
			let newContent: string
			const { code, range, key, filePath } = data

			// If no file, start line number is passed, or it is a unit test type, insert directly at the cursor
			if (
				!filePath ||
				range?.startLine === undefined ||
				range?.endLine === undefined ||
				key === CODELENS_FUNC.addTests.key
			) {
				editor = vscode.window.activeTextEditor
				if (!editor) {
					vscode.window.showErrorMessage(t("window.error.failed_to_compare_or_adopt"))
					return
				}
				fileUri = editor.document.uri
				const doc = await vscode.workspace.openTextDocument(fileUri)
				const originalContent = doc.getText()
				// Insert the code at the cursor (or replace the selected block)
				const selection = editor.selection
				const start = doc.offsetAt(selection.start)
				const end = doc.offsetAt(selection.end)
				newContent = originalContent.slice(0, start) + data.code + originalContent.slice(end)
			} else {
				fileUri = vscode.Uri.file(filePath)
				const doc = await vscode.workspace.openTextDocument(fileUri)
				const originalContent = doc.getText()

				if (data.range.startLine < 0 || data.range.endLine <= 0) {
					data.range.startLine = data.range.endLine = 0
				} else if (data.key === CODELENS_FUNC.addComment.key && data.acceptAction !== "replace") {
					// If it is to add a comment, the code is inserted instead of replaced, so handle the line number problem specially
					// Distinguish between function header and function line comments. Here, the web parameter accept_action distinguishes between insertion and replacement insert / replace
					data.range.startLine = data.range.endLine
				} else {
					data.range.endLine = data.range.endLine + 1
				}
				// Overwrite the code snippet to the specified line number range
				const lines = originalContent.split("\n")
				const before = lines.slice(0, data.range.startLine).join("\n")
				const after = lines.slice(data.range.endLine).join("\n")
				newContent = `${before}\n${code}${after}`
			}
			// Write to a temporary file
			const tempDir = getVscodeTempFileDir(codeLensDiffCodeTempFileDir)
			const tempFilePath = path.join(tempDir, "untitled")
			if (!fs.existsSync(tempDir)) {
				fs.mkdirSync(tempDir, { recursive: true })
			}
			if (fs.existsSync(tempFilePath)) {
				fs.unlinkSync(tempFilePath)
			}

			Logger.log("Write to temporary file", tempFilePath)
			fs.writeFileSync(tempFilePath, newContent)

			// Display the diff
			await vscode.commands.executeCommand(
				"vscode.diff",
				vscode.Uri.file(tempFilePath),
				fileUri,
				"ZGSM View Changes",
			)
		} catch (err) {
			Logger.error(`ideDiffCode. fail` + err)
			vscode.window.showInformationMessage(t("window.error.failed_to_display_diff"))
		}
	}

	/**
	 * Insert code at the cursor or within the specified range.
	 */
	public async insertCode(data: any) {
		Logger.log("insertCode", data)
		try {
			let editor: vscode.TextEditor | undefined
			const { code, range, key, filePath } = data

			// If no file or start line number is provided, or it's a unit test type, insert directly at the cursor.
			if (
				!filePath ||
				range?.startLine === undefined ||
				range?.endLine === undefined ||
				key === CODELENS_FUNC.addTests.key
			) {
				editor = vscode.window.activeTextEditor
				if (!editor) {
					vscode.window.showErrorMessage(t("window.error.failed_to_compare_or_adopt"))
					return
				}
				// Insert the code at the cursor (or replace the selected block).
				const snippet = new vscode.SnippetString()
				snippet.appendText(code)
				await editor?.insertSnippet(snippet)
			} else {
				const fileUri = vscode.Uri.file(filePath)
				const doc = await vscode.workspace.openTextDocument(fileUri)
				await vscode.window.showTextDocument(doc)
				editor = vscode.window.activeTextEditor
				// Overwrite the code snippet to the specified line number range.
				if (range.startLine < 0 || range.endLine <= 0) {
					const startPosition = new vscode.Position(0, 0)
					await editor?.edit((editBuilder) => {
						editBuilder.insert(startPosition, code)
					})
				} else {
					let resultRange: vscode.Range
					if (key === CODELENS_FUNC.addComment.key && data.acceptAction !== "replace") {
						range.startLine = range.endLine
						resultRange = new vscode.Range(
							new vscode.Position(range.startLine, 0),
							new vscode.Position(range.endLine, 0),
						)
					} else {
						resultRange = new vscode.Range(
							new vscode.Position(range.startLine, 0),
							new vscode.Position(range.endLine, Number.MAX_VALUE),
						)
					}
					await editor?.edit((editBuilder) => {
						editBuilder.replace(resultRange, code)
					})
				}
			}
		} catch (err) {
			Logger.error(`insertCode. file open fail` + err)
			vscode.window.showInformationMessage(t("window.error.failed_to_open_source_file"))
		}
	}

	/**
	 * Jump to the specified file.
	 */
	public async doJumpByPath(data: any) {
		Logger.log("doJumpByPath", data)
		try {
			let { filePath, lineNumber } = data
			if (filePath.includes("sendQuestion")) {
				return
			}
			if (!filePath) {
				vscode.window.showInformationMessage(t("window.error.failed_to_jump_by_path"))
				return
			}

			// Decode the file path first as Chinese characters may be escaped.
			filePath = decodeURIComponent(filePath)

			if (
				filePath.includes("http://") ||
				filePath.includes("https://") ||
				filePath.startsWith("ftp://") ||
				filePath.includes("www.")
			) {
				vscode.env.openExternal(vscode.Uri.parse(filePath))
				return
			}
			if (fs.existsSync(filePath)) {
				// Check if it's a directory.
				if (fs.statSync(filePath).isDirectory()) {
					// If it's a directory, locate it in the explorer.
					const uri = vscode.Uri.file(filePath)
					vscode.commands.executeCommand("revealInExplorer", uri)
					return
				}
				// Open the file.
				const document = await vscode.workspace.openTextDocument(filePath)
				const editor = await vscode.window.showTextDocument(document)

				if (lineNumber) {
					// Locate to the specified line number.
					const position = new vscode.Position(lineNumber, 0)
					const range = new vscode.Range(position, position)
					editor.selection = new vscode.Selection(position, position)
					editor.revealRange(range, vscode.TextEditorRevealType.InCenter)
				}
			} else {
				Logger.info(`The file path does not exist: ${filePath}`)
				vscode.window.showInformationMessage(t("window.error.failed_to_jump_by_path_not_exist") + filePath)
			}
		} catch (err) {
			Logger.error("doJumpByPath failed:" + err)
			vscode.window.showInformationMessage(t("window.error.failed_to_jump"))
		}
	}

	/**
	 * Process local paths in the content returned by the LLM.
	 */
	private doDealJumpPath(message: any) {
		const mdString: any = this.dealJumpFilePath(message.params)
		this.invokeCallback(message, { data: mdString })
	}

	/**
	 * Perform special processing on file paths in the passed markdown string.
	 */
	private dealJumpFilePath(data: any) {
		Logger.log("dealJumpFilePath", data)
		const { mdString } = data
		try {
			let cleanText = mdString
			if (!mdString) {
				return mdString
			}

			// Define a regular expression to match hyperlinks in the markdown.
			const pattern = /\[(.*?)\]\((.*?)\)/g

			let match: RegExpExecArray | null

			// Process illegal strings and replace them with markdown-supported ones.
			function replaceSymbols(text: String) {
				// Strings to be replaced.
				const replaceMap: { [key: string]: string } = {
					" ": "%20",
					_: "\\_",
				}
				for (const source in replaceMap) {
					const target = replaceMap[source]
					text = text.split(source).join(target)
				}
				return text
			}

			while ((match = pattern.exec(mdString)) !== null) {
				const [hyperlink, fileName, filePath] = match
				if (filePath.includes("sendQuestion")) {
					continue
				}
				// Exclude web hyperlinks.
				if (
					filePath.startsWith("http://") ||
					filePath.startsWith("https://") ||
					filePath.startsWith("ftp://") ||
					filePath.includes("www.")
				) {
					continue
				}

				// Check if the file exists.
				if (!fs.existsSync(filePath)) {
					// If the file does not exist, remove the hyperlink.
					cleanText = cleanText.replace(hyperlink, fileName)
				} else {
					// The file name in the link.
					// const name = path.basename(filePath);

					// const validName = replaceSymbols(name);
					const validFilepath = replaceSymbols(filePath)

					const replaceHyperlink = `[${fileName}](${validFilepath} "${filePath}")`
					cleanText = cleanText.replace(hyperlink, replaceHyperlink)
				}
			}
			Logger.log("dealJumpFilePath close", { data: cleanText })
			return cleanText
		} catch (err) {
			Logger.error(`dealJumpFilePath. fail` + err)
			return mdString
		}
	}
}
