import * as vscode from "vscode"
import * as path from "path"
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

export function shouldUseAssistantUIIframe(context: vscode.ExtensionContext, config: AssistantUIConfig) {
	return context.extensionMode === vscode.ExtensionMode.Development || config.webviewMode === "iframe"
}

export class AssistantUISidebarProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = "costrict.AssistantUISidebarProvider"

	private view?: vscode.WebviewView
	private readonly csCloudService: CsCloudService
	private disposables: vscode.Disposable[] = []

	/**
	 * 缓存首次成功加载后的 HTML，用于侧边栏拖拽移动后快速恢复。
	 * 当 VS Code 拖拽 Activity Bar 到另一侧边栏时，WebviewView 会被销毁后重建，
	 * resolveWebviewView 会被再次调用。通过缓存避免重新调用 ensureStarted 和重新生成 HTML。
	 */
	private cachedHtml: string | undefined

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
			case "crashed":
				webviewView.webview.html = getCrashedHtml(this.csCloudService.lastCrashReason)
				return
			case "failed":
				webviewView.webview.html = this.getErrorHtml(
					this.csCloudService.startupFailureReason ??
						this.csCloudService.lastCrashReason ??
						"cs-cloud 启动失败",
				)
				return
			case "running":
				await this.loadContent(webviewView)
				return
			case "starting":
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
			let accessToken = await CostrictAuthService.getInstance().getCurrentAccessToken()

			// Fallback: if vscode token is cleared, read from ~/.costrict/share/auth.json
			if (!accessToken) {
				try {
					const data = readCostrictAccessToken()
					if (data?.access_token) {
						accessToken = data.access_token
					}
				} catch (error) {
					console.error("Failed to read fallback auth file:", error)
				}
			}
			const costrictWebUrl = CostrictAuthConfig.getInstance().getDefaultApiBaseUrl()
			const pluginVersion = Package.version
			const pluginSha = Package.sha
			const pluginBuildTime = Package.buildTime
			const config = getAssistantUIConfig()
			// 如果 vscode 里面等 accessToken 没有了，被清空了，就去 $HOME/.costrict/share/auth.json 里面找 access_token 字段
			if (shouldUseAssistantUIIframe(this.context, config)) {
				const html = getAssistantUIIframeHtml(
					webviewView.webview,
					this.context,
					baseUrl,
					config.webUrl,
					workspaceDirectory,
					accessToken ?? undefined,
					config.debug,
					costrictWebUrl,
					pluginVersion,
					pluginSha,
					pluginBuildTime,
				)
				webviewView.webview.html = html
				this.cachedHtml = html
			} else {
				const html = getAssistantUIStaticHtml(
					webviewView.webview,
					this.context,
					baseUrl,
					workspaceDirectory,
					accessToken ?? undefined,
					costrictWebUrl,
					pluginVersion,
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
		return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
	 <meta charset="UTF-8">
	 <meta name="viewport" content="width=device-width, initial-scale=1.0">
	 <style>
	   body { font-family: var(--vscode-font-family); padding: 20px; color: var(--vscode-foreground); line-height: 1.5; }
	   h3 { color: var(--vscode-errorForeground); margin-top: 0; }
	   pre { background: var(--vscode-textCodeBlock-background); padding: 10px; border-radius: 4px; overflow-x: auto; }
	   .hint { margin-top: 12px; font-size: 0.9em; color: var(--vscode-descriptionForeground); }
	   button { margin-top: 12px; padding: 6px 12px; cursor: pointer; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 2px; }
	   button:hover { background: var(--vscode-button-hoverBackground); }
	   button:disabled { opacity: 0.5; cursor: not-allowed; }
	   .error-detail { background: var(--vscode-textCodeBlock-background); padding: 10px; border-radius: 4px; overflow-x: auto; }
	 </style>
</head>
<body>
	 <h3>CoStrict Cloud 启动失败</h3>
	 <pre class="error-detail">${escapeHtml(message)}</pre>
	 <p class="hint">请检查输出面板（Output → CoStrict）中的完整日志，或尝试重新登录 cs-cloud。</p>
	 <button id="restart-btn" onclick="handleRestart()">重试</button>
	 <script>
	   const vscode = acquireVsCodeApi();

	   function handleRestart() {
	     const btn = document.getElementById("restart-btn");
	     if (btn) {
	       btn.disabled = true;
	       btn.textContent = "正在重启...";
	     }
	     vscode.postMessage({ type: "restartCsCloud" });
	   }

	   // 监听重启结果（由 SidebarProvider 回发）
	   window.addEventListener("message", (e) => {
	     if (e.data?.type === "restartFailed") {
	       const btn = document.getElementById("restart-btn");
	       if (btn) {
	         btn.disabled = false;
	         btn.textContent = "重试";
	       }
	       const detail = document.querySelector(".error-detail");
	       if (detail) {
	         detail.textContent = e.data.reason;
	       }
	     }
	   });
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
		await this.csCloudService.restart()
		this.cachedHtml = undefined
		if (this.view) {
			await this.loadContent(this.view)
		}
	}

	dispose() {
		while (this.disposables.length) {
			this.disposables.pop()?.dispose()
		}
	}
}
