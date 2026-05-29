import * as vscode from "vscode"
import type { AxiosRequestConfig } from "axios"
import * as cloudReviewReportWatcher from "../cloudReviewReportWatcher"
import { CostrictAuthService, CostrictAuthConfig } from "../../auth"
import { buildReviewRequestOptions } from "../common/reviewIssueResolver"
import { CloudReviewController } from "./cloudReviewController"

/**
 * Create the cloud request-options builder using the global auth service.
 * This is safe because CostrictAuthService.setProvider() is called earlier
 * in the extension activation sequence. If the auth service is not yet
 * initialized, the builder gracefully returns a config with an empty API key.
 */
function createCloudRequestOptionsBuilder(): () => Promise<AxiosRequestConfig> {
	return async () => {
		try {
			const auth = CostrictAuthService.getInstance()
			const apiKey = (await auth.getCurrentAccessToken()) ?? ""
			return buildReviewRequestOptions({
				apiKey,
				baseURL: CostrictAuthConfig.getInstance().getDefaultApiBaseUrl(),
				language: "en",
			})
		} catch {
			return buildReviewRequestOptions({
				apiKey: "",
				baseURL: CostrictAuthConfig.getInstance().getDefaultApiBaseUrl(),
				language: "en",
			})
		}
	}
}

/**
 * Initialise the cloud review report watcher lifecycle and create a
 * CloudReviewController wired with a request-options builder.
 *
 * Returns the configured controller for use by command registration
 * and the git commit review listener.
 */
export function initCloudReviewLifecycle(
	context: vscode.ExtensionContext,
	outputChannel: vscode.OutputChannel,
): CloudReviewController {
	cloudReviewReportWatcher.setLogger(outputChannel)

	context.subscriptions.push(
		vscode.workspace.onDidChangeWorkspaceFolders((event) => {
			for (const workspaceFolder of event.removed) {
				cloudReviewReportWatcher.stopWatching(workspaceFolder)
			}
		}),
		{ dispose: () => cloudReviewReportWatcher.disposeAll() },
	)

	const requestOptionsBuilder = createCloudRequestOptionsBuilder()
	return new CloudReviewController(requestOptionsBuilder)
}
