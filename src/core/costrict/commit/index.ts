/**
 * Commit generation module for ZGSM
 *
 * Provides functionality to generate commit messages based on local changes
 * and populate them in VSCode's SCM input.
 */
import * as vscode from "vscode"
import { CommitService } from "./commitService"
import { t } from "../../../i18n"
import { type ClineProvider } from "../../webview/ClineProvider"

export * from "./types"
export * from "./commitGenerator"
export * from "./commitService"

/**
 * Commit generation command handler
 */
// Execution lock to prevent concurrent calls
let isExecuting = false

export async function handleGenerateCommitMessage(
	provider: ClineProvider,
	cb: any,
	workspaceRootHint?: string,
): Promise<void> {
	// Use the hint (from SCM SourceControl rootUri) if provided, otherwise fall back to first workspace folder
	const workspaceRoot = workspaceRootHint || CommitService.getWorkspaceRoot()
	if (!workspaceRoot) {
		throw new Error(t("commit:commit.error.noWorkspace"))
	}

	const isGitRepo = await CommitService.isGitRepository(workspaceRoot)
	if (!isGitRepo) {
		throw new Error(t("commit:commit.error.notGitRepo"))
	}

	// Check if execution is already in progress
	if (isExecuting) {
		vscode.window.showInformationMessage(t("commit:commit.message.executing"))
		return
	}

	try {
		// Set execution lock
		isExecuting = true

		// Always create a new instance to ensure correct workspaceRoot in multi-root scenarios
		const commitServiceInstance = new CommitService()
		commitServiceInstance.initialize(workspaceRoot, provider)

		await commitServiceInstance.generateAndPopulateCommitMessage(cb)
		isExecuting = false
	} catch (error) {
		// Reset lock on error to allow recovery
		isExecuting = false
		throw error
	}
}
