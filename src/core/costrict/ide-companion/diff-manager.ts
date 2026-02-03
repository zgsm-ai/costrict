/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { IdeDiffAcceptedNotificationSchema, IdeDiffRejectedNotificationSchema } from "./types"
import { type JSONRPCNotification } from "@modelcontextprotocol/sdk/types.js"
import * as path from "node:path"
import * as vscode from "vscode"
import { DIFF_SCHEME } from "./extension.js"

export class DiffContentProvider implements vscode.TextDocumentContentProvider {
	private content = new Map<string, string>()
	private onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>()

	get onDidChange(): vscode.Event<vscode.Uri> {
		return this.onDidChangeEmitter.event
	}

	provideTextDocumentContent(uri: vscode.Uri): string {
		return this.content.get(uri.toString()) ?? ""
	}

	setContent(uri: vscode.Uri, content: string): void {
		this.content.set(uri.toString(), content)
		this.onDidChangeEmitter.fire(uri)
	}

	deleteContent(uri: vscode.Uri): void {
		this.content.delete(uri.toString())
	}

	getContent(uri: vscode.Uri): string | undefined {
		return this.content.get(uri.toString())
	}
}

// Information about a diff view that is currently open.
interface DiffInfo {
	originalFilePath: string
	newContent: string
	rightDocUri: vscode.Uri
}

/**
 * Manages the state and lifecycle of diff views within the IDE.
 */
export class DiffManager {
	private readonly onDidChangeEmitter = new vscode.EventEmitter<JSONRPCNotification>()
	readonly onDidChange = this.onDidChangeEmitter.event
	private diffDocuments = new Map<string, DiffInfo>()
	private readonly subscriptions: vscode.Disposable[] = []
	// 会话期间的"总是允许"缓存
	private alwaysAllowedPaths: Set<string> = new Set()
	// ClineProvider 弱引用,用于 webview 通信
	private clineProviderRef?: WeakRef<any>

	constructor(
		private readonly log: (message: string) => void,
		private readonly diffContentProvider: DiffContentProvider,
	) {
		this.subscriptions.push(
			vscode.window.onDidChangeActiveTextEditor((editor) => {
				this.onActiveEditorChange(editor)
			}),
		)

		this.onActiveEditorChange(vscode.window.activeTextEditor)
	}

	/**
	 * Set ClineProvider reference for webview communication
	 */
	setClineProvider(provider: any) {
		if (provider && typeof provider === "object") {
			this.clineProviderRef = new WeakRef(provider)
		} else {
			this.log(`[DiffManager] Invalid provider for WeakRef: ${typeof provider}`)
		}
	}

	dispose() {
		for (const subscription of this.subscriptions) {
			subscription.dispose()
		}
	}

	/**
	 * Creates and shows a new diff view.
	 */
	async showDiff(filePath: string, newContent: string) {
		const fileUri = vscode.Uri.file(filePath)

		const rightDocUri = vscode.Uri.from({
			scheme: DIFF_SCHEME,
			path: filePath,
			// cache busting
			query: `rand=${Math.random()}`,
		})
		this.diffContentProvider.setContent(rightDocUri, newContent)

		this.addDiffDocument(rightDocUri, {
			originalFilePath: filePath,
			newContent,
			rightDocUri,
		})

		const diffTitle = `${path.basename(filePath)} ↔ Modified`
		await vscode.commands.executeCommand("setContext", "costrict.diff.isVisible", true)

		let leftDocUri
		try {
			await vscode.workspace.fs.stat(fileUri)
			leftDocUri = fileUri
		} catch {
			// We need to provide an empty document to diff against.
			// Using the 'untitled' scheme is one way to do this.
			leftDocUri = vscode.Uri.from({
				scheme: "untitled",
				path: filePath,
			})
		}

		await vscode.commands.executeCommand("vscode.diff", leftDocUri, rightDocUri, diffTitle, {
			preview: false,
			preserveFocus: true,
		})
		await vscode.commands.executeCommand("workbench.action.files.setActiveEditorWriteableInSession")

		// 检查是否已经在"总是允许"列表中
		if (this.alwaysAllowedPaths.has(filePath)) {
			// 自动接受
			await this.acceptDiff(rightDocUri)
			return
		}

		// 尝试通过 webview 显示确认对话框
		const provider = this.clineProviderRef?.deref()
		if (provider && typeof provider.postMessageToWebview === "function") {
			try {
				await provider.postMessageToWebview({
					type: "showIdeDiffConfirmDialog",
					ideDiffConfirm: {
						filePath,
						fileName: path.basename(filePath),
					},
				})
				// 消息已发送到 webview,等待用户响应
				return
			} catch (error) {
				this.log(`Failed to send message to webview: ${error}`)
				// 降级到原生对话框
			}
		}

		// Fallback: 使用 VSCode 原生对话框
		const choice = await vscode.window.showInformationMessage(
			`Gemini CLI 请求修改文件: ${path.basename(filePath)}\n是否允许此操作?`,
			{ modal: true },
			"接受",
			"拒绝",
			"总是允许",
		)

		if (choice === "接受") {
			await this.acceptDiff(rightDocUri)
		} else if (choice === "拒绝") {
			await this.cancelDiff(rightDocUri)
		} else if (choice === "总是允许") {
			this.alwaysAllowedPaths.add(filePath)
			await this.acceptDiff(rightDocUri)
		} else {
			await this.cancelDiff(rightDocUri)
		}
	}

	/**
	 * Closes an open diff view for a specific file.
	 */
	async closeDiff(filePath: string) {
		let uriToClose: vscode.Uri | undefined
		for (const [uriString, diffInfo] of this.diffDocuments.entries()) {
			if (diffInfo.originalFilePath === filePath) {
				uriToClose = vscode.Uri.parse(uriString)
				break
			}
		}

		if (uriToClose) {
			const rightDoc = await vscode.workspace.openTextDocument(uriToClose)
			const modifiedContent = rightDoc.getText()
			await this.closeDiffEditor(uriToClose)
			return modifiedContent
		}
		return
	}

	/**
	 * User accepts the changes in a diff view. Does not apply changes.
	 */
	async acceptDiff(rightDocUri: vscode.Uri) {
		const diffInfo = this.diffDocuments.get(rightDocUri.toString())
		if (!diffInfo) {
			return
		}

		const rightDoc = await vscode.workspace.openTextDocument(rightDocUri)
		const modifiedContent = rightDoc.getText()
		await this.closeDiffEditor(rightDocUri)

		this.onDidChangeEmitter.fire(
			IdeDiffAcceptedNotificationSchema.parse({
				jsonrpc: "2.0",
				method: "ide/diffAccepted",
				params: {
					filePath: diffInfo.originalFilePath,
					content: modifiedContent,
				},
			}),
		)
	}

	/**
	 * Called when a user cancels a diff view.
	 */
	async cancelDiff(rightDocUri: vscode.Uri) {
		const diffInfo = this.diffDocuments.get(rightDocUri.toString())
		if (!diffInfo) {
			await this.closeDiffEditor(rightDocUri)
			return
		}

		const rightDoc = await vscode.workspace.openTextDocument(rightDocUri)
		const modifiedContent = rightDoc.getText()
		await this.closeDiffEditor(rightDocUri)

		this.onDidChangeEmitter.fire(
			IdeDiffRejectedNotificationSchema.parse({
				jsonrpc: "2.0",
				method: "ide/diffRejected",
				params: {
					filePath: diffInfo.originalFilePath,
					content: modifiedContent,
				},
			}),
		)
	}

	private async onActiveEditorChange(editor: vscode.TextEditor | undefined) {
		let isVisible = false
		if (editor) {
			isVisible = this.diffDocuments.has(editor.document.uri.toString())
			if (!isVisible) {
				for (const document of this.diffDocuments.values()) {
					if (document.originalFilePath === editor.document.uri.fsPath) {
						isVisible = true
						break
					}
				}
			}
		}
		await vscode.commands.executeCommand("setContext", "costrict.diff.isVisible", isVisible)
	}

	private addDiffDocument(uri: vscode.Uri, diffInfo: DiffInfo) {
		this.diffDocuments.set(uri.toString(), diffInfo)
	}

	private async closeDiffEditor(rightDocUri: vscode.Uri) {
		const diffInfo = this.diffDocuments.get(rightDocUri.toString())
		await vscode.commands.executeCommand("setContext", "costrict.diff.isVisible", false)

		if (diffInfo) {
			this.diffDocuments.delete(rightDocUri.toString())
			this.diffContentProvider.deleteContent(rightDocUri)
		}

		// Find and close the tab corresponding to the diff view
		for (const tabGroup of vscode.window.tabGroups.all) {
			for (const tab of tabGroup.tabs) {
				const input = tab.input as {
					modified?: vscode.Uri
					original?: vscode.Uri
				}
				if (input && input.modified?.toString() === rightDocUri.toString()) {
					await vscode.window.tabGroups.close(tab)
					return
				}
			}
		}
	}

	/**
	 * Accept diff by file path (called from webview response handler)
	 */
	async acceptDiffByPath(filePath: string) {
		const diffInfo = Array.from(this.diffDocuments.values()).find((info) => info.originalFilePath === filePath)
		if (diffInfo) {
			await this.acceptDiff(diffInfo.rightDocUri)
		}
	}

	/**
	 * Cancel diff by file path (called from webview response handler)
	 */
	async cancelDiffByPath(filePath: string) {
		const diffInfo = Array.from(this.diffDocuments.values()).find((info) => info.originalFilePath === filePath)
		if (diffInfo) {
			await this.cancelDiff(diffInfo.rightDocUri)
		}
	}

	/**
	 * Add path to always-allowed list
	 */
	addAlwaysAllowPath(filePath: string) {
		this.alwaysAllowedPaths.add(filePath)
	}

	/**
	 * 清除所有"总是允许"的授权
	 */
	clearAlwaysAllowedPaths() {
		this.alwaysAllowedPaths.clear()
	}
}
