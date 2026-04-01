/**
 * ZGSM Core Activation Module
 *
 * Handles the activation and initialization of all ZGSM functionality
 * including completion providers, codelens providers, and command registration.
 */

import * as vscode from "vscode"
import { getTerminalManager } from "./cli-wrap"
import type { ClineProvider } from "../webview/ClineProvider"
import { registerAutoCompletionProvider, CompletionStatusBar } from "./auto-complete"

import { CostrictCodeLensProvider, codeLensCallBackCommand, codeLensCallBackMoreCommand } from "./codelens"

import {
	configCompletion,
	configCodeLens,
	OPENAI_CLIENT_NOT_INITIALIZED,
	updateCodelensConfig,
	updateCompletionConfig,
	initLangSetting,
	printLogo,
	loadLocalLanguageExtensions,
} from "./base/common"
import { CostrictAuthApi, CostrictAuthCommands, CostrictAuthService, CostrictAuthStorage } from "./auth"
import { initCodeReview, disposeGitCommitListener, CodeReviewService } from "./code-review"
import { initTelemetry } from "./telemetry"
import { initErrorCodeManager } from "./error-code"
import { NotificationService } from "./notification"
import { Package } from "../../shared/package"
import { createLogger, ILogger, deactivate as loggerDeactivate } from "../../utils/logger"
import {
	connectIPC,
	disconnectIPC,
	onCloseWindow,
	onCostrictLogout,
	onCostrictTokensUpdate,
	startIPCServer,
	stopIPCServer,
} from "./auth/ipc"
import { generateNewSessionClientId, getClientId } from "../../utils/getClientId"
import CostrictCodebaseIndexManager, { costrictCodebaseIndexManager } from "./codebase-index"
import { workspaceEventMonitor } from "./codebase-index/workspace-event-monitor"
import { initGitCheckoutDetector } from "./codebase-index/git-checkout-detector"
import { writeCostrictAccessToken } from "./codebase-index/utils"
import { getPanel } from "../../activate/registerCommands"
import { t } from "../../i18n"
import prettyBytes from "pretty-bytes"
import { isCliPatform, isJetbrainsPlatform } from "../../utils/platform"
import { updateDefaultDebug } from "../../utils/getDebugState"

const HISTORY_WARN_SIZE = 1000 * 1000 * 1000 * 3

/**
 * Initialization entry
 */
async function initialize(provider: ClineProvider, logger: ILogger) {
	const oldDebug = provider.getValue("debug")
	const codeMode = provider.getValue("costrictCodeMode")
	const oldEnabled = provider.getValue("costrictCodebaseIndexEnabled")
	if (oldEnabled == null) {
		await provider.setValue("costrictCodebaseIndexEnabled", false)
	}

	switch (codeMode) {
		case "plan":
			await provider.setValue("mode", codeMode)
			break
		case "strict":
			await provider.setValue("mode", codeMode)
			break
		default:
			await provider.setValue("mode", "code")
			break
	}

	updateDefaultDebug(oldDebug ?? false)
	//
	CostrictAuthStorage.setProvider(provider)
	CostrictAuthApi.setProvider(provider)
	CostrictAuthService.setProvider(provider)
	CostrictAuthCommands.setProvider(provider)

	//
	costrictCodebaseIndexManager.setProvider(provider)
	costrictCodebaseIndexManager.setLogger(logger)
	workspaceEventMonitor.setProvider(provider)
	workspaceEventMonitor.setLogger(logger)

	//
	printLogo()
	initLangSetting()
	loadLocalLanguageExtensions()
}

/**
 * Entry function when the ZGSM extension is activated
 */
export async function activate(
	context: vscode.ExtensionContext,
	provider: ClineProvider,
	outputChannel: vscode.OutputChannel,
) {
	const isJetbrains = isJetbrainsPlatform()
	const isVscodePlatform = !isJetbrains && !isCliPatform()
	const logger = createLogger(Package.outputChannel)
	initErrorCodeManager(provider)
	initGitCheckoutDetector(context, logger)
	await initialize(provider, logger)
	// Start IPC server in background – never block extension activation.
	void startIPCServer()
		.then(() => connectIPC())
		.catch((err) => console.error("IPC startup failed:", err))

	if (isVscodePlatform) {
		registerAutoCompletionProvider(context, provider)
	}
	const completionStatusBar = CompletionStatusBar.getInstance()

	const costrictAuthService = CostrictAuthService.getInstance()
	context.subscriptions.push(costrictAuthService)
	context.subscriptions.push(
		onCostrictTokensUpdate((tokens: { state: string; access_token: string; refresh_token: string }) => {
			costrictAuthService.saveTokens(tokens)
			provider.log("Auth tokens refreshed from another window")
		}),
		onCostrictLogout((sessionId: string) => {
			if (generateNewSessionClientId() === sessionId) return
			costrictAuthService.logout(true)
			provider.log(`logout from other window`)
		}),
		onCloseWindow((sessionId: string) => {
			if (generateNewSessionClientId() === sessionId) return
			vscode.commands.executeCommand("workbench.action.closeWindow")
		}),
	)
	const costrictAuthCommands = CostrictAuthCommands.getInstance()
	context.subscriptions.push(costrictAuthCommands)

	costrictAuthCommands.registerCommands(context)

	provider.setCostrictAuthCommands(costrictAuthCommands)
	let loginTip = () => {}
	/**
	 * Check login status when plugin starts
	 */
	try {
		const isLoggedIn = await costrictAuthService.checkLoginStatusOnStartup()

		if (isLoggedIn) {
			costrictAuthService.getTokens().then(async (tokens) => {
				if (!tokens) {
					return
				}
				provider.log(`Login status detected at plugin startup: valid (${tokens.state})`)
				void writeCostrictAccessToken(tokens.access_token, tokens.refresh_token)
					.then(async () => {
						const { apiConfiguration } = await provider.getState()
						if (apiConfiguration.apiProvider !== "costrict") {
							return
						}

						setTimeout(() => {
							void (async () => {
								try {
									await costrictCodebaseIndexManager.ensureInitialized("activate")
									await costrictCodebaseIndexManager.syncToken()
									if (apiConfiguration.costrictCodebaseIndexEnabled) {
										await workspaceEventMonitor.initialize()
									}
								} catch (error) {
									provider.log(
										`Deferred codebase index startup failed: ${error instanceof Error ? error.message : String(error)}`,
									)
								}
							})()
						}, 3000)
					})
					.catch((error) => {
						provider.log(
							`Failed to persist auth token for codebase index startup: ${error instanceof Error ? error.message : String(error)}`,
						)
					})
				costrictAuthService.startTokenRefresh(tokens.refresh_token, getClientId(), tokens.state)
				costrictAuthService.updateUserInfo(tokens.access_token)
			})
			// Start token refresh timer
		} else {
			loginTip = () => {
				costrictAuthService.getTokens().then(async (tokens) => {
					if (!tokens) {
						getPanel()?.webview.postMessage({
							type: "showReauthConfirmationDialog",
							messageTs: new Date().getTime(),
						})
						return
					}
				})
			}
		}
	} catch (error) {
		provider.log("Failed to check login status at startup: " + error.message)
	}
	initCodeReview(context, provider, outputChannel)
	initTelemetry(provider)

	if (!isCliPatform()) {
		context.subscriptions.push(
			// Register codelens related commands
			vscode.commands.registerTextEditorCommand(
				codeLensCallBackCommand.command,
				codeLensCallBackCommand.callback(context),
			),
			// Construct instruction set
			vscode.commands.registerTextEditorCommand(
				codeLensCallBackMoreCommand.command,
				codeLensCallBackMoreCommand.callback(context),
			),
		)
	}

	if (isVscodePlatform) {
		context.subscriptions.push(
			// Register function header menu
			vscode.languages.registerCodeLensProvider("*", new CostrictCodeLensProvider()),
		)
		// Listen for configuration changes
		const configChanged = vscode.workspace.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration(configCompletion)) {
				// Code completion settings changed
				updateCompletionConfig()
			}
			if (e.affectsConfiguration(configCodeLens)) {
				// Function Quick Commands settings changed
				updateCodelensConfig()
			}
			// CompletionStatusBar.initByConfig()
			completionStatusBar.setEnableState()
		})
		context.subscriptions.push(configChanged)
	}

	// Get costrictRefreshToken without webview resolve
	const tokens = await CostrictAuthStorage.getInstance().getTokens()
	if (isVscodePlatform) {
		if (tokens?.access_token) {
			// CompletionStatusBar.initByConfig()
			completionStatusBar.setEnableState()
		} else {
			completionStatusBar.fail({
				message: OPENAI_CLIENT_NOT_INITIALIZED,
			})
		}
	}
	provider.getState().then((state) => {
		const size = (state.taskHistory || []).reduce((p, c) => p + Number(c.size), 0)
		if (size > HISTORY_WARN_SIZE) {
			const btnText = t("common:history.viewAllHistory")
			vscode.window
				.showWarningMessage(t("common:history.warn", { size: prettyBytes(HISTORY_WARN_SIZE) }), btnText)
				.then((selection) => {
					if (btnText === selection) {
						provider.postMessageToWebview({ type: "action", action: "switchTab", tab: "history" })
					}
				})
		}
	})
	setTimeout(() => {
		loginTip()
	}, 2000)
}

/**
 * Deactivation function for ZGSM
 */
export async function deactivate() {
	// Dispose CLI terminal manager to kill any running PTY process
	void getTerminalManager().dispose()

	// Stop periodic health checks
	void CostrictCodebaseIndexManager.getInstance().stopHealthCheck()

	// Stop periodic notice fetching
	void NotificationService.getInstance().stopPeriodicFetch()

	// Dispose git commit listener
	void disposeGitCommitListener()

	// Dispose code review service (saves history)
	void (await CodeReviewService.getInstance().dispose())

	// CostrictCodebaseIndexManager.getInstance().stopExistingClient()
	// Clean up IPC connections
	void disconnectIPC()
	void stopIPCServer()
	// Clean up workspace event monitoring
	void workspaceEventMonitor.handleVSCodeClose()

	// Currently no specific cleanup needed
	loggerDeactivate()
}
