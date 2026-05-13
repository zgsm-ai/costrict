import * as vscode from "vscode"
import * as fs from "fs"
import * as os from "os"
import * as path from "path"
import { CsCloudService } from "./csCloudService"
import { getAssistantUIConfig, type AssistantUIConfig } from "./config"
import { getAssistantUIStaticHtml, getAssistantUIIframeHtml, getAssistantUILoadingHtml } from "./html"
import { CostrictAuthService } from "../../costrict/auth"
import { CostrictAuthConfig } from "../../costrict/auth/authConfig"
import type { AssistantUIContextMessage } from "./types"
import { setActiveCloudProvider, onCloudUiReady, setCloudUnavailable } from "./contextBridge"
import { Package } from "../../../shared/package"

export function getAssistantUIWorkspaceDirectory() {
	return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
}

export function shouldUseAssistantUIIframe(context: vscode.ExtensionContext, config: AssistantUIConfig) {
	return context.extensionMode === vscode.ExtensionMode.Development || config.webviewMode === "iframe"
}

export class AssistantUISidebarProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = "costrict.AssistantUISidebarProvider"

	private view?: vscode.WebviewView
	private csCloudService: CsCloudService
	private disposables: vscode.Disposable[] = []

	constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly outputChannel: vscode.OutputChannel,
	) {
		this.csCloudService = new CsCloudService(outputChannel)
		context.subscriptions.push(this.csCloudService)
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
				if (message.type === "executeCommand" && message.command) {
					vscode.commands.executeCommand(message.command)
				}
				if (message.type === "reloadAssistantUI") {
					await this.loadContent(webviewView)
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

		await this.loadContent(webviewView)

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

		// Handle dispose
		webviewView.onDidDispose(
			() => {
				this.view = undefined
				this.dispose()
			},
			null,
			this.disposables,
		)
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
					const authFilePath = path.join(os.homedir(), ".costrict", "share", "auth.json")
					if (fs.existsSync(authFilePath)) {
						const content = fs.readFileSync(authFilePath, "utf-8")
						const data = JSON.parse(content)
						if (data?.access_token) {
							accessToken = data.access_token
						}
					}
				} catch (error) {
					console.error("Failed to read fallback auth file:", error)
				}
			}
			const costrictWebUrl = CostrictAuthConfig.getInstance().getDefaultApiBaseUrl()
			const pluginVersion = Package.version
			const pluginSha = Package.sha
			const pluginBuildTime = Package.buildTime
			// 如果 vscode 里面等 accessToken 没有了，被清空了，就去 $HOME/.costrict/share/auth.json 里面找 access_token 字段
			if (shouldUseAssistantUIIframe(this.context, getAssistantUIConfig())) {
				webviewView.webview.html = getAssistantUIIframeHtml(
					webviewView.webview,
					this.context,
					baseUrl,
					getAssistantUIConfig().webUrl,
					workspaceDirectory,
					accessToken ?? undefined,
					getAssistantUIConfig().debug,
					costrictWebUrl,
					pluginVersion,
					pluginSha,
					pluginBuildTime,
				)
			} else {
				webviewView.webview.html = getAssistantUIStaticHtml(
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
	 </style>
</head>
<body>
	 <h3>CoStrict Cloud 启动失败</h3>
	 <pre>${message.replace(/</g, "<")}</pre>
	 <p class="hint">请检查输出面板（Output → CoStrict）中的完整日志，或尝试重新登录 cs-cloud。</p>
	 <button onclick="vscode.postMessage({type:'reloadAssistantUI'})">重试</button>
	 <script>
	   const vscode = acquireVsCodeApi();
	 </script>
</body>
</html>`
	}

	dispose() {
		while (this.disposables.length) {
			this.disposables.pop()?.dispose()
		}
	}
}
