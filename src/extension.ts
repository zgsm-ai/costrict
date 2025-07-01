import * as vscode from "vscode"
import * as dotenvx from "@dotenvx/dotenvx"
import * as path from "path"
import * as zgsm from "../zgsm/src/extension"

// Load environment variables from .env file
try {
	// Specify path to .env file in the project root directory
	const envPath = path.join(__dirname, "..", ".env")
	dotenvx.config({ path: envPath })
} catch (e) {
	// Silently handle environment loading errors
	console.warn("Failed to load environment variables:", e)
}

import "./utils/path" // Necessary to have access to String.prototype.toPosix.

import { Package, ProviderSettings } from "./schemas"
import { ContextProxy } from "./core/config/ContextProxy"
import { ClineProvider } from "./core/webview/ClineProvider"
import { DIFF_VIEW_URI_SCHEME } from "./integrations/editor/DiffViewProvider"
import { TerminalRegistry } from "./integrations/terminal/TerminalRegistry"
import { McpServerManager } from "./services/mcp/McpServerManager"
import { telemetryService } from "./services/telemetry/TelemetryService"
import { CodeReviewService } from "./services/codeReview/codeReviewService"
import { CommentService } from "./integrations/comment"
import { API } from "./exports/api"
import { migrateSettings } from "./utils/migrateSettings"
import { formatLanguage } from "./shared/language"

import {
	handleUri,
	registerCommands,
	registerCodeActions,
	registerTerminalActions,
	CodeActionProvider,
} from "./activate"
import { initializeI18n } from "./i18n"
import { getCommand } from "./utils/commands"
import { defaultLang } from "./utils/language"
import { InstallType, PluginLifecycleManager } from "./core/tools/pluginLifecycleManager"
import { ZgsmLoginManager } from "./zgsmAuth/zgsmLoginManager"
import { createLogger, deactivate as loggerDeactivate } from "./utils/logger"
import { startIPCServer, stopIPCServer } from "./zgsmAuth/ipc/server"
import { connectIPC, disconnectIPC, onTokensUpdate } from "./zgsmAuth/ipc/client"
import { ZgsmCodeBaseSyncService } from "./core/codebase/client"
import { defaultZgsmAuthConfig } from "./zgsmAuth/config"
import { initZgsmCodeBase } from "./core/codebase"
import { parseJwt } from "./utils/jwt"

/**
 * Built using https://github.com/microsoft/vscode-webview-ui-toolkit
 *
 * Inspired by:
 *  - https://github.com/microsoft/vscode-webview-ui-toolkit-samples/tree/main/default/weather-webview
 *  - https://github.com/microsoft/vscode-webview-ui-toolkit-samples/tree/main/frameworks/hello-world-react-cra
 */

let outputChannel: vscode.OutputChannel
let extensionContext: vscode.ExtensionContext

// This method is called when your extension is activated.
// Your extension is activated the very first time the command is executed.
export async function activate(context: vscode.ExtensionContext) {
	const hasReloaded = context.globalState.get<boolean>("hasReloadedOnUpgrade") ?? false
	const allCommands = await vscode.commands.getCommands(true)

	if (!allCommands.includes(getCommand("SidebarProvider.focus"))) {
		await context.globalState.update("hasReloadedOnUpgrade", true)

		!hasReloaded && (await vscode.commands.executeCommand("workbench.action.reloadWindow"))
		return
	}

	await context.globalState.update("hasReloadedOnUpgrade", false)

	extensionContext = context
	outputChannel = vscode.window.createOutputChannel(Package.outputChannel)
	createLogger(Package.outputChannel, { channel: outputChannel })
	context.subscriptions.push(outputChannel)
	outputChannel.appendLine(`${Package.name} extension activated`)

	// Migrate old settings to new
	await migrateSettings(context, outputChannel)

	// // Initialize telemetry service after environment variables are loaded.
	// telemetryService.initialize()

	// Initialize i18n for internationalization support
	initializeI18n(context.globalState.get("language") ?? formatLanguage(await defaultLang()))

	// Initialize terminal shell execution handlers.
	TerminalRegistry.initialize()

	// Get default commands from configuration.
	const defaultCommands = vscode.workspace.getConfiguration(Package.name).get<string[]>("allowedCommands") || []

	// Initialize global state if not already set.
	if (!context.globalState.get("allowedCommands")) {
		context.globalState.update("allowedCommands", defaultCommands)
	}

	const contextProxy = await ContextProxy.getInstance(context)
	const provider = new ClineProvider(
		context,
		outputChannel,
		"sidebar",
		contextProxy,
		async (providerSettings: ProviderSettings): Promise<ProviderSettings> => {
			if (typeof providerSettings.zgsmApiKeyUpdatedAt !== "string") {
				providerSettings.zgsmApiKeyUpdatedAt = `${providerSettings.zgsmApiKeyUpdatedAt}`
			}

			if (typeof providerSettings.zgsmApiKeyExpiredAt !== "string") {
				providerSettings.zgsmApiKeyExpiredAt = `${providerSettings.zgsmApiKeyExpiredAt}`
			}

			return providerSettings
		},
	)
	telemetryService.setProvider(provider)
	await zgsm.activate(context, provider)
	ZgsmCodeBaseSyncService.setProvider(provider)
	const zgsmApiKey = provider.getValue("zgsmApiKey")
	const zgsmBaseUrl = provider.getValue("zgsmBaseUrl") || defaultZgsmAuthConfig.baseUrl
	const commentService = CommentService.getInstance()
	const codeReviewService = CodeReviewService.getInstance()
	codeReviewService.setProvider(provider)
	codeReviewService.setCommentService(commentService)
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(ClineProvider.sideBarId, provider, {
			webviewOptions: { retainContextWhenHidden: true },
		}),
	)

	registerCommands({ context, outputChannel, provider })

	// Check if this is a new installation or upgrade
	const lifecycle = new PluginLifecycleManager(context)

	const installType = await lifecycle.getInstallType()

	// If this is a new installation, reinstall or upgrade, automatically open the sidebar
	switch (installType) {
		case InstallType.First:
		case InstallType.Upgrade:
		case InstallType.Reinstall:
			// open the sidebar
			await vscode.commands.executeCommand(getCommand("SidebarProvider.focus"))
			break
		case InstallType.Unchanged:
			break
	}

	/**
	 * We use the text document content provider API to show the left side for diff
	 * view by creating a virtual document for the original content. This makes it
	 * readonly so users know to edit the right side if they want to keep their changes.
	 *
	 * This API allows you to create readonly documents in VSCode from arbitrary
	 * sources, and works by claiming an uri-scheme for which your provider then
	 * returns text contents. The scheme must be provided when registering a
	 * provider and cannot change afterwards.
	 *
	 * Note how the provider doesn't create uris for virtual documents - its role
	 * is to provide contents given such an uri. In return, content providers are
	 * wired into the open document logic so that providers are always considered.
	 *
	 * https://code.visualstudio.com/api/extension-guides/virtual-documents
	 */
	const diffContentProvider = new (class implements vscode.TextDocumentContentProvider {
		provideTextDocumentContent(uri: vscode.Uri): string {
			return Buffer.from(uri.query, "base64").toString("utf-8")
		}
	})()

	context.subscriptions.push(
		vscode.workspace.registerTextDocumentContentProvider(DIFF_VIEW_URI_SCHEME, diffContentProvider),
	)

	context.subscriptions.push(vscode.window.registerUriHandler({ handleUri }))

	// Register code actions provider.
	context.subscriptions.push(
		vscode.languages.registerCodeActionsProvider({ pattern: "**/*" }, new CodeActionProvider(), {
			providedCodeActionKinds: CodeActionProvider.providedCodeActionKinds,
		}),
	)

	registerCodeActions(context)
	registerTerminalActions(context)

	// Allows other extensions to activate once Roo is ready.
	vscode.commands.executeCommand(getCommand("activationCompleted"))
	// vscode.commands.executeCommand(`${Package.name}.activationCompleted`)

	// Implements the `RooCodeAPI` interface.
	const socketPath = process.env.ROO_CODE_IPC_SOCKET_PATH
	const enableLogging = typeof socketPath === "string"

	// Watch the core files and automatically reload the extension host
	const enableCoreAutoReload = process.env?.NODE_ENV === "development"
	if (enableCoreAutoReload) {
		console.log(`♻️♻️♻️ Core auto-reloading is ENABLED!`)
		const watcher = vscode.workspace.createFileSystemWatcher(
			new vscode.RelativePattern(context.extensionPath, "src/**/*.ts"),
		)
		watcher.onDidChange((uri) => {
			console.log(`♻️ File changed: ${uri.fsPath}. Reloading host…`)
			vscode.commands.executeCommand("workbench.action.reloadWindow")
		})
		context.subscriptions.push(watcher)
	}

	startIPCServer()
	connectIPC()

	ZgsmLoginManager.setProvider(provider)
	context.subscriptions.push(ZgsmLoginManager.getInstance())

	context.subscriptions.push(
		onTokensUpdate((tokens: { state: string; access_token: string; refresh_token: string }) => {
			ZgsmLoginManager.getInstance().saveTokens(tokens.state, tokens.access_token, tokens.refresh_token)
			provider.log(`new token from other window: ${tokens.access_token}`)
		}),
	)

	if (zgsmApiKey) {
		try {
			const { exp } = parseJwt(zgsmApiKey)
			const needlogin = exp * 1000 <= Date.now()

			if (needlogin) {
				ZgsmLoginManager.getInstance().openStatusBarloginDialog()
			} else {
				ZgsmLoginManager.getInstance().startRefreshToken(zgsmApiKey)
			}
		} catch (error) {
			provider.log(`Failed to parse zgsmRefreshToken: ${error.message}`)
		}
		initZgsmCodeBase(zgsmBaseUrl, zgsmApiKey)
	}

	return new API(outputChannel, provider, socketPath, enableLogging)
}

// This method is called when your extension is deactivated.
export async function deactivate() {
	await ZgsmCodeBaseSyncService.stopSync()
	await zgsm.deactivate()

	// Clean up IPC connections
	disconnectIPC()
	stopIPCServer()

	// Clean up MCP server manager
	outputChannel.appendLine(`${Package.name} extension deactivated`)
	await McpServerManager.cleanup(extensionContext)
	telemetryService.shutdown()
	TerminalRegistry.cleanup()
	loggerDeactivate()
}
