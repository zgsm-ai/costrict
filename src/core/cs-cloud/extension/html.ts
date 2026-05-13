import * as fs from "fs"
import * as path from "path"
import * as vscode from "vscode"
import { getAssistantUIConfig } from "./config"

export function buildAssistantUIFrameUrl(
	webUrl: string,
	csCloudBaseUrl: string,
	workspaceDirectory?: string,
	debug = false,
	accessToken?: string,
	costrictWebUrl?: string,
	pluginVersion?: string,
	pluginSha?: string,
	pluginBuildTime?: string,
) {
	const url = new URL(webUrl)
	url.searchParams.set("csCloudBaseUrl", csCloudBaseUrl)
	url.searchParams.set("assistantUITheme", getAssistantUITheme())
	if (workspaceDirectory) {
		url.searchParams.set("csCloudWorkspaceDirectory", workspaceDirectory)
	}
	if (debug) {
		url.searchParams.set("assistantUIDebug", "1")
	}
	if (costrictWebUrl) {
		url.searchParams.set("costrictWebUrl", costrictWebUrl)
	}
	if (pluginVersion) {
		url.searchParams.set("csCloudVersion", pluginVersion)
	}
	if (pluginSha) {
		url.searchParams.set("csCloudSha", pluginSha)
	}
	if (pluginBuildTime) {
		url.searchParams.set("csCloudBuildTime", pluginBuildTime)
	}
	return url.toString()
}

export function getAssistantUIStaticOutDir(context: vscode.ExtensionContext) {
	const candidates = [
		path.join(context.extensionUri.fsPath, "assets", "cs-cloud-ui", "out"),
		path.join(context.extensionUri.fsPath, "dist", "assets", "cs-cloud-ui", "out"),
	]
	return candidates.find((candidate) => fs.existsSync(path.join(candidate, "index.html"))) ?? candidates[0]
}

export function rewriteStaticAssetUrls(html: string, webview: vscode.Webview, outDir: string) {
	const nextBaseUri = webview
		.asWebviewUri(vscode.Uri.file(path.join(outDir, "_next")))
		.toString()
		.replace(/\/$/, "")
	const rewriteNextPath = (assetPath: string) => {
		const relativePath = assetPath.replace(/^\//, "")
		const localPath = vscode.Uri.file(path.join(outDir, relativePath))
		return webview.asWebviewUri(localPath).toString()
	}

	return html
		.replace(
			/\b(href|src)=(['"])(\/(?:_next\/|__next\.|costrict\/)([^'"<>]*))\2/g,
			(_match, attr: string, quote: string, assetPath: string) => {
				return `${attr}=${quote}${rewriteNextPath(assetPath)}${quote}`
			},
		)
		.replace(/(["'`])\/_next\//g, (_match, quote: string) => `${quote}${nextBaseUri}/`)
}

export function rewriteWebpackPublicPath(html: string, webview: vscode.Webview, outDir: string) {
	const nextBaseUri =
		webview
			.asWebviewUri(vscode.Uri.file(path.join(outDir, "_next")))
			.toString()
			.replace(/\/$/, "") + "/"
	const encodedNextBaseUri = JSON.stringify(nextBaseUri)
	return html
		.replace(/([A-Za-z_$][\w$]*)\.p=(['"])(?:\/?_next\/)\2/g, `$1.p=${encodedNextBaseUri}`)
		.replace(/i\.p="\/_next\/"/g, `i.p=${encodedNextBaseUri}`)
		.replace(/i\.p="_next\/"/g, `i.p=${encodedNextBaseUri}`)
}

export function addNonceToScriptTags(html: string, nonce: string) {
	return html.replace(/<script\b(?![^>]*\bnonce=)([^>]*)>/g, `<script nonce="${nonce}"$1>`)
}

export function injectIntoHead(html: string, content: string) {
	return html.replace(
		"<head>",
		`<head>
${content}`,
	)
}

function getNonce() {
	let text = ""
	const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length))
	}
	return text
}

function escapeHtml(value: string) {
	return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;")
}

function getAssistantUITheme() {
	const themeKind = vscode.window.activeColorTheme?.kind
	return themeKind === 1 || themeKind === 4 ? "light" : "dark"
}

function getAssistantUILogoSvg(context: vscode.ExtensionContext) {
	const candidates = [
		path.join(context.extensionUri.fsPath, "assets", "costrict", "logo.svg"),
		path.join(context.extensionUri.fsPath, "dist", "assets", "costrict", "logo.svg"),
	]
	for (const candidate of candidates) {
		if (fs.existsSync(candidate)) return fs.readFileSync(candidate, "utf8")
	}
	return `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 60 60"><defs><linearGradient id="assistant_ui_logo_a" x1="0.5776" y1="1.0406" x2="0.7515" y2="0"><stop offset="0%" stop-color="#094BFF"/><stop offset="100%" stop-color="#0084FF"/></linearGradient><linearGradient id="assistant_ui_logo_b" x1="1" y1="0.0085" x2="0.8971" y2="0.9328"><stop offset="0%" stop-color="#00D6DE"/><stop offset="100%" stop-color="#30FDBB"/></linearGradient></defs><g transform="matrix(-1 0 0 1 120 0)"><path fill="url(#assistant_ui_logo_a)" fill-rule="evenodd" d="M89.6235 56.2474C75.2996 56.046 63.75 44.3718 63.75 30C63.75 15.5025 75.5025 3.75 90 3.75C104.3718 3.75 116.046 15.2996 116.2474 29.6235C116.2503 29.8323 116.0807 30 115.8718 30H103.5032C103.2943 30 103.1256 29.8329 103.1197 29.6241C102.9208 22.5492 97.123 16.875 90 16.875C82.7513 16.875 76.875 22.7513 76.875 30C76.875 37.123 82.5492 42.9208 89.6241 43.1197C89.8329 43.1256 90 43.2943 90 43.5032V55.8718C90 56.0807 89.8323 56.2503 89.6235 56.2474Z"/><g transform="matrix(-.7071 .7071 .7071 .7071 148.8338 -61.649)"><path fill="url(#assistant_ui_logo_b)" d="M100.9035 33.6V51.84C100.9035 52.1051 101.1185 52.32 101.3835 52.32H112.4235C112.6886 52.32 112.9035 52.1051 112.9035 51.84V33.6C112.9035 33.3349 112.6886 33.12 112.4235 33.12H101.3835C101.1185 33.12 100.9035 33.3349 100.9035 33.6Z"/></g></g></svg>`
}

function getLoadingStyles() {
	return /* css */ `
    @keyframes assistantUILogoFloat {
      0%, 100% { transform: translateY(0) scale(1); }
      50% { transform: translateY(-6px) scale(1.03); }
    }
    @keyframes assistantUILogoGlow {
      0%, 100% { opacity: 0.92; filter: drop-shadow(0 0 6px rgba(56, 139, 253, 0.14)); }
      50% { opacity: 1; filter: drop-shadow(0 0 14px rgba(56, 139, 253, 0.28)); }
    }
    @keyframes assistantUILoadingPing {
      75%, 100% { transform: scale(2); opacity: 0; }
    }
    @keyframes assistantUILoadingSpin {
      to { transform: rotate(360deg); }
    }
    #cloud-ui-loading {
      position: absolute;
      inset: 0;
      z-index: 10;
      display: flex;
      flex-direction: column;
      background: var(--vscode-editor-background);
      color: var(--vscode-foreground);
      font-family: var(--vscode-font-family, sans-serif);
      transition: opacity 160ms ease;
    }
    #cloud-ui-loading[data-hidden="true"] {
      opacity: 0;
      pointer-events: none;
    }
    .cloud-ui-loading-center {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0 24px;
    }
    .cloud-ui-loading-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 20px;
      text-align: center;
    }
    .cloud-ui-loading-logo-wrap {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .cloud-ui-loading-ping {
      position: absolute;
      width: 80px;
      height: 80px;
      border-radius: 9999px;
      background: color-mix(in srgb, var(--vscode-button-background, #388bfd) 10%, transparent);
      animation: assistantUILoadingPing 1.8s cubic-bezier(0, 0, 0.2, 1) infinite;
    }
    .cloud-ui-loading-logo-box {
      position: relative;
      display: flex;
      width: 64px;
      height: 64px;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      border-radius: 16px;
      border: 1px solid var(--vscode-panel-border, rgba(127,127,127,0.35));
      background: var(--vscode-sideBar-background, var(--vscode-editor-background));
      box-shadow: 0 0 30px rgba(0,0,0,0.18);
      animation: assistantUILogoFloat 1.8s ease-in-out infinite;
    }
    .cloud-ui-loading-logo {
      width: 40px;
      height: 40px;
      animation: assistantUILogoGlow 1.8s ease-in-out infinite;
    }
    .cloud-ui-loading-logo > svg {
      width: 100%;
      height: 100%;
    }
    .cloud-ui-loading-text {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
    }
    .cloud-ui-loading-brand {
      color: color-mix(in srgb, var(--vscode-foreground) 90%, transparent);
      font-size: 16px;
      font-weight: 500;
      letter-spacing: 0.18em;
    }
    .cloud-ui-loading-status {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--vscode-descriptionForeground, color-mix(in srgb, var(--vscode-foreground) 65%, transparent));
      font-size: 13px;
    }
    .cloud-ui-loading-spinner {
      width: 16px;
      height: 16px;
      border-radius: 9999px;
      border: 2px solid currentColor;
      border-right-color: transparent;
      animation: assistantUILoadingSpin 0.8s linear infinite;
    }
  `
}

function getLoadingMarkup(logoSvg: string, loadingText = "正在初始化界面...") {
	return /* html */ `<div id="cloud-ui-loading" role="status" aria-live="polite">
    <div class="cloud-ui-loading-center">
      <div class="cloud-ui-loading-card">
        <div class="cloud-ui-loading-logo-wrap">
          <div class="cloud-ui-loading-ping"></div>
          <div class="cloud-ui-loading-logo-box">
            <div class="cloud-ui-loading-logo">${logoSvg}</div>
          </div>
        </div>
        <div class="cloud-ui-loading-text">
          <div class="cloud-ui-loading-brand">CoStrict</div>
          <div class="cloud-ui-loading-status"><span class="cloud-ui-loading-spinner"></span><span>${escapeHtml(loadingText)}</span></div>
        </div>
      </div>
    </div>
  </div>`
}

export function getAssistantUILoadingHtml(context: vscode.ExtensionContext, loadingText?: string) {
	const csp = ["default-src 'none'", `style-src 'unsafe-inline'`].join("; ")
	return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="${escapeHtml(csp)}" />
  <title>CoStrict Assistant UI</title>
  <style>
    html, body { width: 100%; height: 100%; margin: 0; padding: 0; border: 0; }
    body { overflow: hidden; background: var(--vscode-editor-background); color: var(--vscode-editor-foreground); }
    ${getLoadingStyles()}
  </style>
</head>
<body>
  ${getLoadingMarkup(getAssistantUILogoSvg(context), loadingText)}
</body>
</html>`
}

export function getAssistantUIStaticHtml(
	webview: vscode.Webview,
	context: vscode.ExtensionContext,
	csCloudBaseUrl: string,
	workspaceDirectory?: string,
	accessToken?: string,
	costrictWebUrl?: string,
	pluginVersion?: string,
	pluginSha?: string,
	pluginBuildTime?: string,
): string {
	console.log("getAssistantUIStaticHtml accessToken", accessToken)

	const outDir = getAssistantUIStaticOutDir(context)
	const indexPath = path.join(outDir, "index.html")

	if (!fs.existsSync(indexPath)) {
		// Fallback to iframe mode if static export is missing
		const config = getAssistantUIConfig()
		return getAssistantUIIframeHtml(
			webview,
			context,
			csCloudBaseUrl,
			config.webUrl,
			workspaceDirectory,
			accessToken,
			config.debug,
			costrictWebUrl,
			pluginVersion,
			pluginSha,
			pluginBuildTime,
		)
	}

	const nonce = getNonce()
	let csCloudOrigin: string
	try {
		csCloudOrigin = new URL(csCloudBaseUrl).origin
	} catch {
		csCloudOrigin = csCloudBaseUrl
	}
	const csp = [
		`default-src 'none'`,
		`font-src ${webview.cspSource} data:`,
		`style-src ${webview.cspSource} 'unsafe-inline'`,
		`img-src ${webview.cspSource} https://storage.googleapis.com https://img.clerk.com https://*.githubusercontent.com data: blob:`,
		`media-src ${webview.cspSource}`,
		`script-src ${webview.cspSource} 'wasm-unsafe-eval' 'nonce-${nonce}' https://us-assets.i.posthog.com 'strict-dynamic'`,
		`connect-src ${webview.cspSource} ${csCloudOrigin} https://*.sangfor.com https://avatars.githubusercontent.com https://openrouter.ai https://api.requesty.ai https://us.i.posthog.com https://us-assets.i.posthog.com`,
	].join("; ")

	let html = fs.readFileSync(indexPath, "utf8")
	html = rewriteWebpackPublicPath(html, webview, outDir)
	html = rewriteStaticAssetUrls(html, webview, outDir)
	html = addNonceToScriptTags(html, nonce)
	html = injectIntoHead(
		html,
		`<meta http-equiv="Content-Security-Policy" content="${escapeHtml(csp)}" />\n` +
			`<script nonce="${nonce}">
        window.__CS_CLOUD_BASE_URL__ = ${JSON.stringify(csCloudBaseUrl)}; 
        window.__CS_CLOUD_WORKSPACE_DIRECTORY__ = ${JSON.stringify(workspaceDirectory)}; 
        window.__ASSISTANT_UI_THEME__ = ${JSON.stringify(getAssistantUITheme())}; 
        window.__CS_CLOUD_ACCESS_TOKEN__ = ${JSON.stringify(accessToken || "")};
        window.__CS_CLOUD_WEB_URL__ = ${JSON.stringify(costrictWebUrl)};
        window.__CS_CLOUD_VERSION__ = ${JSON.stringify(pluginVersion || "")};
        window.__CS_CLOUD_SHA__ = ${JSON.stringify(pluginSha || "")};
        window.__CS_CLOUD_BUILD_TIME__ = ${JSON.stringify(pluginBuildTime || "")};

        (function(){
          const v=acquireVsCodeApi();
          window.__VSCODE_API__=v;
          window.addEventListener("message",function(e){
            if (e.data?.type === "ASSISTANT_UI_READY") {
              v.postMessage({ type: "ASSISTANT_UI_READY" });
              return;
            }
            if(e.data?.type==="FETCH_QUOTA"){
              v.postMessage({type:"fetchQuota",baseUrl:e.data.baseUrl,token:e.data.token});
            }

            if (e.data?.type === "openExternal" && e.data.url) {
              v.postMessage({ type: "openExternal", url: e.data.url });
              return;
            }
            if (e.data?.type === "openFile" && e.data.path) {
              v.postMessage({ type: "openFile", path: e.data.path });
              return;
            }
            if (e.data?.type === "executeCommand" && e.data.command) {
              v.postMessage({ type: "executeCommand", command: e.data.command });
              return;
            }
          });
        })();
    </script>`,
	)
	return html
}

export function getAssistantUIIframeHtml(
	webview: vscode.Webview,
	context: vscode.ExtensionContext,
	csCloudBaseUrl: string,
	webUrl: string,
	workspaceDirectory?: string,
	accessToken?: string,
	debug = false,
	costrictWebUrl?: string,
	pluginVersion?: string,
	pluginSha?: string,
	pluginBuildTime?: string,
): string {
	console.log("getAssistantUIIframeHtml accessToken", accessToken)

	const nonce = getNonce()
	const frameUrl = buildAssistantUIFrameUrl(
		webUrl,
		csCloudBaseUrl,
		workspaceDirectory,
		debug,
		accessToken,
		costrictWebUrl,
		pluginVersion,
		pluginSha,
		pluginBuildTime,
	)
	const csp = [
		"default-src 'none'",
		`font-src ${webview.cspSource} data:`,
		`style-src ${webview.cspSource} 'unsafe-inline' http://127.0.0.1:* http://localhost:* http://0.0.0.0:*`,
		`img-src ${webview.cspSource} https://storage.googleapis.com https://img.clerk.com https://*.githubusercontent.com https: data: blob:`,
		`media-src ${webview.cspSource}`,
		`script-src 'unsafe-eval' ${webview.cspSource} https://* https://*.posthog.com http://127.0.0.1:* http://localhost:* http://0.0.0.0:* 'nonce-${nonce}'`,
		"frame-src http://127.0.0.1:* http://localhost:*",
		`connect-src ${webview.cspSource} https://* https://*.posthog.com https://*.sangfor.com ws://127.0.0.1:* ws://0.0.0.0:* ws://localhost:*  http://127.0.0.1:* http://localhost:* `,
	].join("; ")

	const diagnosticsStyle = debug ? "" : "display: none;"
	const diagnosticsScript = debug
		? `
    const diagnostics = document.getElementById("cloud-ui-diagnostics");
    const renderDiagnostics = (lines) => {
      diagnostics.textContent = lines.join("
");
    };
    const checkEndpoint = async (label, url) => {
      try {
        const response = await fetch(url, { cache: "no-store" });
        return (label + ": " + response.status + " " + (response.statusText || "")).trim();
      } catch (error) {
        return label + ": failed - " + (error && error.message ? error.message : String(error));
      }
    };
    (async () => {
      const baseUrl = window.__CS_CLOUD_BASE_URL__;
      renderDiagnostics([
        "baseUrl: " + baseUrl,
        "workspace: " + (window.__CS_CLOUD_WORKSPACE_DIRECTORY__ || "(none)"),
        "iframe: " + window.__ASSISTANT_UI_FRAME_URL__,
        "health: checking...",
        "sessions: checking...",
      ]);
      const health = await checkEndpoint("health", baseUrl + "/runtime/health");
      const sessions = await checkEndpoint("sessions", baseUrl + "/experimental/session?roots=true&archived=true");
      renderDiagnostics([
        "baseUrl: " + baseUrl,
        "workspace: " + (window.__CS_CLOUD_WORKSPACE_DIRECTORY__ || "(none)"),
        "iframe: " + window.__ASSISTANT_UI_FRAME_URL__,
        health,
        sessions,
      ]);
    })();`
		: ""

	return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="${escapeHtml(csp)}" />
  <title>CoStrict Assistant UI</title>
  <style>
    html, body { width: 100%; height: 100%; margin: 0; padding: 0; border: 0; }
    body { position: relative; overflow: hidden; background: var(--vscode-editor-background); color: var(--vscode-editor-foreground); display: flex; flex-direction: column; }
    #cloud-ui-diagnostics { box-sizing: border-box; border-bottom: 1px solid var(--vscode-panel-border, #333); color: var(--vscode-descriptionForeground, #aaa); font: 11px/1.4 var(--vscode-font-family, sans-serif); padding: 6px 8px; white-space: pre-wrap; word-break: break-all; ${diagnosticsStyle} }
    iframe { width: 100%; flex: 1 1 auto; min-height: 0; margin: 0; padding: 0; border: 0; }
    ${getLoadingStyles()}
  </style>
</head>
<body>
  <div id="cloud-ui-diagnostics">Assistant UI diagnostics: checking cs-cloud...</div>
  ${getLoadingMarkup(getAssistantUILogoSvg(context), "正在加载 CoStrict Cloud...")}
  <script nonce="${nonce}">
    window.__CS_CLOUD_BASE_URL__ = ${JSON.stringify(csCloudBaseUrl)};
    window.__CS_CLOUD_WEB_URL__ = ${JSON.stringify(costrictWebUrl)};
    window.__CS_CLOUD_WORKSPACE_DIRECTORY__ = ${JSON.stringify(workspaceDirectory)};
    window.__CS_CLOUD_ACCESS_TOKEN__ = ${JSON.stringify(accessToken || "")};
    window.__ASSISTANT_UI_FRAME_URL__ = ${JSON.stringify(frameUrl)};
    window.__ASSISTANT_UI_THEME__ = ${JSON.stringify(getAssistantUITheme())};
    window.__CS_CLOUD_VERSION__ = ${JSON.stringify(pluginVersion || "")};
    window.__CS_CLOUD_SHA__ = ${JSON.stringify(pluginSha || "")};
    window.__CS_CLOUD_BUILD_TIME__ = ${JSON.stringify(pluginBuildTime || "")};
    window.__ASSISTANT_UI_HIDE_LOADING__ = function () {
      const loading = document.getElementById("cloud-ui-loading");
      if (!loading) return;
      loading.setAttribute("data-hidden", "true");
      setTimeout(function () { loading.remove(); }, 180);
    };
    window.addEventListener("DOMContentLoaded", function () {
      const frame = document.getElementById("cloud-frame");
      if (frame) {
        frame.addEventListener("load", function () {
          window.__ASSISTANT_UI_HIDE_LOADING__();
          if (frame.contentWindow && window.__CS_CLOUD_ACCESS_TOKEN__) {
            frame.contentWindow.postMessage({ type: "ACCESS_TOKEN", token: window.__CS_CLOUD_ACCESS_TOKEN__ }, frameOrigin);
          }
        });
      }
      setTimeout(window.__ASSISTANT_UI_HIDE_LOADING__, 8000);
    });
    const vscodeApi = acquireVsCodeApi();
    const frameOrigin = new URL(window.__ASSISTANT_UI_FRAME_URL__).origin;
    let cloudFrameReady = false;
    const pendingFrameMessages = [];

    function flushFrameMessages() {
      const frame = document.getElementById("cloud-frame");
      if (!frame?.contentWindow) return;
      const msgs = pendingFrameMessages.splice(0);
      for (const data of msgs) {
        frame.contentWindow.postMessage(data, frameOrigin);
      }
    }

    window.addEventListener("message", function (event) {
      const frame = document.getElementById("cloud-frame");

      // 来自 iframe 的消息：转发给 VS Code
      if (event.source === frame?.contentWindow) {
        if (event.data?.type === "ASSISTANT_UI_READY") {
          cloudFrameReady = true;
          flushFrameMessages();
          vscodeApi.postMessage({ type: "ASSISTANT_UI_READY" });
          return;
        }
        if (event.data?.type === "REQUEST_ACCESS_TOKEN") {
          if (frame.contentWindow && window.__CS_CLOUD_ACCESS_TOKEN__) {
            frame.contentWindow.postMessage({ type: "ACCESS_TOKEN", token: window.__CS_CLOUD_ACCESS_TOKEN__ }, frameOrigin);
          }
          return;
        }
        if (event.data?.type === "FETCH_QUOTA") {
          console.log("[iframe-wrapper] received FETCH_QUOTA from iframe, forwarding to VS Code", event.data);
          vscodeApi.postMessage({ type: "fetchQuota", baseUrl: event.data.baseUrl, token: event.data.token });
          return;
        }
        if (event.data?.type === "openExternal" && event.data.url) {
          vscodeApi.postMessage({ type: "openExternal", url: event.data.url });
          return;
        }
        if (event.data?.type === "openFile" && event.data.path) {
          vscodeApi.postMessage({ type: "openFile", path: event.data.path });
          return;
        }
        if (event.data?.type === "executeCommand" && event.data.command) {
          vscodeApi.postMessage({ type: "executeCommand", command: event.data.command });
          return;
        }
        return;
      }

      // 来自 VS Code 的消息：转发给 iframe
      if (event.data?.type === "assistantUIContext") {
        if (cloudFrameReady && frame?.contentWindow) {
          frame.contentWindow.postMessage(event.data, frameOrigin);
        } else {
          pendingFrameMessages.push(event.data);
        }
        return;
      }
      if (event.data?.type === "quotaResult") {
        console.log("[iframe-wrapper] forwarding quotaResult to iframe", event.data);
        if (frame?.contentWindow) {
          frame.contentWindow.postMessage(event.data, frameOrigin);
        }
      }
      if (event.data?.type === "theme") {
        if (frame?.contentWindow) {
          frame.contentWindow.postMessage(event.data, frameOrigin);
        }
      }
    });
  </script>
  <iframe id="cloud-frame" src="${escapeHtml(frameUrl)}" title="CoStrict Assistant UI"></iframe>
</body>
</html>`
}
