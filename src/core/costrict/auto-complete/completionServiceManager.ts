import * as vscode from "vscode"
import type { InlineCompletionHost } from "./host"
import { InlineCompletionProvider } from "./inlineCompletionProvider"
import { CompletionProvider } from "./core/completionProvider"
import { Package } from "shared/package"
export class CompletionServiceManager {
	private static instance: CompletionServiceManager | null = null
	private readonly context: vscode.ExtensionContext

	public readonly inlineCompletionProvider: InlineCompletionProvider
	private constructor(context: vscode.ExtensionContext, host: InlineCompletionHost) {
		this.context = context
		this.inlineCompletionProvider = new InlineCompletionProvider(context, host)
		this.load()
	}
	public static initialize(context: vscode.ExtensionContext, host: InlineCompletionHost) {
		if (!CompletionServiceManager.instance) {
			CompletionServiceManager.instance = new CompletionServiceManager(context, host)
		}
		return CompletionServiceManager.instance
	}
	private load() {
		this.context.subscriptions.push(
			// Code completion service
			vscode.languages.registerInlineCompletionItemProvider({ pattern: "**" }, this.inlineCompletionProvider),
		)
		this.context.subscriptions.push(
			vscode.commands.registerCommand(`${Package.commandIDPrefix}-completion.shortKeyCut`, async () => {
				await this.context.workspaceState.update("shortCutKeys", true)
				await vscode.commands.executeCommand("editor.action.inlineSuggest.trigger")
			}),
		)
		this.context.subscriptions.push(
			vscode.commands.registerCommand(
				`${Package.commandIDPrefix}-completion.logAutocompleteOutcome`,
				async (completionId: string, completionProvider: CompletionProvider) => {
					completionProvider.accept(completionId)
				},
			),
		)
	}
}
