import * as vscode from "vscode"
import * as fs from "fs"
import * as path from "path"
import * as ZgsmCore from "./core/costrict"

// import type { CloudUserInfo, AuthState } from "@roo-code/types"
// import { CloudService, BridgeOrchestrator } from "@roo-code/cloud"
// import type { CloudUserInfo, AuthState } from "@roo-code/types"
// import { CloudService } from "@roo-code/cloud"
import { TelemetryService /* PostHogTelemetryClient */ } from "@roo-code/telemetry"
import { customToolRegistry } from "@roo-code/core"

import "./utils/path" // Necessary to have access to String.prototype.toPosix.
import { createOutputChannelLogger, createDualLogger } from "./utils/outputChannelLogger"
import { initializeNetworkProxy } from "./utils/networkProxy"

import { Package } from "./shared/package"
import { formatLanguage } from "./shared/language"
import { ContextProxy } from "./core/config/ContextProxy"
import { ClineProvider } from "./core/webview/ClineProvider"
import { DIFF_VIEW_URI_SCHEME } from "./integrations/editor/DiffViewProvider"
import { TerminalRegistry } from "./integrations/terminal/TerminalRegistry"
import { claudeCodeOAuthManager } from "./integrations/claude-code/oauth"
import { openAiCodexOAuthManager } from "./integrations/openai-codex/oauth"
import { McpServerManager } from "./services/mcp/McpServerManager"
// import { CodeIndexManager } from "./services/code-index/manager"
import { MdmService } from "./services/mdm/MdmService"
import { migrateSettings } from "./utils/migrateSettings"
import { autoImportSettings } from "./utils/autoImportSettings"
import { API } from "./extension/api"
import { ZgsmAuthConfig } from "./core/costrict/auth/index"

import {
	handleUri,
	registerCommands,
	registerCodeActions,
	registerTerminalActions,
	CodeActionProvider,
} from "./activate"
import { initializeI18n } from "./i18n"
import { getCommand } from "./utils/commands"
import { activateCoworkflowIntegration, deactivateCoworkflowIntegration } from "./core/costrict/workflow"
import { defaultLang } from "./utils/language"
import { createLogger } from "./utils/logger"
import { loadIdeaShellEnvOnce } from "./utils/ideaShellEnvLoader"
import { isJetbrainsPlatform } from "./utils/platform"
import { installGitHubSkills } from "./services/skills/github-skills-installer"
import { getTerminalManager } from "./core/cli-wrap"
// import { flushModels, getModels, initializeModelCacheRefresh } from "./api/providers/fetchers/modelCache"

/**
 * Built using https://github.com/microsoft/vscode-webview-ui-toolkit
 *
 * Inspired by:
 *  - https://github.com/microsoft/vscode-webview-ui-toolkit-samples/tree/main/default/weather-webview
 *  - https://github.com/microsoft/vscode-webview-ui-toolkit-samples/tree/main/frameworks/hello-world-react-cra
 */

let outputChannel: vscode.OutputChannel
let extensionContext: vscode.ExtensionContext
// let cloudService: CloudService | undefined

// let authStateChangedHandler: ((data: { state: AuthState; previousState: AuthState }) => Promise<void>) | undefined
// let settingsUpdatedHandler: (() => void) | undefined
// let userInfoHandler: ((data: { userInfo: CloudUserInfo }) => Promise<void>) | undefined

function logPerf(label: string, start: number) {
	outputChannel.appendLine(`[Perf] ${label}: ${(performance.now() - start).toFixed(1)}ms`)
}

async function loadOptionalEnvFile(context: vscode.ExtensionContext): Promise<void> {
	const isDebugMode = context.extensionMode === vscode.ExtensionMode.Development
	if (!isDebugMode) {
		return
	}

	const envPath = path.join(__dirname, "..", ".env")
	if (!fs.existsSync(envPath)) {
		return
	}

	const start = performance.now()
	try {
		const dotenvx = await import("@dotenvx/dotenvx")
		dotenvx.config({ path: envPath })
		logPerf("loadOptionalEnvFile", start)
	} catch (e) {
		outputChannel.appendLine(`[Env] Failed to load environment variables: ${e}`)
	}
}

/**
 * Check if we should auto-open the CoStrict sidebar after switching to a worktree.
 * This is called during extension activation to handle the worktree auto-open flow.
 */
async function checkWorktreeAutoOpen(
	context: vscode.ExtensionContext,
	outputChannel: vscode.OutputChannel,
): Promise<void> {
	try {
		const worktreeAutoOpenPath = context.globalState.get<string>("worktreeAutoOpenPath")
		if (!worktreeAutoOpenPath) {
			return
		}

		const workspaceFolders = vscode.workspace.workspaceFolders
		if (!workspaceFolders || workspaceFolders.length === 0) {
			return
		}

		const currentPath = workspaceFolders[0].uri.fsPath

		// Normalize paths for comparison
		const normalizePath = (p: string) => p.replace(/\/+$/, "").replace(/\\+/g, "/").toLowerCase()

		// Check if current workspace matches the worktree path
		if (normalizePath(currentPath) === normalizePath(worktreeAutoOpenPath)) {
			// Clear the state first to prevent re-triggering
			await context.globalState.update("worktreeAutoOpenPath", undefined)

			outputChannel.appendLine(`[Worktree] Auto-opening CoStrict sidebar for worktree: ${worktreeAutoOpenPath}`)

			// Open the CoStrict sidebar with a slight delay to ensure UI is ready
			setTimeout(async () => {
				try {
					await vscode.commands.executeCommand(getCommand("plusButtonClicked"))
				} catch (error) {
					outputChannel.appendLine(
						`[Worktree] Error auto-opening sidebar: ${error instanceof Error ? error.message : String(error)}`,
					)
				}
			}, 500)
		}
	} catch (error) {
		outputChannel.appendLine(
			`[Worktree] Error checking worktree auto-open: ${error instanceof Error ? error.message : String(error)}`,
		)
	}
}

// This method is called when your extension is activated.
// Your extension is activated the very first time the command is executed.
export async function activate(context: vscode.ExtensionContext) {
	const activateStart = performance.now()
	extensionContext = context
	outputChannel = createLogger(Package.outputChannel).channel
	context.subscriptions.push(outputChannel)
	outputChannel.appendLine(`${Package.name} extension activated - ${JSON.stringify(Package)}`)
	outputChannel.appendLine("[Perf] activate:start")

	let stepStart = performance.now()
	await loadOptionalEnvFile(context)
	logPerf("activate.loadOptionalEnvFile.total", stepStart)

	// Initialize network proxy configuration early, before any network requests.
	// When proxyUrl is configured, all HTTP/HTTPS traffic will be routed through it.
	// Only applied in debug mode (F5).
	stepStart = performance.now()
	await initializeNetworkProxy(context, outputChannel)
	logPerf("activate.initializeNetworkProxy", stepStart)

	// Set extension path for custom tool registry to find bundled esbuild
	stepStart = performance.now()
	customToolRegistry.setExtensionPath(context.extensionPath)
	logPerf("activate.setExtensionPath", stepStart)

	// Migrate old settings to new
	stepStart = performance.now()
	await migrateSettings(context, outputChannel)
	logPerf("activate.migrateSettings", stepStart)
	if (isJetbrainsPlatform()) {
		setTimeout(() => {
			loadIdeaShellEnvOnce(context)
		}, 1000)
	}
	// Initialize telemetry service.
	stepStart = performance.now()
	TelemetryService.createInstance()
	logPerf("activate.TelemetryService.createInstance", stepStart)

	// try {
	// 	telemetryService.register(new PostHogTelemetryClient())
	// } catch (error) {
	// 	console.warn("Failed to register PostHogTelemetryClient:", error)
	// }

	// // Create logger for cloud services.
	// const cloudLogger = createDualLogger(createOutputChannelLogger(outputChannel))

	// // Initialize MDM service
	// stepStart = performance.now()
	// const mdmService = await MdmService.createInstance(cloudLogger)
	// logPerf("activate.MdmService.createInstance", stepStart)

	// Initialize i18n for internationalization support.
	stepStart = performance.now()
	await initializeI18n(context.globalState.get("language") ?? formatLanguage(await defaultLang()))
	logPerf("activate.initializeI18n", stepStart)

	// Initialize terminal shell execution handlers.
	stepStart = performance.now()
	TerminalRegistry.initialize()
	logPerf("activate.TerminalRegistry.initialize", stepStart)

	// Initialize Claude Code OAuth manager for direct API access.
	stepStart = performance.now()
	claudeCodeOAuthManager.initialize(context, (message) => outputChannel.appendLine(message))
	logPerf("activate.claudeCodeOAuthManager.initialize", stepStart)

	// Initialize OpenAI Codex OAuth manager for ChatGPT subscription-based access.
	stepStart = performance.now()
	openAiCodexOAuthManager.initialize(context, (message) => outputChannel.appendLine(message))
	logPerf("activate.openAiCodexOAuthManager.initialize", stepStart)

	// Get default commands from configuration.
	stepStart = performance.now()
	const defaultCommands = vscode.workspace.getConfiguration(Package.name).get<string[]>("allowedCommands") || []
	logPerf("activate.getDefaultCommands", stepStart)

	// Initialize global state if not already set.
	if (!context.globalState.get("allowedCommands")) {
		void context.globalState.update("allowedCommands", defaultCommands)
	}

	stepStart = performance.now()
	const contextProxy = await ContextProxy.getInstance(context)
	logPerf("activate.ContextProxy.getInstance", stepStart)

	// // Initialize code index managers for all workspace folders.
	// const codeIndexManagers: CodeIndexManager[] = []

	// if (vscode.workspace.workspaceFolders) {
	// 	for (const folder of vscode.workspace.workspaceFolders) {
	// 		const manager = CodeIndexManager.getInstance(context, folder.uri.fsPath)

	// 		if (manager) {
	// 			codeIndexManagers.push(manager)

	// // Initialize in background; do not block extension activation
	// void manager.initialize(contextProxy).catch((error) => {
	// 	const message = error instanceof Error ? error.message : String(error)
	// 	outputChannel.appendLine(
	// 		`[CodeIndexManager] Error during background CodeIndexManager configuration/indexing for ${folder.uri.fsPath}: ${message}`,
	// 	)
	// })

	// 			context.subscriptions.push(manager)
	// 		}
	// 	}
	// }

	// Install built-in skills asynchronously in background
	// This does not block extension activation
	outputChannel.appendLine("[BuiltinSkills] Installing bundled skills in background...")
	void installGitHubSkills(context)
		.then(() => {
			outputChannel.appendLine("[BuiltinSkills] Bundled skills installed")
		})
		.catch((error) => {
			outputChannel.appendLine(
				`[BuiltinSkills] Failed to install: ${error instanceof Error ? error.message : String(error)}`,
			)
		})

	// Initialize the provider *before* the CoStrict Cloud service.
	stepStart = performance.now()
	// const provider = new ClineProvider(context, outputChannel, "sidebar", contextProxy, mdmService)
	const provider = new ClineProvider(context, outputChannel, "sidebar", contextProxy)
	logPerf("activate.new ClineProvider", stepStart)
	logPerf("activate.total", activateStart)

	// // Initialize Roo Code Cloud service.
	// const postStateListener = () => ClineProvider.getVisibleInstance()?.postStateToWebviewWithoutClineMessages()

	// authStateChangedHandler = async (data: { state: AuthState; previousState: AuthState }) => {
	// 	postStateListener()

	// 	if (data.state === "logged-out") {
	// 		try {
	// 			await provider.remoteControlEnabled(false)
	// 		} catch (error) {
	// 			cloudLogger(
	// 				`[authStateChangedHandler] remoteControlEnabled(false) failed: ${error instanceof Error ? error.message : String(error)}`,
	// 			)
	// 		}
	// 	}
	// // Handle Roo models cache based on auth state
	// 	const handleRooModelsCache = async () => {
	// 		try {
	// 			await flushModels("roo")

	// 			if (data.state === "active-session") {
	// 				// Reload models with the new auth token
	// 				const sessionToken = cloudService?.authService?.getSessionToken()
	// 				await getModels({
	// 					provider: "roo",
	// 					baseUrl: process.env.ROO_CODE_PROVIDER_URL ?? "https://api.roocode.com/proxy",
	// 					apiKey: sessionToken,
	// 				})
	// 				cloudLogger(`[authStateChangedHandler] Reloaded Roo models cache for active session`)
	// 			} else {
	// 				cloudLogger(`[authStateChangedHandler] Flushed Roo models cache on logout`)
	// 			}
	// 		} catch (error) {
	// 			cloudLogger(
	// 				`[authStateChangedHandler] Failed to handle Roo models cache: ${error instanceof Error ? error.message : String(error)}`,
	// 			)
	// 		}
	// 	}

	// 	if (data.state === "active-session" || data.state === "logged-out") {
	// 		await handleRooModelsCache()
	// 	}
	// }

	// settingsUpdatedHandler = async () => {
	// 	const userInfo = CloudService.instance.getUserInfo()

	// if (userInfo && CloudService.instance.cloudAPI) {
	// 	try {
	// 		provider.remoteControlEnabled(CloudService.instance.isTaskSyncEnabled())
	// 	} catch (error) {
	// 		cloudLogger(
	// 			`[settingsUpdatedHandler] remoteControlEnabled failed: ${error instanceof Error ? error.message : String(error)}`,
	// 		)
	// 	}
	// }

	// 	postStateListener()
	// }

	// userInfoHandler = async ({ userInfo }: { userInfo: CloudUserInfo }) => {
	// 	postStateListener()

	// 	if (!CloudService.instance.cloudAPI) {
	// 		cloudLogger("[userInfoHandler] CloudAPI is not initialized")
	// 		return
	// 	}

	// 	try {
	// 		provider.remoteControlEnabled(CloudService.instance.isTaskSyncEnabled())
	// 	} catch (error) {
	// 		cloudLogger(
	// 			`[userInfoHandler] remoteControlEnabled failed: ${error instanceof Error ? error.message : String(error)}`,
	// 		)
	// 	}
	// }

	// cloudService = await CloudService.createInstance(context, cloudLogger, {
	// 	"auth-state-changed": authStateChangedHandler,
	// 	"settings-updated": settingsUpdatedHandler,
	// 	"user-info": userInfoHandler,
	// })

	// try {
	// 	if (cloudService.telemetryClient) {
	// 		TelemetryService.instance.register(cloudService.telemetryClient)
	// 	}
	// } catch (error) {
	// 	outputChannel.appendLine(
	// 		`[CloudService] Failed to register TelemetryClient: ${error instanceof Error ? error.message : String(error)}`,
	// 	)
	// }

	// // Add to subscriptions for proper cleanup on deactivate.
	// context.subscriptions.push(cloudService)

	// // Trigger initial cloud profile sync now that CloudService is ready
	// try {
	// 	await provider.initializeCloudProfileSyncWhenReady()
	// } catch (error) {
	// 	outputChannel.appendLine(
	// 		`[CloudService] Failed to initialize cloud profile sync: ${error instanceof Error ? error.message : String(error)}`,
	// 	)
	// }
	// Trigger initial cloud profile sync now that CloudService is ready.
	// try {
	// 	await provider.initializeCloudProfileSyncWhenReady()
	// } catch (error) {
	// 	outputChannel.appendLine(
	// 		`[CloudService] Failed to initialize cloud profile sync: ${error instanceof Error ? error.message : String(error)}`,
	// 	)
	// }

	// // Finish initializing the provider.
	// TelemetryService.instance.setProvider(provider)

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(ClineProvider.sideBarId, provider, {
			webviewOptions: { retainContextWhenHidden: true },
		}),
	)

	// Check for worktree auto-open path (set when switching to a worktree)
	await checkWorktreeAutoOpen(context, outputChannel)

	// Auto-import configuration if specified in settings.
	try {
		await autoImportSettings(outputChannel, {
			providerSettingsManager: provider.providerSettingsManager,
			contextProxy: provider.contextProxy,
			customModesManager: provider.customModesManager,
		})
	} catch (error) {
		outputChannel.appendLine(
			`[AutoImport] Error during auto-import: ${error instanceof Error ? error.message : String(error)}`,
		)
	}

	registerCommands({ context, outputChannel, provider })

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

	// Register the 'User Manual' command
	context.subscriptions.push(
		vscode.commands.registerCommand(getCommand("view.userHelperDoc"), () => {
			vscode.env.openExternal(vscode.Uri.parse(`${ZgsmAuthConfig.getInstance().getDefaultSite()}`))
		}),
	)

	// Register the 'Report Issue' command
	context.subscriptions.push(
		vscode.commands.registerCommand(getCommand("view.issue"), () => {
			vscode.env.openExternal(vscode.Uri.parse(`${ZgsmAuthConfig.getInstance().getDefaultApiBaseUrl()}/issue/`))
		}),
	)

	registerCodeActions(context)
	registerTerminalActions(context)

	// Activate coworkflow integration
	activateCoworkflowIntegration(context)

	// Allows other extensions to activate once CoStrict is ready.
	vscode.commands.executeCommand(`${Package.name}.activationCompleted`)

	// Implements the `RooCodeAPI` interface.
	const socketPath = process.env.ROO_CODE_IPC_SOCKET_PATH
	const enableLogging = typeof socketPath === "string"

	// Watch the core files and automatically reload the extension host.
	if (process.env.NODE_ENV === "development") {
		const watchPaths = [
			{ path: context.extensionPath, pattern: "**/*.ts" },
			{ path: path.join(context.extensionPath, "../packages/types"), pattern: "**/*.ts" },
			{ path: path.join(context.extensionPath, "../packages/telemetry"), pattern: "**/*.ts" },
			{ path: path.join(context.extensionPath, "node_modules/@roo-code/cloud"), pattern: "**/*" },
		]

		console.log(
			`♻️♻️♻️ Core auto-reloading: Watching for changes in ${watchPaths.map(({ path }) => path).join(", ")}`,
		)

		// Create a debounced reload function to prevent excessive reloads
		let reloadTimeout: NodeJS.Timeout | undefined
		const DEBOUNCE_DELAY = 1_000

		const debouncedReload = (uri: vscode.Uri) => {
			if (reloadTimeout) {
				clearTimeout(reloadTimeout)
			}

			console.log(`♻️ ${uri.fsPath} changed; scheduling reload...`)

			reloadTimeout = setTimeout(() => {
				console.log(`♻️ Reloading host after debounce delay...`)
				vscode.commands.executeCommand("workbench.action.reloadWindow")
			}, DEBOUNCE_DELAY)
		}

		watchPaths.forEach(({ path: watchPath, pattern }) => {
			const relPattern = new vscode.RelativePattern(vscode.Uri.file(watchPath), pattern)
			const watcher = vscode.workspace.createFileSystemWatcher(relPattern, false, false, false)

			// Listen to all change types to ensure symlinked file updates trigger reloads.
			watcher.onDidChange(debouncedReload)
			watcher.onDidCreate(debouncedReload)
			watcher.onDidDelete(debouncedReload)

			context.subscriptions.push(watcher)
		})

		// Clean up the timeout on deactivation
		context.subscriptions.push({
			dispose: () => {
				if (reloadTimeout) {
					clearTimeout(reloadTimeout)
				}
			},
		})
	}

	ZgsmCore.activate(context, provider, outputChannel)
	// // Initialize background model cache refresh
	// initializeModelCacheRefresh()

	return new API(outputChannel, provider, socketPath, enableLogging)
}

// This method is called when your extension is deactivated.
export async function deactivate() {
	await ZgsmCore.deactivate()
	outputChannel.appendLine(`${Package.name} extension deactivated`)

	// if (cloudService && CloudService.hasInstance()) {
	// 	try {
	// 		if (authStateChangedHandler) {
	// 			CloudService.instance.off("auth-state-changed", authStateChangedHandler)
	// 		}

	// 		if (settingsUpdatedHandler) {
	// 			CloudService.instance.off("settings-updated", settingsUpdatedHandler)
	// 		}

	// 		if (userInfoHandler) {
	// 			CloudService.instance.off("user-info", userInfoHandler as any)
	// 		}

	// 		outputChannel.appendLine("CloudService event handlers cleaned up")
	// 	} catch (error) {
	// 		outputChannel.appendLine(
	// 			`Failed to clean up CloudService event handlers: ${error instanceof Error ? error.message : String(error)}`,
	// 		)
	// 	}
	// }
	deactivateCoworkflowIntegration()

	await McpServerManager.cleanup(extensionContext)
	TelemetryService.instance.shutdown()
	TerminalRegistry.cleanup()

	// Dispose CLI terminal manager to kill any running PTY process
	getTerminalManager().dispose()
}
