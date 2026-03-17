import * as vscode from "vscode"

import type { TerminalManager } from "./terminalManager"
import { getActiveFileContext, getOpenTabs } from "./editorContext"

/**
 * Watches VSCode editor events and pushes context to the embedded CLI
 * via the TerminalManager HTTP API (appendPrompt).
 *
 * Lifecycle: create → activate(context) → dispose()
 */
export class EditorWatcher implements vscode.Disposable {
	private disposables: vscode.Disposable[] = []
	private debounceTimer: ReturnType<typeof setTimeout> | null = null
	private static readonly DEBOUNCE_MS = 500
	private initialContextPushed = false

	constructor(private terminalManager: TerminalManager) {}

	/**
	 * Register editor event listeners.
	 */
	activate(context: vscode.ExtensionContext): void {
		// this.disposables.push(
		// 	vscode.window.onDidChangeActiveTextEditor(() => {
		// 		this.debouncePushActiveFile()
		// 	}),
		// 	vscode.window.onDidChangeTextEditorSelection(() => {
		// 		this.debouncePushActiveFile()
		// 	}),
		// )
		// // Register all disposables with the extension context
		// for (const d of this.disposables) {
		// 	context.subscriptions.push(d)
		// }
	}

	// /**
	//  * Push the initial editor context (open tabs + active file) once
	//  * after the CLI HTTP server is confirmed ready.
	//  */
	// async pushInitialContext(): Promise<void> {
	// 	if (this.initialContextPushed) {
	// 		return
	// 	}
	// 	if (!this.terminalManager.running || !this.terminalManager.getPort()) {
	// 		return
	// 	}

	// 	this.initialContextPushed = true

	// 	// Push active file context
	// 	const fileCtx = getActiveFileContext()
	// 	if (fileCtx) {
	// 		try {
	// 			await this.terminalManager.appendPrompt(`In ${fileCtx.fileRef}`)
	// 		} catch {
	// 			// HTTP not available — silently skip
	// 		}
	// 	}
	// }

	// /**
	//  * Debounced push of the current active file reference to the CLI.
	//  */
	// private debouncePushActiveFile(): void {
	// 	if (this.debounceTimer) {
	// 		clearTimeout(this.debounceTimer)
	// 	}
	// 	this.debounceTimer = setTimeout(() => {
	// 		this.debounceTimer = null
	// 		void this.pushActiveFile()
	// 	}, EditorWatcher.DEBOUNCE_MS)
	// }

	// private async pushActiveFile(): Promise<void> {
	// 	if (!this.terminalManager.running || !this.terminalManager.getPort()) {
	// 		return
	// 	}
	// 	const fileCtx = getActiveFileContext()
	// 	if (!fileCtx) {
	// 		return
	// 	}
	// 	try {
	// 		await this.terminalManager.appendPrompt(`In ${fileCtx.fileRef}`)
	// 	} catch {
	// 		// HTTP not available — silently skip
	// 	}
	// }

	dispose(): void {
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer)
			this.debounceTimer = null
		}
		for (const d of this.disposables) {
			d.dispose()
		}
		this.disposables = []
		this.initialContextPushed = false
	}
}
