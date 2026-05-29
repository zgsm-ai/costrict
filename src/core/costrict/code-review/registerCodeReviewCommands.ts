import * as vscode from "vscode"

import { getCommand } from "../../../utils/commands"
import { CostrictCommandId } from "@roo-code/types"
import { getConfiguredUiMode } from "../../../shared/uiMode"
import { isJetbrainsPlatform } from "../../../utils/platform"
import { CloudReviewController } from "./cloud/cloudReviewController"
import { ClassicReviewController } from "./classic/classicReviewController"

/**
 * Register all Code Review commands and dispatch to cloud or classic
 * controllers based on the configured UI mode.
 *
 * A configured cloud controller can be supplied by the lifecycle setup; when
 * omitted, a lightweight default controller is created for command dispatch.
 */
export function registerCodeReviewCommands({
	context,
	outputChannel,
	classicController,
	cloudController,
}: {
	context: vscode.ExtensionContext
	outputChannel: vscode.OutputChannel
	classicController: ClassicReviewController
	cloudController?: CloudReviewController
}): void {
	const cloud = cloudController ?? new CloudReviewController()
	const isJetbrains = isJetbrainsPlatform()

	// ── Command map ──────────────────────────────────────────────────────
	//
	// Commands that exist in both modes dispatch to the appropriate
	// controller based on getConfiguredUiMode().  Classic-only commands
	// (comment-thread operations, JetBrains variants) always route
	// through the classic controller.

	const commandMap: Partial<Record<CostrictCommandId, any>> = {
		codeReviewButtonClicked: async () => {
			if (getConfiguredUiMode() === "cloud") {
				await cloud.codeReviewButtonClicked()
				return
			}
			await classicController.codeReviewButtonClicked(outputChannel)
		},

		codeReview: async () => {
			if (getConfiguredUiMode() === "cloud") {
				await cloud.startSelectedCodeReview()
				return
			}
			await classicController.startSelectedCodeReview()
		},

		securityReviewCode: async () => {
			if (getConfiguredUiMode() === "cloud") {
				await cloud.startSelectedCodeReview("security-review")
				return
			}
			await classicController.startSelectedCodeReview("security-review")
		},

		reviewFilesAndFolders: async (uri: vscode.Uri, selectedUris?: vscode.Uri[]) => {
			const uris = selectedUris?.length ? selectedUris : uri ? [uri] : []
			if (uris.length === 0) return
			const paths = uris.map((u) => u.fsPath)
			if (getConfiguredUiMode() === "cloud") {
				await cloud.startFileOrFolderReview(paths)
				return
			}
			await classicController.startFileOrFolderReview(paths)
		},

		securityFilesAndFolders: async (uri: vscode.Uri, selectedUris?: vscode.Uri[]) => {
			const uris = selectedUris?.length ? selectedUris : uri ? [uri] : []
			if (uris.length === 0) return
			const paths = uris.map((u) => u.fsPath)
			if (getConfiguredUiMode() === "cloud") {
				await cloud.startFileOrFolderReview(paths, "security-review")
				return
			}
			await classicController.startFileOrFolderReview(paths, "security-review")
		},

		reviewCommit: async () => {
			if (getConfiguredUiMode() === "cloud") {
				await cloud.reviewCommit()
				return
			}
			await classicController.reviewCommit()
		},

		// ── Classic-only commands ────────────────────────────────────────

		acceptIssue: async (thread: vscode.CommentThread) => {
			await classicController.acceptIssue(thread)
		},

		rejectIssue: async (thread: vscode.CommentThread) => {
			await classicController.rejectIssue(thread)
		},

		askReviewSuggestionWithAI: async (thread: vscode.CommentThread) => {
			await classicController.askReviewSuggestionWithAI(thread)
		},

		// ── JetBrains-specific commands ──────────────────────────────────

		...(!isJetbrains
			? {}
			: {
					codeReviewJetbrains: async (args: any) => {
						await classicController.codeReviewJetbrains(args)
					},
					reviewFilesAndFoldersJetbrains: async (args: any) => {
						await classicController.reviewFilesAndFoldersJetbrains(args)
					},
					securityFilesAndFoldersJetbrains: async (args: any) => {
						await classicController.securityFilesAndFoldersJetbrains(args)
					},
					acceptIssueJetbrains: async (args: any) => {
						await classicController.acceptIssueJetbrains(args)
					},
					rejectIssueJetbrains: async (args: any) => {
						await classicController.rejectIssueJetbrains(args)
					},
					askReviewSuggestionWithAIJetbrains: async (args: any) => {
						await classicController.askReviewSuggestionWithAIJetbrains(args)
					},
				}),
	}

	for (const [id, callback] of Object.entries(commandMap)) {
		const command = getCommand(id as CostrictCommandId)
		context.subscriptions.push(vscode.commands.registerCommand(command, callback))
	}
}
