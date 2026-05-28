import * as vscode from "vscode"
import type { ClineProvider } from "../../webview/ClineProvider"
import { CompletionStatusBar } from "./statusBar"
import { CompletionServiceManager } from "./completionServiceManager"
import { ClineInlineCompletionHost } from "./host"
export { CompletionStatusBar } from "./statusBar"
export const registerAutoCompletionProvider = (context: vscode.ExtensionContext, provider: ClineProvider) => {
	const statusBar = CompletionStatusBar.getInstance()
	statusBar.init(context)
	const host = new ClineInlineCompletionHost(provider)
	CompletionServiceManager.initialize(context, host)
}
