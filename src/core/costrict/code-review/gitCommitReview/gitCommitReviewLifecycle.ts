import * as vscode from "vscode"
import { getConfiguredUiMode } from "../../../../shared/uiMode"
import { isJetbrainsPlatform } from "../../../../utils/platform"
import { GitCommitListener, type GitCommitReviewHandler } from "../gitCommitListener"
import { CodeReviewService } from "../codeReviewService"
import { ClassicGitCommitReviewHandler } from "./classicGitCommitReviewHandler"
import { CloudGitCommitReviewHandler } from "./cloudGitCommitReviewHandler"
import { CloudReviewController } from "../cloud/cloudReviewController"
import type { ClineProvider } from "../../../webview/ClineProvider"

let commitListener: GitCommitListener | undefined

// Cached handler instances to avoid re-creating controllers on every commit.
let cloudHandler: CloudGitCommitReviewHandler | undefined
let classicHandler: ClassicGitCommitReviewHandler | undefined

/**
 * Start the Git commit review listener.
 *
 * Automatically selects the appropriate handler (classic or cloud) based on the
 * configured UI mode. Does nothing on the JetBrains platform where the VS Code
 * Git extension is unavailable.
 *
 * Idempotent: safe to call multiple times — subsequent calls are no-ops if the
 * listener is already running.
 *
 * @param context - VS Code extension context for globalState and subscriptions.
 * @param provider - Optional ClineProvider for logging (classic mode only).
 */
export function startGitCommitReviewListener(
	context: vscode.ExtensionContext,
	provider?: ClineProvider,
	cloudController?: CloudReviewController,
): void {
	if (isJetbrainsPlatform()) {
		console.log("Running on JetBrains platform, Git extension dependency not required")
		return
	}

	// Guard against duplicate registration (e.g. if initCodeReview is called multiple times).
	if (commitListener) {
		return
	}

	const getHandler = (): GitCommitReviewHandler => {
		if (getConfiguredUiMode() === "cloud") {
			return (cloudHandler ??= new CloudGitCommitReviewHandler(cloudController ?? new CloudReviewController()))
		}
		return (classicHandler ??= new ClassicGitCommitReviewHandler(CodeReviewService.getInstance()))
	}

	commitListener = new GitCommitListener(context, getHandler)
	commitListener.startListening().catch((error) => {
		if (provider) {
			provider.log(`[GitCommitListener] Failed to start: ${error}`)
		} else {
			console.error(`[GitCommitListener] Failed to start: ${error}`)
		}
	})
}

/**
 * Dispose the Git commit review listener if it was started.
 */
export function disposeGitCommitReviewListener(): void {
	if (commitListener) {
		commitListener.getDisposables().forEach((d) => d.dispose())
		commitListener = undefined
	}
	cloudHandler = undefined
	classicHandler = undefined
}
