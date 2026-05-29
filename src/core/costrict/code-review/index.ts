import * as vscode from "vscode"

import type { ClineProvider } from "../../webview/ClineProvider"
import { ReviewTargetType } from "../../../shared/codeReview"
import { CodeReviewService } from "./codeReviewService"
import { HistoryManager } from "./HistoryManager"
import { registerCodeReviewCommands } from "./registerCodeReviewCommands"
import { initCloudReviewLifecycle } from "./cloud/cloudReviewLifecycle"
import { createClassicReviewController } from "./classic/classicReviewController"
import {
	startGitCommitReviewListener,
	disposeGitCommitReviewListener,
} from "./gitCommitReview/gitCommitReviewLifecycle"

/**
 * Initialise the full Code Review subsystem.
 *
 * This is intentionally a thin facade — it wires together cloud lifecycle,
 * classic controller creation, command registration, and the mode-agnostic
 * Git commit listener, then delegates all real work to the appropriate modules.
 */
export function initCodeReview(
	context: vscode.ExtensionContext,
	provider: ClineProvider,
	outputChannel: vscode.OutputChannel,
) {
	const cloudController = initCloudReviewLifecycle(context, outputChannel)

	const classicController = createClassicReviewController({ context, provider })
	registerCodeReviewCommands({ context, outputChannel, classicController, cloudController })
	startGitCommitReviewListener(context, provider, cloudController)
}

/**
 * Dispose the Git commit review listener (supports both classic and cloud modes).
 * Safe to call regardless of whether the listener was started.
 */
export function disposeGitCommitListener(): void {
	disposeGitCommitReviewListener()
}

// ── Compatibility re-exports ───────────────────────────────────────────

export { CodeReviewService, ReviewTargetType, HistoryManager }
export type { ReviewHistoryEntry } from "../../../shared/codeReview"
