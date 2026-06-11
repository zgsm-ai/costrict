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
		return { success: true, message: `Checked out branch ${branch}` }
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		return { success: false, message: `Failed to checkout branch: ${message}` }
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

	/**
	 * 缓存首次成功加载后的 HTML，用于侧边栏拖拽移动后快速恢复。
	 * 当 VS Code 拖拽 Activity Bar 到另一侧边栏时，WebviewView 会被销毁后重建，
	 * resolveWebviewView 会被再次调用。通过缓存避免重新调用 ensureStarted 和重新生成 HTML。
	 */
	private cachedHtml: string | undefined
	private readonly proxyFetchControllers = new Map<string, AbortController>()

	constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly outputChannel: vscode.OutputChannel,
		csCloudService: CsCloudService,
	) {
		this.csCloudService = csCloudService
	}

	/**
	 * 向 Cloud UI webview 发送 context 消息。
	 * 不直接暴露 private view 成员。
	 */
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

		// 注册为 active Cloud provider，获取当前 generation
		const cloudGen = setActiveCloudProvider(this)

		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this.context.extensionUri],
		}

		// Handle dispose — 必须在所有 early return 之前注册
		webviewView.onDidDispose(
			() => {
				this.view = undefined
				setActiveCloudProvider(undefined)
				this.dispose()
			},
			null,
			this.disposables,
		)

		// 1. 先注册事件监听（必须在分支渲染之前）+ 生命周期管理
		const crashedHandler = ({ reason }: { reason: string }) => {
			if (this.view) {
				this.view.webview.html = getCrashedHtml(reason)
			}
		}
		this.csCloudService.on("crashed", crashedHandler)

		// webview dispose 时移除监听，避免重复绑定和内存泄漏
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
					// 用户主动触发 reload 时清除缓存，强制完整重新加载
					this.cachedHtml = undefined
					await this.loadContent(webviewView)
				}
				if (message.type === "restartCsCloud") {
					if (this.csCloudService.startupFailureIsUninstallCsc) {
						return
					}
					try {
						await this.csCloudService.restart()
						// 成功：重新加载 Cloud UI
						this.cachedHtml = undefined
						await this.loadContent(this.view!)
					} catch (err) {
						// 失败：通知错误页恢复按钮
						const reason = err instanceof Error ? err.message : String(err)
						this.outputChannel.appendLine(`[AssistantUI] Restart cs-cloud failed: ${reason}`)
						this.view?.webview.postMessage({
							type: "restartFailed",
							reason,
						})
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
		// 如果有缓存的 HTML（侧边栏拖拽移动后重建 webview），直接复用
		if (this.cachedHtml) {
			webviewView.webview.html = this.cachedHtml
			return
		}
		// 2. 根据持久化状态渲染
		switch (this.csCloudService.state) {
			case "error":
				webviewView.webview.html = this.getErrorHtml(
					this.csCloudService.startupFailureReason ??
						this.csCloudService.lastCrashReason ??
						"cs-cloud 启动失败",
				)
				return
			case "running":
				await this.loadContent(webviewView)
				return
			case "loading":
			case "idle":
				webviewView.webview.html = getAssistantUILoadingHtml(this.context, "正在启动 CoStrict Cloud...")
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
  <p>CoStrict Assistant UI is disabled. Enable it via <code>costrict.assistantUI.enabled</code>.</p>
</body>
</html>`
	}

	private async loadContent(webviewView: vscode.WebviewView) {
		webviewView.webview.html = getAssistantUILoadingHtml(this.context, "正在启动 CoStrict Cloud...")

		try {
			const workspaceDirectory = getAssistantUIWorkspaceDirectory()
			const baseUrl = await vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: "Starting CoStrict Cloud",
					cancellable: false,
				},
				() => this.csCloudService.ensureStarted(),
			)

			// In Remote SSH / dev-container scenarios, the webview runs on the
			// local client while cs-cloud runs on the remote machine. A raw
			// http://127.0.0.1 URL would resolve to the client's localhost,
			// not the remote machine. vscode.env.asExternalUri tells VS Code to
			// create a tunnel proxy URI so the webview can reach the remote
			// cs-cloud through the SSH tunnel.
			// In local (non-remote) scenarios this returns the original URI unchanged.
			let tunneledBaseUrl = ""
			if (vscode.env.remoteName === "ssh" || vscode.env.remoteName === "ssh-remote") {
				tunneledBaseUrl = (await vscode.env.asExternalUri(vscode.Uri.parse(baseUrl))).toString(true)
				this.outputChannel.appendLine(
					`Detected remote environment (${vscode.env.remoteName}|${vscode.env.appName}), tunneling cs-cloud URL to ${tunneledBaseUrl}`,
				)
			} else if (vscode.env.appName === "code-server" && vscode.env.remoteName && !tunneledBaseUrl) {
				// code-server: the webview runs in a browser, so 127.0.0.1 would resolve to
				// the client instead of the server. vscode.env.remoteName carries the server
				// address (e.g. "192.168.31.168:8282") – extract its hostname and replace
				// the localhost hostname in baseUrl with it.
				const remoteHost = vscode.env.remoteName.split(":")[0]
				if (remoteHost) {
					try {
						const baseUrlObj = new URL(baseUrl)
						baseUrlObj.hostname = remoteHost
						tunneledBaseUrl = baseUrlObj.toString()
						this.outputChannel.appendLine(
							`Detected code-server environment, replacing localhost with remote host ${remoteHost}: ${tunneledBaseUrl}`,
						)
					} catch {
						// baseUrl is not a valid URL, leave tunneledBaseUrl empty
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
			const config = getAssistantUIConfig()
			const csCloudBaseUrl = tunneledBaseUrl || baseUrl
			// [getAssistantUIStaticHtml] remoteName (192.168.31.168:8282|code-server) csCloudBaseUrl: http://127.0.0.1:45489/api/v1, tunneledBaseUrl:
			// 如果 vscode 里面等 accessToken 没有了，被清空了，就去 $HOME/.costrict/share/auth.json 里面找 access_token 字段
			if (shouldUseAssistantUIIframe(this.context, config)) {
				this.outputChannel.appendLine(
					`[AssistantUISidebarProvider] remoteName (${vscode.env.remoteName}|${vscode.env.appName}) csCloudBaseUrl: ${baseUrl}, tunneledBaseUrl: ${tunneledBaseUrl}`,
				)
				const html = getAssistantUIIframeHtml(
					webviewView.webview,
					this.context,
					csCloudBaseUrl, // iframe 模式下必须使用 tunneledBaseUrl，确保远程环境可访问
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
					`[getAssistantUIStaticHtml] remoteName (${vscode.env.remoteName}|${vscode.env.appName}) csCloudBaseUrl: ${baseUrl}, tunneledBaseUrl: ${tunneledBaseUrl}`,
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
    <div class="cs-title">服务启动遇到问题</div>
    <div class="cs-desc">${canRetry ? "后台服务未能正常启动，请稍等片刻，我们会自动尝试恢复。" : "未检测到 csc，请先按提示安装并启动 CoStrict Cloud。"}</div>
    <pre class="cs-detail">${escapeHtml(message)}</pre>
    <div class="cs-actions">
      ${
			canRetry
				? `<button id="restart-btn" class="cs-btn cs-btn-primary" onclick="handleRestart()">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 12"/></svg>
        重新启动
      </button>`
				: ""
		}
      <p class="cs-auto-retry" id="auto-retry-text"></p>
    </div>
  </div>
  <script>
    const CAN_RETRY = ${canRetry ? "true" : "false"};
    const vscode = acquireVsCodeApi();
    const AUTO_RETRY_SECONDS = 10;
    let countdown = AUTO_RETRY_SECONDS;
    let countdownTimer = null;
    let autoRetryEnabled = true;

    function updateCountdownText() {
      const el = document.getElementById("auto-retry-text");
      if (el) {
        el.textContent = countdown > 0 ? countdown + " 秒后自动重试…" : "";
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
        btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="animation:spin 1s linear infinite"><style>@keyframes spin{to{transform:rotate(360deg)}}</style><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> 正在启动…';
      }
      vscode.postMessage({ type: "restartCsCloud" });
    }

    window.addEventListener("message", (e) => {
      if (e.data?.type === "restartFailed") {
        const btn = document.getElementById("restart-btn");
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 12"/></svg> 重新启动';
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

	/**
	 * 命令面板专用 restart 入口。
	 * 如果 sidebar 未打开，直接 restart 即可（下次打开时根据状态渲染）。
	 * 如果 sidebar 已打开，restart 成功后重新加载内容。
	 */
	async restartCsCloud(): Promise<void> {
		if (this.csCloudService.startupFailureIsUninstallCsc) {
			throw new Error(this.csCloudService.startupFailureReason ?? "未安装 csc")
		}

		await this.csCloudService.restart()
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
