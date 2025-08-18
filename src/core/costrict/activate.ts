/**
 * ZGSM Core Activation Module
 *
 * Handles the activation and initialization of all ZGSM functionality
 * including completion providers, codelens providers, and command registration.
 */

import * as vscode from "vscode"
import type { ClineProvider } from "../webview/ClineProvider"

// Import from migrated modules
import { AICompletionProvider, CompletionStatusBar, shortKeyCut } from "./completion"

import { MyCodeLensProvider, codeLensCallBackCommand, codeLensCallBackMoreCommand } from "./codelens"

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
import { ZgsmAuthApi, ZgsmAuthCommands, ZgsmAuthConfig, ZgsmAuthService, ZgsmAuthStorage } from "./auth"
import { initCodeReview } from "./code-review"
import { initTelemetry } from "./telemetry"
import { initErrorCodeManager } from "./error-code"
import { Package } from "../../shared/package"
import { createLogger, ILogger, deactivate as loggerDeactivate } from "../../utils/logger"
import { connectIPC, disconnectIPC, onZgsmLogout, onZgsmTokensUpdate, startIPCServer, stopIPCServer } from "./auth/ipc"
import { getClientId } from "../../utils/getClientId"
import ZgsmCodebaseIndexManager, { zgsmCodebaseIndexManager } from "./codebase-index"
import { workspaceEventMonitor } from "./codebase-index/workspace-event-monitor"
import { initGitCheckoutDetector } from "./codebase-index/git-checkout-detector"
import { writeAccessToken } from "./codebase-index/utils"

/**
 * Initialization entry
 */
async function initialize(provider: ClineProvider, logger: ILogger) {
	//
	ZgsmAuthStorage.setProvider(provider)
	ZgsmAuthApi.setProvider(provider)
	ZgsmAuthService.setProvider(provider)
	ZgsmAuthCommands.setProvider(provider)

	//
	zgsmCodebaseIndexManager.setProvider(provider)
	zgsmCodebaseIndexManager.setLogger(logger)
	workspaceEventMonitor.setProvider(provider)
	workspaceEventMonitor.setLogger(logger)
	console.log("test test")
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
	const logger = createLogger(Package.outputChannel, { channel: outputChannel })
	initErrorCodeManager(provider)
	initGitCheckoutDetector(context, logger)
	await initialize(provider, logger)
	startIPCServer()
	connectIPC()

	const zgsmAuthService = ZgsmAuthService.getInstance()
	context.subscriptions.push(zgsmAuthService)
	context.subscriptions.push(
		onZgsmTokensUpdate((tokens: { state: string; access_token: string; refresh_token: string }) => {
			zgsmAuthService.saveTokens(tokens)
			provider.log(`new token from other window: ${tokens.access_token}`)
		}),
		onZgsmLogout((sessionId: string) => {
			if (vscode.env.sessionId === sessionId) return
			zgsmAuthService.logout(true)
			provider.log(`logout from other window`)
		}),
	)
	const zgsmAuthCommands = ZgsmAuthCommands.getInstance()
	context.subscriptions.push(zgsmAuthCommands)

	zgsmAuthCommands.registerCommands(context)

	provider.setZgsmAuthCommands(zgsmAuthCommands)

	/**
	 * 插件启动时检查登录状态
	 */
	try {
		const isLoggedIn = await zgsmAuthService.checkLoginStatusOnStartup()

		if (isLoggedIn) {
			provider.log("插件启动时检测到登录状态：有效")
			zgsmAuthService.getTokens().then(async (tokens) => {
				if (!tokens) {
					return
				}
				writeAccessToken(tokens.access_token).then(async () => {
					await zgsmCodebaseIndexManager.initialize()
					zgsmCodebaseIndexManager.syncToken()
					workspaceEventMonitor.initialize()
				})
				zgsmAuthService.startTokenRefresh(tokens.refresh_token, getClientId(), tokens.state)
				zgsmAuthService.updateUserInfo(tokens.access_token)
			})
			// 开始token刷新定时器
		} else {
			ZgsmAuthService.openStatusBarLoginTip()
			provider.log("插件启动时检测到登录状态：无效")
		}
	} catch (error) {
		provider.log("启动时检查登录状态失败: " + error.message)
	}
	initCodeReview(context, provider, outputChannel)
	CompletionStatusBar.create(context)
	initTelemetry(provider)

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
		// Register function header menu
		vscode.languages.registerCodeLensProvider("*", new MyCodeLensProvider()),
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
		CompletionStatusBar.initByConfig()
	})
	context.subscriptions.push(configChanged)

	context.subscriptions.push(
		// Code completion service
		vscode.languages.registerInlineCompletionItemProvider(
			{ pattern: "**" },
			new AICompletionProvider(context, provider),
		),
		// Shortcut command to trigger auto-completion manually
		vscode.commands.registerCommand(shortKeyCut.command, () => {
			shortKeyCut.callback(context)
		}),
	)

	// Get zgsmRefreshToken without webview resolve
	const tokens = await ZgsmAuthStorage.getInstance().getTokens()
	if (tokens?.access_token) {
		CompletionStatusBar.initByConfig()
	} else {
		CompletionStatusBar.fail({
			message: OPENAI_CLIENT_NOT_INITIALIZED,
		})
	}
	provider.getState().then((state) => {
		const size = (state.taskHistory || []).reduce((p, c) => p + Number(c.size), 0)
		if (size > 1000 * 1000 * 1000 * 3) {
			vscode.window.showWarningMessage(`历史任务缓存超3GB，您可以手动清理历史记录来释放磁盘空间`)
		}
	})
}

/**
 * Deactivation function for ZGSM
 */
export async function deactivate() {
	// 停止定时检测
	ZgsmCodebaseIndexManager.getInstance().stopHealthCheck()

	// ZgsmCodebaseIndexManager.getInstance().stopExistingClient()
	// Clean up IPC connections
	disconnectIPC()
	stopIPCServer()
	// 清理工作区事件监控
	await workspaceEventMonitor.handleVSCodeClose()

	// Currently no specific cleanup needed
	loggerDeactivate()
}
