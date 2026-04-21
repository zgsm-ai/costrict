import * as vscode from "vscode"
import axios from "axios"

import { getNonce } from "../core/webview/getNonce"
import { getUri } from "../core/webview/getUri"
import { Package } from "../shared/package"
import { CsCloudBridge } from "./CsCloudBridge"
import type {
	CostrictCloudBridgeRequest,
	CostrictCloudBridgeResponse,
	CostrictCloudBootstrap,
	CostrictCloudEvent,
	CostrictCloudEventStatus,
	CostrictCloudExtensionMessage,
	CostrictCloudWebviewMessage,
} from "./types"
import { isCostrictCloudRequest } from "./types"

export class CostrictCloudWebviewProvider implements vscode.WebviewViewProvider {
	public static readonly sideBarId = `${Package.commandIDPrefix}.SidebarProvider`

	private view?: vscode.WebviewView
	private readonly bridge = new CsCloudBridge()
	private eventStreamAbortController?: AbortController
	private currentEventStreamToken = 0

	constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly outputChannel: vscode.OutputChannel,
	) {}

	public async resolveWebviewView(webviewView: vscode.WebviewView): Promise<void> {
		this.view = webviewView
		webviewView.onDidDispose(() => {
			this.stopEventStream()
		})
		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots:
				this.context.extensionMode === vscode.ExtensionMode.Development
					? [
							vscode.Uri.joinPath(this.context.extensionUri, "webview-ui", "build"),
							vscode.Uri.parse("http://localhost:5173"),
						]
					: [vscode.Uri.joinPath(this.context.extensionUri, "webview-ui", "build")],
		}
		webviewView.webview.onDidReceiveMessage((message: CostrictCloudWebviewMessage | { type?: string }) => {
			switch (message.type) {
				case "costrict-cloud.refresh":
					void this.postBootstrap()
					break
				case "costrict-cloud.request":
					if (isCostrictCloudRequest(message)) {
						void this.handleBridgeRequest(message)
					}
					break
				case "costrict-cloud.events.start":
					this.startEventStream()
					break
				case "costrict-cloud.events.stop":
					this.stopEventStream()
					break
				default:
					break
			}
		})
		webviewView.webview.html =
			this.context.extensionMode === vscode.ExtensionMode.Development
				? await this.getHMRHtmlContent(webviewView.webview)
				: await this.renderHtml(webviewView.webview)
		await this.postBootstrap()
	}

	public async refresh(): Promise<void> {
		await this.postBootstrap()
	}

	private async handleBridgeRequest(message: CostrictCloudBridgeRequest): Promise<void> {
		const response = await this.bridge.request(message)
		await this.postExtensionMessage(response)
	}

	private async postBootstrap(): Promise<void> {
		const status = await this.bridge.getStatus()
		const message: CostrictCloudBootstrap = {
			type: "costrict-cloud.bootstrap",
			payload: status,
		}
		this.outputChannel.appendLine(
			`[costrict-cloud] bootstrap posted (auth=${status.authenticated}, serverUrl=${status.serverUrl ?? "missing"}, healthy=${status.healthy})`,
		)
		await this.postExtensionMessage(message)
	}

	private async startEventStream(): Promise<void> {
		this.stopEventStream()
		const token = ++this.currentEventStreamToken
		const abortController = new AbortController()
		this.eventStreamAbortController = abortController
		this.outputChannel.appendLine("[costrict-cloud] starting event stream")
		void this.bridge.streamEvents(async (message) => {
			if (token !== this.currentEventStreamToken) {
				return
			}
			await this.postExtensionMessage(message)
		}, abortController.signal)
	}

	private stopEventStream(): void {
		this.eventStreamAbortController?.abort()
		this.eventStreamAbortController = undefined
	}

	private async postExtensionMessage(
		message:
			| CostrictCloudExtensionMessage
			| CostrictCloudBridgeResponse
			| CostrictCloudBootstrap
			| CostrictCloudEvent
			| CostrictCloudEventStatus,
	): Promise<void> {
		await this.view?.webview.postMessage(message)
	}

	private async renderHtml(webview: vscode.Webview): Promise<string> {
		const nonce = getNonce()
		const stylesUri = getUri(webview, this.context.extensionUri, ["webview-ui", "build", "assets", "index.css"])
		const scriptUri = getUri(webview, this.context.extensionUri, ["webview-ui", "build", "assets", "cloud.js"])
		const csp = [
			"default-src 'none'",
			`font-src ${webview.cspSource} data:`,
			`style-src ${webview.cspSource} 'unsafe-inline'`,
			`img-src ${webview.cspSource} data: https:`,
			`script-src ${webview.cspSource} 'wasm-unsafe-eval' 'nonce-${nonce}'`,
			`connect-src ${webview.cspSource} https: http://127.0.0.1:* http://localhost:* ws://127.0.0.1:* ws://localhost:*`,
		].join("; ")

		return /* html */ `<!DOCTYPE html>
<html lang="zh-CN">
<head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<meta http-equiv="Content-Security-Policy" content="${csp}" />
	<link rel="stylesheet" type="text/css" href="${stylesUri}" />
	<title>CoStrict Cloud</title>
</head>
<body>
	<div id="root"></div>
	<script nonce="${nonce}" type="module" src="${scriptUri}"></script>
</body>
</html>`
	}

	private async getHMRHtmlContent(webview: vscode.Webview): Promise<string> {
		let localPort = "5173"

		try {
			const fs = require("fs")
			const path = require("path")
			const portFilePath = path.resolve(__dirname, "../../.vite-port")

			if (fs.existsSync(portFilePath)) {
				localPort = fs.readFileSync(portFilePath, "utf8").trim()
			}
		} catch (err) {
			console.error("[CostrictCloudWebviewProvider:Vite] Failed to read Vite port file:", err)
		}

		const localServerUrl = `localhost:${localPort}`

		try {
			await axios.get(`http://${localServerUrl}`)
		} catch {
			vscode.window.showErrorMessage("Vite dev server is not running. HMR unavailable for cloud webview.")
			return this.renderHtml(webview)
		}

		const nonce = getNonce()
		const stylesUri = getUri(webview, this.context.extensionUri, ["webview-ui", "build", "assets", "index.css"])

		const file = "src/costrict-cloud/index.tsx"
		const scriptUri = `http://${localServerUrl}/${file}`

		const reactRefresh = /*html*/ `
			<script nonce="${nonce}" type="module">
				import RefreshRuntime from "http://localhost:${localPort}/@react-refresh"
				RefreshRuntime.injectIntoGlobalHook(window)
				window.$RefreshReg$ = () => {}
				window.$RefreshSig$ = () => (type) => type
				window.__vite_plugin_react_preamble_installed__ = true
			</script>
		`

		const csp = [
			"default-src 'none'",
			`font-src ${webview.cspSource} data:`,
			`style-src ${webview.cspSource} 'unsafe-inline' http://${localServerUrl} http://0.0.0.0:${localPort}`,
			`img-src ${webview.cspSource} data: https:`,
			`script-src 'unsafe-eval' ${webview.cspSource} http://${localServerUrl} http://0.0.0.0:${localPort} 'nonce-${nonce}'`,
			`connect-src ${webview.cspSource} https: http://127.0.0.1:* http://localhost:* ws://127.0.0.1:* ws://localhost:* ws://${localServerUrl} ws://0.0.0.0:${localPort} http://${localServerUrl} http://0.0.0.0:${localPort}`,
		].join("; ")

		return /* html */ `<!DOCTYPE html>
<html lang="zh-CN">
<head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<meta http-equiv="Content-Security-Policy" content="${csp}" />
	<link rel="stylesheet" type="text/css" href="${stylesUri}" />
	<title>CoStrict Cloud</title>
</head>
<body>
	<div id="root"></div>
	${reactRefresh}
	<script nonce="${nonce}" type="module" src="${scriptUri}"></script>
</body>
</html>`
	}
}
