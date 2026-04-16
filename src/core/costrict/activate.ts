/**
 * ZGSM Core Activation Module
 *
 * Handles the activation and initialization of all ZGSM functionality
 * including completion providers, codelens providers, and command registration.
 */

import * as vscode from "vscode"
import { getTerminalManager, cleanupStaleProcesses } from "./cli-wrap"
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
import { initCodeReview, disposeGitCommitListener } from "./code-review"
import { initTelemetry } from "./telemetry"
import { initErrorCodeManager } from "./error-code"
import { initNotificationService, NotificationService } from "./notification"
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
import { ensureCompletionRuntimeReady, writeCostrictRuntimeAuth } from "./runtime-config"
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
	// void logger
	CostrictAuthStorage.setProvider(provider)
	CostrictAuthApi.setProvider(provider)
	CostrictAuthService.setProvider(provider)
	CostrictAuthCommands.setProvider(provider)

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

	void cleanupStaleProcesses(context)
	getTerminalManager().setExtensionContext(context)

	initErrorCodeManager(provider)
	await initialize(provider, logger)
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
	try {
		const isLoggedIn = await costrictAuthService.checkLoginStatusOnStartup()

		if (isLoggedIn) {
			costrictAuthService.getTokens().then(async (tokens) => {
				if (!tokens) {
					return
				}
				provider.log(`Login status detected at plugin startup: valid (${tokens.state})`)
				void writeCostrictRuntimeAuth(tokens.access_token, tokens.refresh_token)
					.then(() => ensureCompletionRuntimeReady())
					.catch((error) => {
						provider.log(
							`Failed to prepare completion runtime on startup: ${error instanceof Error ? error.message : String(error)}`,
						)
					})
				costrictAuthService.startTokenRefresh(tokens.refresh_token, getClientId(), tokens.state)
				costrictAuthService.updateUserInfo(tokens.access_token)
			})
		} else {
			loginTip = () => {
				costrictAuthService.getTokens().then(async (tokens) => {
					if (!tokens) {
						getPanel()?.webview.postMessage({
							type: "showReauthConfirmationDialog",
							messageTs: new Date().getTime(),
						})
					}
				})
			}
		}
	} catch (error) {
		provider.log("Failed to check login status at startup: " + (error as Error).message)
	}

	initCodeReview(context, provider, outputChannel)
	initTelemetry(provider)

	if (!isCliPatform()) {
		context.subscriptions.push(
			vscode.commands.registerTextEditorCommand(
				codeLensCallBackCommand.command,
				codeLensCallBackCommand.callback(context),
			),
			vscode.commands.registerTextEditorCommand(
				codeLensCallBackMoreCommand.command,
				codeLensCallBackMoreCommand.callback(context),
			),
		)
	}

	if (isVscodePlatform) {
		context.subscriptions.push(vscode.languages.registerCodeLensProvider("*", new CostrictCodeLensProvider()))
		const configChanged = vscode.workspace.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration(configCompletion)) {
				updateCompletionConfig()
			}
			if (e.affectsConfiguration(configCodeLens)) {
				updateCodelensConfig()
			}
			completionStatusBar.setEnableState()
		})
		context.subscriptions.push(configChanged)
	}

	const tokens = await CostrictAuthStorage.getInstance().getTokens()
	if (isVscodePlatform) {
		if (tokens?.access_token) {
			completionStatusBar.setEnableState()
		} else {
			completionStatusBar.fail({
				message: OPENAI_CLIENT_NOT_INITIALIZED,
			})
		}
	}

	await initNotificationService(provider)
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
	void getTerminalManager().dispose()
	void NotificationService.getInstance().stopPeriodicFetch()
	void disposeGitCommitListener()
	void disconnectIPC()
	void stopIPCServer()
	loggerDeactivate()
}
