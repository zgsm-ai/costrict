import * as vscode from "vscode"
import * as path from "path"
import { execFile } from "child_process"
import { promisify } from "util"
import { CsCloudService } from "./csCloudService"
import { openDiffView } from "./diffView"
import { getAssistantUIConfig, type AssistantUIConfig } from "./config"
import {
	getAssistantUIStaticHtml,
	getAssistantUIIframeHtml,
	getAssistantUILoadingHtml,
	getCrashedHtml,
	escapeHtml,
} from "./html"
import { CostrictAuthService } from "../../costrict/auth"
import { CostrictAuthConfig } from "../../costrict/auth/authConfig"
import type { AssistantUIContextMessage } from "./types"
import { setActiveCloudProvider, onCloudUiReady, setCloudUnavailable } from "./contextBridge"
import { Package } from "../../../shared/package"
import { readCostrictAccessToken } from "../../costrict/runtime-config"
import { t } from "../../../i18n"

export function getAssistantUIWorkspaceDirectory() {
	return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
}

const execFileAsync = promisify(execFile)

async function getGitBranches(cwd: string): Promise<{ branches: string[]; current: string }> {
	let branches: string[] = []
	let current = ""

	try {
		const branchResult = await execFileAsync("git", ["branch", "--format=%(refname:short)"], { cwd })
		branches = branchResult.stdout
			.trim()
			.split("\n")
			.map((b) => b.trim())
			.filter(Boolean)
	} catch {
		// git branch failed — likely not a git repo
	}

	try {
		const currentResult = await execFileAsync("git", ["branch", "--show-current"], { cwd })
		current = currentResult.stdout.trim()
	} catch {
		// git branch --show-current failed — HEAD may not exist
	}

	return { branches, current }
}
async function gitCheckout(cwd: string, branch: string): Promise<{ success: boolean; message: string }> {
	try {
		await execFileAsync("git", ["checkout", branch], { cwd })
		return { success: true, message: t("common:csCloud.git.checkoutSuccess", { branch }) }
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		return { success: false, message: t("common:csCloud.git.checkoutFailed", { message }) }
	}
}

export function shouldUseAssistantUIIframe(context: vscode.ExtensionContext, config: AssistantUIConfig) {
	return context.extensionMode === vscode.ExtensionMode.Development || config.webviewMode === "iframe"
}

export class AssistantUISidebarProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = `${Package.commandIDPrefix}.AssistantUISidebarProvider`

	private view?: vscode.WebviewView
	private readonly csCloudService: CsCloudService
	private disposables: vscode.Disposable[] = []

	/** Cached HTML for fast restore after sidebar move. */
	private cachedHtml: string | undefined
	private readonly proxyFetchControllers = new Map<string, AbortController>()

	constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly outputChannel: vscode.OutputChannel,
		csCloudService: CsCloudService,
	) {
		this.csCloudService = csCloudService
	}

	/** Post message to Cloud UI webview. */
	public postContextMessage(message: AssistantUIContextMessage): Thenable<boolean> | undefined {
		return this.view?.webview.postMessage(message)
	}

	public async reloadAssistantUI() {
		if (!this.view) {
			return false
		}
		this.cachedHtml = undefined
		await this.loadContent(this.view)
		return true
	}

	async resolveWebviewView(webviewView: vscode.WebviewView) {
		this.view = webviewView

		// Register as active cloud provider
		const cloudGen = setActiveCloudProvider(this)

		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this.context.extensionUri],
		}

		// Handle dispose (before any early return)
		webviewView.onDidDispose(
			() => {
				this.view = undefined
				setActiveCloudProvider(undefined)
				this.dispose()
			},
			null,
			this.disposables,
		)

		// Register event listeners before branching
		const crashedHandler = ({ reason }: { reason: string }) => {
			if (this.view) {
				this.view.webview.html = getCrashedHtml(reason)
			}
		}
		this.csCloudService.on("crashed", crashedHandler)

		// Remove listener on dispose
		webviewView.onDidDispose(
			() => {
				this.csCloudService.off("crashed", crashedHandler)
			},
			null,
			this.disposables,
		)

		// Handle VS Code theme changes
		vscode.window.onDidChangeActiveColorTheme(
			(e) => {
				const theme = e.kind === 1 || e.kind === 4 ? "light" : "dark"
				webviewView.webview.postMessage({ type: "theme", theme })
			},
			null,
			this.disposables,
		)

		// Handle visibility changes
		webviewView.onDidChangeVisibility(
			() => {
				if (webviewView.visible) {
					// Optional: refresh cs-cloud health or re-fetch state
				}
			},
			null,
			this.disposables,
		)

		// Handle messages from webview (e.g. openExternal from iframe)
		webviewView.webview.onDidReceiveMessage(
			async (message: {
				type: string
				url?: string
				path?: string
				patch?: string
				baseUrl?: string
				token?: string
				command?: string
				requestId?: string
				input?: string
				init?: {
					method?: string
					headers?: Record<string, string>
					body?: string
				}
			}) => {
				if (message.type === "ASSISTANT_UI_READY") {
					onCloudUiReady(cloudGen)
					return
				}
				if (message.type === "openExternal" && message.url) {
					vscode.env.openExternal(vscode.Uri.parse(message.url))
				}
				if (message.type === "openFile" && message.path) {
					const workspaceDir = getAssistantUIWorkspaceDirectory()
					const filePath = path.isAbsolute(message.path)
						? message.path
						: path.join(workspaceDir || "", message.path)
					const uri = vscode.Uri.file(filePath)
					vscode.commands.executeCommand("vscode.open", uri)
				}
				if (message.type === "openDiff" && message.path && message.patch) {
					void openDiffView(message.path, message.patch)
				}
				if (message.type === "executeCommand" && message.command) {
					vscode.commands.executeCommand(message.command)
				}
				if (message.type === "reloadAssistantUI") {
					// Clear cache on manual reload
					this.cachedHtml = undefined
					await this.loadContent(webviewView)
				}
				if (message.type === "reconnectCsCloud") {
					if (this.csCloudService.startupFailureIsUninstallCsc) {
						return
					}
					try {
						await this.csCloudService.reconnect()
						this.cachedHtml = undefined
						await this.loadContent(this.view!)
					} catch (err) {
						const reason = err instanceof Error ? err.message : String(err)
						this.outputChannel.appendLine(`[AssistantUI] Reconnect cs-cloud failed: ${reason}`)
						this.view?.webview.postMessage({
							type: "reconnectFailed",
							reason,
						})
					}
				}
				if (message.type === "restartCsCloudServer") {
					if (this.csCloudService.startupFailureIsUninstallCsc) {
						return
					}
					try {
						await this.csCloudService.restartServer()
						this.cachedHtml = undefined
						await this.loadContent(this.view!)
					} catch (err) {
						const reason = err instanceof Error ? err.message : String(err)
						this.outputChannel.appendLine(`[AssistantUI] Restart cs-cloud server failed: ${reason}`)
						this.view?.webview.postMessage({
							type: "restartCsCloudServerFailed",
							reason,
						})
					}
				}
				if (message.type === "switchToClassicUiMode") {
					try {
						await vscode.workspace
							.getConfiguration("costrict")
							.update("uiMode", "classic", vscode.ConfigurationTarget.Global)
						await vscode.commands.executeCommand("setContext", "costrict.uiMode", "classic")
						void vscode.commands.executeCommand("workbench.action.reloadWindow")
					} catch (err) {
						const reason = err instanceof Error ? err.message : String(err)
						this.outputChannel.appendLine(`[AssistantUI] Switch to classic mode failed: ${reason}`)
					}
				}
				if (message.type === "proxyFetchAbort" && message.requestId) {
					this.proxyFetchControllers.get(message.requestId)?.abort()
					this.proxyFetchControllers.delete(message.requestId)
					return
				}
				if (message.type === "proxyFetch" && message.requestId && message.input) {
					const abortController = new AbortController()
					this.proxyFetchControllers.set(message.requestId, abortController)
					try {
						const response = await fetch(message.input, {
							method: message.init?.method,
							headers: message.init?.headers,
							body: message.init?.body,
							signal: abortController.signal,
						})
						const headers: Record<string, string> = {}
						response.headers.forEach((value, key) => {
							headers[key] = value
						})
						await webviewView.webview.postMessage({
							type: "proxyFetchResponse",
							requestId: message.requestId,
							ok: response.ok,
							status: response.status,
							statusText: response.statusText,
							headers,
						})

						if (!response.body) {
							await webviewView.webview.postMessage({
								type: "proxyFetchDone",
								requestId: message.requestId,
							})
							return
						}

						const reader = response.body.getReader()
						const decoder = new TextDecoder()
						try {
							while (true) {
								const { done, value } = await reader.read()
								if (done) break
								const chunk = decoder.decode(value, { stream: true })
								if (chunk) {
									await webviewView.webview.postMessage({
										type: "proxyFetchChunk",
										requestId: message.requestId,
										chunk,
									})
								}
							}
							const tail = decoder.decode()
							if (tail) {
								await webviewView.webview.postMessage({
									type: "proxyFetchChunk",
									requestId: message.requestId,
									chunk: tail,
								})
							}
						} finally {
							reader.releaseLock()
						}
						await webviewView.webview.postMessage({ type: "proxyFetchDone", requestId: message.requestId })
					} catch (err) {
						if (!abortController.signal.aborted) {
							const reason = err instanceof Error ? err.message : String(err)
							await webviewView.webview.postMessage({
								type: "proxyFetchError",
								requestId: message.requestId,
								status: 599,
								statusText: reason,
								error: reason,
							})
						}
					} finally {
						this.proxyFetchControllers.delete(message.requestId)
					}
					return
				}
				if (message.type === "fetchQuota" && message.baseUrl && message.token) {
					try {
						const response = await fetch(`${message.baseUrl}/quota-manager/api/v1/quota`, {
							headers: {
								Authorization: `Bearer ${message.token}`,
								"Content-Type": "application/json",
							},
						})
						if (response.ok) {
							const json = await response.json()
							webviewView.webview.postMessage({ type: "quotaResult", data: json?.data ?? null })
						} else {
							webviewView.webview.postMessage({ type: "quotaResult", data: null })
						}
					} catch (err) {
						console.error("[sidebarProvider] quota fetch failed", err)
						webviewView.webview.postMessage({ type: "quotaResult", data: null })
					}
				}
				if (message.type === "requestGitBranches") {
					const cwd = (message as { directory?: string }).directory || getAssistantUIWorkspaceDirectory()
					if (!cwd) {
						webviewView.webview.postMessage({ type: "GIT_BRANCHES", branches: [], current: "" })
						return
					}
					const result = await getGitBranches(cwd)
					webviewView.webview.postMessage({
						type: "GIT_BRANCHES",
						branches: result.branches,
						current: result.current,
					})
				}
				if (message.type === "switchGitBranch") {
					const msg = message as { branch?: string; directory?: string }
					if (!msg.branch) return
					const cwd = msg.directory || getAssistantUIWorkspaceDirectory()
					if (!cwd) return
					await gitCheckout(cwd, msg.branch)
				}
				if (message.type === "requestWorkspaceFolders") {
					const folders = (vscode.workspace.workspaceFolders ?? []).map((f) => ({
						name: f.name,
						path: f.uri.fsPath,
					}))
					webviewView.webview.postMessage({ type: "WORKSPACE_FOLDERS", folders })
				}
				if (message.type === "switchWorkspaceFolder") {
					const msg = message as { path?: string }
					if (!msg.path) return
					webviewView.webview.postMessage({
						type: "assistantUIContext",
						context: { workspaceDirectory: msg.path },
					})
				}
			},
			null,
			this.disposables,
		)

		const config = getAssistantUIConfig()
		if (!config.enabled) {
			setCloudUnavailable("config disabled")
			webviewView.webview.html = this.getDisabledHtml()
			return
		}
		// Reuse cached HTML if available
		if (this.cachedHtml) {
			webviewView.webview.html = this.cachedHtml
			return
		}
		// Render by persisted state
		switch (this.csCloudService.state) {
			case "error":
				webviewView.webview.html = this.getErrorHtml(
					this.csCloudService.startupFailureReason ??
						this.csCloudService.lastCrashReason ??
						t("common:csCloud.error.startupFailed"),
				)
				return
			case "running":
				await this.loadContent(webviewView)
				return
			case "loading":
			case "idle":
				webviewView.webview.html = getAssistantUILoadingHtml(
					this.context,
					t("common:csCloud.loading.startingCloud"),
				)
				await this.loadContent(webviewView)
				return
		}
	}

	private getDisabledHtml(): string {
		return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
	 <meta charset="UTF-8">
	 <meta name="viewport" content="width=device-width, initial-scale=1.0">
	 <style>
	   body { font-family: var(--vscode-font-family); padding: 20px; color: var(--vscode-foreground); }
	 </style>
</head>
<body>
	 <p>${escapeHtml(t("common:csCloud.disabled.message"))}</p>
</body>
</html>`
	}

	private async loadContent(webviewView: vscode.WebviewView) {
		webviewView.webview.html = getAssistantUILoadingHtml(this.context, t("common:csCloud.loading.startingCloud"))

		try {
			const workspaceDirectory = getAssistantUIWorkspaceDirectory()
			const baseUrl = await vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: t("common:csCloud.progress.startingCloud"),
					cancellable: false,
				},
				() => this.csCloudService.ensureStarted(),
			)

			const config = getAssistantUIConfig()
			const useIframe = shouldUseAssistantUIIframe(this.context, config)

			// Static webviews run the bundled UI in VS Code's webview origin. In that
			// mode html.ts proxies cs-cloud fetches through the extension host, so the
			// UI should keep the extension-host-local URL (usually 127.0.0.1). Rewriting
			// it to the code-server/remote host makes the extension host fetch a
			// browser-facing address, which can fail because of firewall/bind/CORS/mixed
			// content. Only iframe mode needs a browser-reachable URL because requests
			// originate inside the iframe page and cannot be intercepted by the outer
			// webview bootstrap.
			let csCloudBaseUrl = baseUrl
			if (useIframe) {
				if (vscode.env.remoteName === "ssh" || vscode.env.remoteName === "ssh-remote") {
					csCloudBaseUrl = (await vscode.env.asExternalUri(vscode.Uri.parse(baseUrl))).toString(true)
					this.outputChannel.appendLine(
						`Detected remote environment (${vscode.env.remoteName}|${vscode.env.appName}), tunneling cs-cloud URL to ${csCloudBaseUrl}`,
					)
				} else if (vscode.env.appName === "code-server" && vscode.env.remoteName) {
					// code-server + iframe: the iframe runs in the browser, so 127.0.0.1
					// would resolve to the client. Use the code-server host as a best-effort
					// browser-facing address for development/iframe mode.
					const remoteHost = vscode.env.remoteName.split(":")[0]
					if (remoteHost) {
						try {
							const baseUrlObj = new URL(baseUrl)
							baseUrlObj.hostname = remoteHost
							csCloudBaseUrl = baseUrlObj.toString()
							this.outputChannel.appendLine(
								`Detected code-server iframe environment, replacing localhost with remote host ${remoteHost}: ${csCloudBaseUrl}`,
							)
						} catch {
							// baseUrl is not a valid URL, keep the original baseUrl
						}
					}
				}
			}
			let accessToken: string | null = null
			try {
				accessToken = await CostrictAuthService.getInstance().getCurrentAccessToken()
			} catch (error) {
				this.outputChannel.appendLine(
					`[AssistantUISidebarProvider] Failed to read access token from auth service: ${error}`,
				)
			}
			// Fallback: if vscode token is cleared, read from ~/.costrict/share/auth.json
			if (!accessToken) {
				try {
					const data = readCostrictAccessToken()
					if (data?.access_token) {
						accessToken = data.access_token
					}
				} catch (error) {
					this.outputChannel.appendLine(
						`[AssistantUISidebarProvider] Failed to read fallback auth file: ${error}`,
					)
				}
			}
			const costrictWebUrl = CostrictAuthConfig.getInstance().getDefaultApiBaseUrl()
			const pluginVersion = Package.version
			const pluginSha = Package.sha
			const pluginBuildTime = Package.buildTime
			if (useIframe) {
				this.outputChannel.appendLine(
					`[AssistantUISidebarProvider] remoteName (${vscode.env.remoteName}|${vscode.env.appName}) baseUrl: ${baseUrl}, csCloudBaseUrl: ${csCloudBaseUrl}`,
				)
				const html = getAssistantUIIframeHtml(
					webviewView.webview,
					this.context,
					csCloudBaseUrl,
					config.webUrl,
					workspaceDirectory,
					accessToken ?? undefined,
					config.debug,
					costrictWebUrl,
					pluginVersion,
					Package.commandIDPrefix,
					pluginSha,
					pluginBuildTime,
				)
				webviewView.webview.html = html
				this.cachedHtml = html
			} else {
				this.outputChannel.appendLine(
					`[getAssistantUIStaticHtml] remoteName (${vscode.env.remoteName}|${vscode.env.appName}) baseUrl: ${baseUrl}, csCloudBaseUrl: ${csCloudBaseUrl}`,
				)
				const html = getAssistantUIStaticHtml(
					webviewView.webview,
					this.context,
					csCloudBaseUrl,
					workspaceDirectory,
					accessToken ?? undefined,
					costrictWebUrl,
					pluginVersion,
					Package.commandIDPrefix,
					pluginSha,
					pluginBuildTime,
				)
				webviewView.webview.html = html
				this.cachedHtml = html
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			this.outputChannel.appendLine(`[AssistantUI] ${message}`)
			webviewView.webview.html = this.getErrorHtml(message)
		}
	}

	private getErrorHtml(message: string): string {
		const canRetry = !this.csCloudService.startupFailureIsUninstallCsc
		const i18n = {
			title: t("common:csCloud.error.title"),
			descRetry: t("common:csCloud.error.descRetry"),
			descNoCsc: t("common:csCloud.error.descNoCsc"),
			restart: t("common:csCloud.error.restart"),
			switchToClassic: t("common:csCloud.error.switchToClassic"),
			autoRetryCountdown: t("common:csCloud.error.autoRetryCountdown", { count: "__COUNT__" }),
			starting: t("common:csCloud.error.starting"),
			switching: t("common:csCloud.error.switching"),
		}
		return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CoStrict Cloud</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
      background: var(--vscode-editor-background);
      color: var(--vscode-foreground);
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 24px;
    }
    .cs-card {
      max-width: 380px;
      width: 100%;
      text-align: center;
      background: var(--vscode-sideBar-background, color-mix(in srgb, var(--vscode-editor-background) 97%, #888));
      border: 1px solid var(--vscode-panel-border, rgba(127,127,127,0.18));
      border-radius: 16px;
      padding: 40px 28px 32px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.08);
      position: relative;
      overflow: hidden;
    }
    .cs-card::before {
      content: "";
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 3px;
      background: linear-gradient(90deg, #094BFF, #0084FF, #00D6DE);
      opacity: 0.6;
    }
    .cs-icon-wrap {
      width: 72px;
      height: 72px;
      margin: 0 auto 20px;
      border-radius: 20px;
      background: linear-gradient(135deg, rgba(9,75,255,0.08), rgba(0,132,255,0.08));
      border: 1px solid rgba(9,75,255,0.12);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .cs-icon-wrap svg {
      width: 32px;
      height: 32px;
      stroke: var(--vscode-textLink-foreground, #388bfd);
    }
    .cs-brand {
      font-size: 13px;
      font-weight: 600;
      letter-spacing: 0.15em;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 12px;
      text-transform: uppercase;
    }
    .cs-title {
      font-size: 15px;
      font-weight: 500;
      margin-bottom: 8px;
      color: var(--vscode-foreground);
      line-height: 1.4;
    }
    .cs-desc {
      font-size: 13px;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 20px;
      line-height: 1.6;
    }
    .cs-detail {
      background: var(--vscode-textCodeBlock-background);
      border-radius: 8px;
      padding: 10px 12px;
      font-size: 11.5px;
      font-family: var(--vscode-editor-font-family, "SF Mono", Monaco, monospace);
      color: var(--vscode-descriptionForeground);
      text-align: left;
      white-space: pre-wrap;
      word-break: break-all;
      max-height: 100px;
      overflow-y: auto;
      margin-bottom: 20px;
      border: 1px solid var(--vscode-panel-border, rgba(127,127,127,0.1));
    }
    .cs-actions {
      display: flex;
      flex-direction: column;
      gap: 10px;
      align-items: center;
    }
    .cs-btn {
      padding: 8px 20px;
      font-size: 13px;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-family: inherit;
      font-weight: 500;
      transition: all 0.2s ease;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .cs-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .cs-btn-primary {
      background: linear-gradient(135deg, #094BFF, #0084FF);
      color: #fff;
      box-shadow: 0 2px 8px rgba(9,75,255,0.25);
    }
    .cs-btn-primary:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(9,75,255,0.35);
    }
    .cs-btn-primary:active:not(:disabled) {
      transform: translateY(0);
    }
    .cs-classic-link {
      background: none;
      border: none;
      padding: 0;
      margin: 0;
      font: inherit;
      font-size: 12px;
      color: var(--vscode-textLink-foreground);
      cursor: pointer;
      display: inline;
      text-decoration: none;
      line-height: 1.6;
    }
    .cs-classic-link:hover {
      text-decoration: underline;
    }
    .cs-classic-link:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      text-decoration: none;
    }
    .cs-auto-retry {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      min-height: 18px;
    }
  </style>
</head>
<body>
  <div class="cs-card">
    <div class="cs-icon-wrap">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
      </svg>
    </div>
    <div class="cs-brand">CoStrict Cloud</div>
    <div class="cs-title">${escapeHtml(i18n.title)}</div>
    <div class="cs-desc">${escapeHtml(canRetry ? i18n.descRetry : i18n.descNoCsc)}</div>
    <pre class="cs-detail">${escapeHtml(message)}</pre>
    <div class="cs-actions">
      ${
			canRetry
				? `<button id="restart-btn" class="cs-btn cs-btn-primary" onclick="handleRestart()">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 12"/></svg>
        ${escapeHtml(i18n.restart)}
      </button>`
				: ""
		}
      <p class="cs-auto-retry" id="auto-retry-text"></p>
      <button id="switch-to-classic-btn" class="cs-classic-link" onclick="handleSwitchToClassic()">
        ${escapeHtml(i18n.switchToClassic)}
      </button>
    </div>
  </div>
  <script>
    const CAN_RETRY = ${canRetry ? "true" : "false"};
    const I18N = ${JSON.stringify(i18n)};
    const vscode = acquireVsCodeApi();
    const AUTO_RETRY_SECONDS = 10;
    let countdown = AUTO_RETRY_SECONDS;
    let countdownTimer = null;
    let autoRetryEnabled = true;

    function updateCountdownText() {
      const el = document.getElementById("auto-retry-text");
      if (el) {
        el.textContent = countdown > 0 ? I18N.autoRetryCountdown.replace("__COUNT__", countdown) : "";
      }
    }

    function startCountdown() {
      if (!CAN_RETRY) return;
      countdown = AUTO_RETRY_SECONDS;
      updateCountdownText();
      countdownTimer = setInterval(function () {
        countdown--;
        if (countdown <= 0) {
          clearInterval(countdownTimer);
          countdownTimer = null;
          if (autoRetryEnabled) {
            handleRestart();
          }
          return;
        }
        updateCountdownText();
      }, 1000);
    }

    function stopCountdown() {
      autoRetryEnabled = false;
      if (countdownTimer) {
        clearInterval(countdownTimer);
        countdownTimer = null;
      }
      const el = document.getElementById("auto-retry-text");
      if (el) el.textContent = "";
    }

    function handleRestart() {
      stopCountdown();
      const btn = document.getElementById("restart-btn");
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="animation:spin 1s linear infinite"><style>@keyframes spin{to{transform:rotate(360deg)}}</style><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> ' + I18N.starting;
      }
      vscode.postMessage({ type: "reconnectCsCloud" });
    }

    function handleSwitchToClassic() {
      stopCountdown();
      const btn = document.getElementById("switch-to-classic-btn");
      if (btn) {
        btn.disabled = true;
        btn.textContent = I18N.switching;
      }
      vscode.postMessage({ type: "switchToClassicUiMode" });
    }

    window.addEventListener("message", (e) => {
      if (e.data?.type === "reconnectFailed") {
        const btn = document.getElementById("restart-btn");
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 12"/></svg> ' + I18N.restart;
        }
        const detail = document.querySelector(".cs-detail");
        if (detail) {
          detail.textContent = e.data.reason;
        }
        autoRetryEnabled = true;
        startCountdown();
      }
    });

    startCountdown();
  </script>
</body>
</html>`
	}

	/** Reconnect/retry entry for command palette and error-page retry. */
	async reconnectCsCloud(): Promise<void> {
		if (this.csCloudService.startupFailureIsUninstallCsc) {
			throw new Error(this.csCloudService.startupFailureReason ?? t("common:csCloud.error.cscNotInstalled"))
		}

		await this.csCloudService.reconnect()
		this.cachedHtml = undefined
		if (this.view) {
			await this.loadContent(this.view)
		}
	}

	/** Server-process restart entry for command palette. */
	async restartCsCloudServer(): Promise<void> {
		if (this.csCloudService.startupFailureIsUninstallCsc) {
			throw new Error(this.csCloudService.startupFailureReason ?? t("common:csCloud.error.cscNotInstalled"))
		}

		await this.csCloudService.restartServer()
		this.cachedHtml = undefined
		if (this.view) {
			await this.loadContent(this.view)
		}
	}

	dispose() {
		for (const controller of this.proxyFetchControllers.values()) {
			controller.abort()
		}
		this.proxyFetchControllers.clear()
		while (this.disposables.length) {
			this.disposables.pop()?.dispose()
		}
	}
}
