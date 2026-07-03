import * as fs from "fs"
import * as path from "path"
import * as vscode from "vscode"
import { getAssistantUIConfig } from "./config"
import { t } from "../../../i18n"

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
	return html.replace("<head>", `<head>\n${content}`)
}

export function injectBeforeBodyClose(html: string, content: string) {
	return html.replace("</body>", `${content}\n</body>`)
}

/** Persist and restore form state across webview rebuilds. */
export function getFormStatePersistenceScript(): string {
	return /* js */ `
(function(){
  var vscode = window.__VSCODE_API__;
  if (!vscode) return;

  function isReactControlled(el) {
    return !!el && '_valueTracker' in el;
  }

  function collectFormState() {
    var state = {};
    try {
      var inputs = document.querySelectorAll('input:not([type="password"]):not([type="hidden"]):not([type="file"]), textarea, select, [contenteditable="true"]');
      inputs.forEach(function(el, i) {
        var key = el.id || el.name || el.getAttribute('data-state-key') || ('__anon_' + i);
        try {
          if (isReactControlled(el)) return;
          if (el.getAttribute('contenteditable') === 'true') {
            state[key] = el.innerText || el.textContent || '';
          } else if (el.type === 'checkbox' || el.type === 'radio') {
            state[key] = el.checked;
          } else {
            state[key] = el.value || '';
          }
        } catch(e) {}
      });
    } catch(e) {}
    return state;
  }

  function saveState() {
    try {
      var state = collectFormState();
      if (Object.keys(state).length > 0) {
        vscode.setState(state);
      }
    } catch(e) {}
  }

  function applyState(saved) {
    if (!saved || typeof saved !== 'object') return;
    try {
      var inputs = document.querySelectorAll('input:not([type="password"]):not([type="hidden"]):not([type="file"]), textarea, select, [contenteditable="true"]');
      inputs.forEach(function(el, i) {
        var key = el.id || el.name || el.getAttribute('data-state-key') || ('__anon_' + i);
        try {
          if (isReactControlled(el)) return;
          if (document.activeElement === el) return;
          if (saved[key] !== undefined) {
            if (el.getAttribute('contenteditable') === 'true') {
              if (el.innerText !== saved[key]) {
                el.innerText = saved[key];
                el.textContent = saved[key];
              }
            } else if (el.type === 'checkbox' || el.type === 'radio') {
              if (el.checked !== saved[key]) el.checked = saved[key];
            } else {
              if (el.value !== saved[key]) {
                el.value = saved[key];
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
              }
            }
          }
        } catch(e) {}
      });
    } catch(e) {}
  }

  function restoreState() {
    try {
      var saved = vscode.getState();
      if (!saved) return;
      applyState(saved);

      // Watch for React-rendered elements
      var attempts = 0;
      var maxAttempts = 10;
      var observer = new MutationObserver(function() {
        applyState(saved);
        attempts++;
        if (attempts >= maxAttempts) {
          observer.disconnect();
        }
      });
      observer.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true,
      });
      setTimeout(function() { observer.disconnect(); }, 5000);
    } catch(e) {}
  }

  // Auto-save every 3s
  setInterval(saveState, 3000);

  // Save on hide
  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'hidden') saveState();
  });

  // Save before unload
  window.addEventListener('beforeunload', saveState);

  // Restore on ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      setTimeout(restoreState, 200);
    });
  } else {
    setTimeout(restoreState, 200);
  }
})();`
}

function getNonce() {
	let text = ""
	const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length))
	}
	return text
}

/** Escape HTML special characters. */
export function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;")
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

function getLoadingMarkup(logoSvg: string, loadingText = t("common:csCloud.loading.initializing")) {
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

/** Crashed error page with auto-retry. */
export function getCrashedHtml(reason?: string): string {
	const i18n = {
		title: t("common:csCloud.crashed.title"),
		desc: t("common:csCloud.crashed.desc"),
		reconnect: t("common:csCloud.crashed.reconnect"),
		switchToClassic: t("common:csCloud.crashed.switchToClassic"),
		autoRetryCountdown: t("common:csCloud.crashed.autoRetryCountdown", { count: "__COUNT__" }),
		connecting: t("common:csCloud.crashed.connecting"),
		switching: t("common:csCloud.crashed.switching"),
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
    <div class="cs-desc">${escapeHtml(i18n.desc)}</div>
    ${reason ? `<pre class="cs-detail">${escapeHtml(reason)}</pre>` : ""}
    <div class="cs-actions">
      <button id="restart-btn" class="cs-btn cs-btn-primary" onclick="handleRestart()">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 12"/></svg>
        ${escapeHtml(i18n.reconnect)}
      </button>
      <p class="cs-auto-retry" id="auto-retry-text"></p>
      <button id="switch-to-classic-btn" class="cs-classic-link" onclick="handleSwitchToClassic()">
        ${escapeHtml(i18n.switchToClassic)}
      </button>
    </div>
  </div>
  <script>
    const I18N = ${JSON.stringify(i18n)};
    const vscode = acquireVsCodeApi();
    const AUTO_RETRY_SECONDS = 5;
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
      btn.disabled = true;
      btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="animation:spin 1s linear infinite"><style>@keyframes spin{to{transform:rotate(360deg)}}</style><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> ' + I18N.connecting;
      vscode.postMessage({ type: "reconnectCsCloud" });
    }

    function handleSwitchToClassic() {
      stopCountdown();
      const btn = document.getElementById("switch-to-classic-btn");
      btn.disabled = true;
      btn.textContent = I18N.switching;
      vscode.postMessage({ type: "switchToClassicUiMode" });
    }

    window.addEventListener("message", (e) => {
      if (e.data?.type === "reconnectFailed") {
        const btn = document.getElementById("restart-btn");
        btn.disabled = false;
        btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 12"/></svg> ' + I18N.reconnect;
        const detail = document.querySelector(".cs-detail");
        if (detail) {
          detail.textContent = e.data.reason;
        } else {
          const card = document.querySelector(".cs-card");
          const pre = document.createElement("pre");
          pre.className = "cs-detail";
          pre.textContent = e.data.reason;
          card.insertBefore(pre, document.querySelector(".cs-actions"));
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
	commandIDPrefix?: string,
	pluginSha?: string,
	pluginBuildTime?: string,
): string {
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
		`script-src ${webview.cspSource} 'wasm-unsafe-eval' 'nonce-${nonce}' https://us-assets.i.posthog.com`,
		`connect-src ${webview.cspSource} ${csCloudOrigin} https://*.sangfor.com http://localhost:* http://127.0.0.1:* ws://localhost:* ws://127.0.0.1:* https://avatars.githubusercontent.com https://openrouter.ai https://api.requesty.ai https://us.i.posthog.com https://us-assets.i.posthog.com`,
	].join("; ")

	let html = fs.readFileSync(indexPath, "utf8")
	html = rewriteWebpackPublicPath(html, webview, outDir)
	html = rewriteStaticAssetUrls(html, webview, outDir)
	html = addNonceToScriptTags(html, nonce)
	html = injectIntoHead(
		html,
		`<meta http-equiv="Content-Security-Policy" content="${escapeHtml(csp)}" />\n` +
			`<style>${getLoadingStyles()}</style>\n` +
			`<script nonce="${nonce}">
        window.__CS_CLOUD_BASE_URL__ = ${JSON.stringify(csCloudBaseUrl)}; 
        window.__CS_CLOUD_WORKSPACE_DIRECTORY__ = ${JSON.stringify(workspaceDirectory)}; 
        window.__CS_CLOUD_COMMAND_ID_PREFIX__ = ${JSON.stringify(commandIDPrefix || "costrict")}; 
        window.__ASSISTANT_UI_THEME__ = ${JSON.stringify(getAssistantUITheme())}; 
        window.__CS_CLOUD_ACCESS_TOKEN__ = ${JSON.stringify(accessToken || "")};
        window.__CS_CLOUD_WEB_URL__ = ${JSON.stringify(costrictWebUrl)};
        window.__CS_CLOUD_VERSION__ = ${JSON.stringify(pluginVersion || "")};
        window.__CS_CLOUD_SHA__ = ${JSON.stringify(pluginSha || "")};
        window.__CS_CLOUD_BUILD_TIME__ = ${JSON.stringify(pluginBuildTime || "")};

        (function(){
          var diagnosticPrefix = "[CoStrict Cloud UI]";
          window.addEventListener("error", function (event) {
            console.error(
              diagnosticPrefix + " window.error",
              event && event.message,
              event && event.filename,
              event && event.lineno,
              event && event.colno,
              event && event.error && (event.error.stack || event.error.message || event.error)
            );
          });
          window.addEventListener("unhandledrejection", function (event) {
            var reason = event && event.reason;
            console.error(
              diagnosticPrefix + " unhandledrejection",
              reason && (reason.stack || reason.message || reason)
            );
          });
          console.info(diagnosticPrefix + " bootstrap", {
            baseUrl: window.__CS_CLOUD_BASE_URL__,
            workspaceDirectory: window.__CS_CLOUD_WORKSPACE_DIRECTORY__,
            hasAccessToken: !!window.__CS_CLOUD_ACCESS_TOKEN__,
            userAgent: navigator.userAgent
          });
          var dumpCloudUiDomState = function(label) {
            try {
              var body = document.body;
              var appRoot = document.querySelector('[data-slot="sidebar-wrapper"]') || document.querySelector('main') || body;
              var bodyStyle = body ? window.getComputedStyle(body) : null;
              var rootStyle = appRoot ? window.getComputedStyle(appRoot) : null;
              console.info(diagnosticPrefix + " dom " + label, {
                readyState: document.readyState,
                bodyChildren: body ? body.children.length : -1,
                bodyTextLength: body && body.innerText ? body.innerText.length : 0,
                bodyClient: body ? [body.clientWidth, body.clientHeight] : null,
                bodyScroll: body ? [body.scrollWidth, body.scrollHeight] : null,
                bodyDisplay: bodyStyle && bodyStyle.display,
                bodyVisibility: bodyStyle && bodyStyle.visibility,
                bodyOpacity: bodyStyle && bodyStyle.opacity,
                rootTag: appRoot && appRoot.tagName,
                rootClass: appRoot && appRoot.className,
                rootClient: appRoot ? [appRoot.clientWidth, appRoot.clientHeight] : null,
                rootDisplay: rootStyle && rootStyle.display,
                rootVisibility: rootStyle && rootStyle.visibility,
                rootOpacity: rootStyle && rootStyle.opacity,
                activeElement: document.activeElement && document.activeElement.tagName
              });
            } catch (error) {
              console.error(diagnosticPrefix + " dom dump failed", error && (error.stack || error.message || error));
            }
          };
          if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", function(){ dumpCloudUiDomState("dom-content-loaded"); });
          } else {
            dumpCloudUiDomState("bootstrap");
          }
          setTimeout(function(){ dumpCloudUiDomState("after-1s"); }, 1000);
          setTimeout(function(){ dumpCloudUiDomState("after-3s"); }, 3000);
          setTimeout(function(){ dumpCloudUiDomState("after-8s"); }, 8000);
          const v=acquireVsCodeApi();
          window.__VSCODE_API__=v;
          const originalPostMessage = window.parent && window.parent.postMessage ? window.parent.postMessage.bind(window.parent) : null;
          if (originalPostMessage) {
            window.parent.postMessage = function(data, targetOrigin, transfer) {
              if (data && data.type === "FETCH_QUOTA") {
                v.postMessage({ type: "fetchQuota", baseUrl: data.baseUrl, token: data.token });
                return;
              }
              return originalPostMessage(data, targetOrigin, transfer);
            };
          }
          if (window.fetch) {
            const originalFetch = window.fetch.bind(window);
            let proxyFetchSeq = 0;
            const bodyToString = async function(body) {
              if (body == null) return undefined;
              if (typeof body === "string") return body;
              if (body instanceof URLSearchParams) return body.toString();
              if (typeof Blob !== "undefined" && body instanceof Blob) return await body.text();
              if (body instanceof ArrayBuffer) return new TextDecoder().decode(body);
              if (ArrayBuffer.isView(body)) return new TextDecoder().decode(body);
              return undefined;
            };
            window.fetch = async function(input, init) {
              const request = typeof Request !== "undefined" && input instanceof Request ? input : null;
              const url = typeof input === "string"
                ? input
                : input instanceof URL
                  ? input.toString()
                  : request && request.url;
              const resolveCsCloudProxyUrl = function(rawUrl) {
                try {
                  const base = new URL(window.__CS_CLOUD_BASE_URL__);
                  const target = new URL(rawUrl, base);
                  const basePath = base.pathname.replace(/\\/$/, "");
                  const isBaseOrigin = target.origin === base.origin && (
                    target.pathname === base.pathname ||
                    (basePath && target.pathname.indexOf(basePath + "/") === 0)
                  );
                  const isApiV1Path = target.pathname === "/api/v1" || target.pathname.indexOf("/api/v1/") === 0;
                  if (isBaseOrigin) return target.toString();
                  if (isApiV1Path) return new URL(target.pathname + target.search + target.hash, base.origin).toString();
                } catch (error) {}
                return undefined;
              };
              const proxyFetchUrl = typeof url === "string" ? resolveCsCloudProxyUrl(url) : undefined;
              if (typeof url === "string" && (proxyFetchUrl || url.indexOf("/api/v1") >= 0)) {
                console.info(diagnosticPrefix + " fetch", url, proxyFetchUrl && proxyFetchUrl !== url ? { proxyFetchUrl: proxyFetchUrl } : undefined);
              }
              const logFetchFailure = function(error) {
                console.error(diagnosticPrefix + " fetch failed", url, error && (error.stack || error.message || error));
                throw error;
              };
              // Proxy cs-cloud API requests and sangfor.com requests through the
              // extension host to avoid CORS errors in the webview sandbox.
              const isSangforUrl = typeof url === "string" && url.indexOf("sangfor.com") >= 0;
              if (typeof url === "string" && (isSangforUrl || proxyFetchUrl)) {
                const requestId = "proxy-" + Date.now() + "-" + (++proxyFetchSeq);
                const headers = {};
                if (request && request.headers) {
                  request.headers.forEach(function(value, key) { headers[key] = value; });
                }
                if (init && init.headers) {
                  new Headers(init.headers).forEach(function(value, key) { headers[key] = value; });
                }
                const method = (init && init.method) || (request && request.method) || "GET";
                const body = init && init.body != null
                  ? await bodyToString(init.body)
                  : request && method !== "GET" && method !== "HEAD" && !request.bodyUsed
                    ? await request.clone().text()
                    : undefined;
                return new Promise(function(resolve, reject) {
                  const encoder = new TextEncoder();
                  let streamController;
                  let responseSettled = false;
                  const cleanup = function() {
                    window.removeEventListener("message", handler);
                  };
                  const stream = new ReadableStream({
                    start: function(controller) {
                      streamController = controller;
                    },
                    cancel: function() {
                      cleanup();
                      v.postMessage({ type: "proxyFetchAbort", requestId: requestId });
                    }
                  });
                  const handler = function(event) {
                    const data = event.data;
                    if (!data || data.requestId !== requestId) return;
                    if (data.type === "proxyFetchResponse") {
                      responseSettled = true;
                      resolve(new Response(stream, {
                        status: data.status || 200,
                        statusText: data.statusText || "OK",
                        headers: data.headers || {}
                      }));
                      return;
                    }
                    if (data.type === "proxyFetchChunk") {
                      streamController.enqueue(encoder.encode(data.chunk || ""));
                      return;
                    }
                    if (data.type === "proxyFetchDone") {
                      cleanup();
                      streamController.close();
                      return;
                    }
                    if (data.type === "proxyFetchError") {
                      const error = new Error(data.error || data.statusText || "proxy fetch failed");
                      cleanup();
                      if (responseSettled) {
                        streamController.error(error);
                      } else {
                        reject(error);
                      }
                      return;
                    }
                    if (data.type === "proxyFetchResult") {
                      cleanup();
                      resolve(new Response(data.body || "", {
                        status: data.status || 200,
                        statusText: data.statusText || "OK",
                        headers: data.headers || {}
                      }));
                    }
                  };
                  window.addEventListener("message", handler);
                  v.postMessage({
                    type: "proxyFetch",
                    requestId: requestId,
                    input: proxyFetchUrl || url,
                    init: {
                      method: method,
                      headers: headers,
                      body: body
                    }
                  });
                });
              }
              return originalFetch(input, init).catch(logFetchFailure);
            };
          }
          window.addEventListener("message",function(e){
            if (e.data?.type === "ASSISTANT_UI_READY") {
              v.postMessage({ type: "ASSISTANT_UI_READY" });
              return;
            }
            if(e.data?.type==="FETCH_QUOTA"){
              v.postMessage({type:"fetchQuota",baseUrl:e.data.baseUrl,token:e.data.token});
              return;
            }
            if (e.data?.type === "openExternal" && e.data.url) {
              v.postMessage({ type: "openExternal", url: e.data.url });
              return;
            }
            if (e.data?.type === "openFile" && e.data.path) {
              v.postMessage({ type: "openFile", path: e.data.path });
              return;
            }
            if (e.data?.type === "openDiff" && e.data.path && e.data.patch) {
              v.postMessage({ type: "openDiff", path: e.data.path, patch: e.data.patch });
              return;
            }
            if (e.data?.type === "restartCsCloudServer") {
              v.postMessage({ type: "restartCsCloudServer" });
              return;
            }
            if (e.data?.type === "executeCommand" && e.data.command) {
              v.postMessage({ type: "executeCommand", command: e.data.command });
              return;
            }
            if (e.data?.type === "requestGitBranches") {
              v.postMessage({ type: "requestGitBranches", directory: e.data.directory });
              return;
            }
            if (e.data?.type === "switchGitBranch" && e.data.branch) {
              v.postMessage({ type: "switchGitBranch", branch: e.data.branch, directory: e.data.directory });
              return;
            }
            if (e.data?.type === "requestWorkspaceFolders") {
              v.postMessage({ type: "requestWorkspaceFolders" });
              return;
            }
            if (e.data?.type === "switchWorkspaceFolder" && e.data.path) {
              v.postMessage({ type: "switchWorkspaceFolder", path: e.data.path });
              return;
            }
          });
        })();
    </script>`,
	)

	// Keep the exported Next.js body unchanged before hydration. Injecting extra
	// body nodes here can trigger React hydration error #418 in JCEF.

	// Hide loading when stylesheets are ready (5s timeout)
	const hideLoadingScript = `<script nonce="${nonce}">
(function(){
  window.__ASSISTANT_UI_HIDE_LOADING__ = function () {
    var loading = document.getElementById("cloud-ui-loading");
    if (!loading) return;
    loading.setAttribute("data-hidden", "true");
    setTimeout(function () { loading.remove(); }, 180);
  };
  function waitForStyles() {
    var links = document.querySelectorAll('link[rel="stylesheet"]');
    var pending = links.length;
    if (pending === 0) {
      window.__ASSISTANT_UI_HIDE_LOADING__();
      return;
    }
    function onDone() {
      pending--;
      if (pending <= 0) window.__ASSISTANT_UI_HIDE_LOADING__();
    }
    links.forEach(function(link){
      if (link.sheet) { onDone(); }
      else {
        link.addEventListener("load", onDone);
        link.addEventListener("error", onDone);
      }
    });
    setTimeout(window.__ASSISTANT_UI_HIDE_LOADING__, 5000);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", waitForStyles);
  } else {
    waitForStyles();
  }
})();
</script>`

	// Inject form state persistence
	const stateScript = `<script nonce="${nonce}">${getFormStatePersistenceScript()}</script>`
	html = injectBeforeBodyClose(html, hideLoadingScript + stateScript)
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
	commandIDPrefix?: string,
	pluginSha?: string,
	pluginBuildTime?: string,
): string {
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
	const frameSrc = ["http://127.0.0.1:*", "http://localhost:*"]
	const frameOrigin = new URL(frameUrl).origin
	if (frameOrigin !== "null" && !frameSrc.includes(frameOrigin)) {
		frameSrc.push(frameOrigin)
	}
	const csp = [
		"default-src 'none'",
		`font-src ${webview.cspSource} data:`,
		`style-src ${webview.cspSource} 'unsafe-inline' http://127.0.0.1:* http://localhost:* http://0.0.0.0:*`,
		`img-src ${webview.cspSource} https://storage.googleapis.com https://img.clerk.com https://*.githubusercontent.com https: data: blob:`,
		`media-src ${webview.cspSource}`,
		`script-src 'unsafe-eval' ${webview.cspSource} https://* https://*.posthog.com http://127.0.0.1:* http://localhost:* http://0.0.0.0:* 'nonce-${nonce}'`,
		`frame-src ${frameSrc.join(" ")}`,
		`connect-src ${webview.cspSource} https://* https://*.posthog.com https://*.sangfor.com ws://127.0.0.1:* ws://0.0.0.0:* ws://localhost:*  http://127.0.0.1:* http://localhost:* `,
	].join("; ")

	const diagnosticsStyle = debug ? "" : "display: none;"
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
  <div id="cloud-ui-diagnostics">${escapeHtml(t("common:csCloud.diagnostics"))}</div>
  ${getLoadingMarkup(getAssistantUILogoSvg(context), t("common:csCloud.loading.loadingCloud"))}
  <script nonce="${nonce}">
    window.__CS_CLOUD_BASE_URL__ = ${JSON.stringify(csCloudBaseUrl)};
    window.__CS_CLOUD_WEB_URL__ = ${JSON.stringify(costrictWebUrl)};
    window.__CS_CLOUD_WORKSPACE_DIRECTORY__ = ${JSON.stringify(workspaceDirectory)};
    window.__CS_CLOUD_COMMAND_ID_PREFIX__ = ${JSON.stringify(commandIDPrefix || "costrict")};
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
    window.__VSCODE_API__ = vscodeApi;
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

      // Forward iframe messages to VS Code
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
        if (event.data?.type === "openDiff" && event.data.path && event.data.patch) {
          vscodeApi.postMessage({ type: "openDiff", path: event.data.path, patch: event.data.patch });
          return;
        }
        if (event.data?.type === "restartCsCloudServer") {
          vscodeApi.postMessage({ type: "restartCsCloudServer" });
          return;
        }
        if (event.data?.type === "executeCommand" && event.data.command) {
          vscodeApi.postMessage({ type: "executeCommand", command: event.data.command });
          return;
        }
        if (event.data?.type === "requestGitBranches") {
          vscodeApi.postMessage({ type: "requestGitBranches", directory: event.data.directory });
          return;
        }
        if (event.data?.type === "switchGitBranch" && event.data.branch) {
          vscodeApi.postMessage({ type: "switchGitBranch", branch: event.data.branch, directory: event.data.directory });
          return;
        }
        if (event.data?.type === "requestWorkspaceFolders") {
          vscodeApi.postMessage({ type: "requestWorkspaceFolders" });
          return;
        }
        if (event.data?.type === "switchWorkspaceFolder" && event.data.path) {
          vscodeApi.postMessage({ type: "switchWorkspaceFolder", path: event.data.path });
          return;
        }
        return;
      }

      // Forward VS Code messages to iframe
      if (event.data?.type === "assistantUIContext") {
        if (cloudFrameReady && frame?.contentWindow) {
          frame.contentWindow.postMessage(event.data, frameOrigin);
        } else {
          pendingFrameMessages.push(event.data);
        }
        return;
      }
      if (event.data?.type === "quotaResult") {
        if (frame?.contentWindow) {
          frame.contentWindow.postMessage(event.data, frameOrigin);
        }
      }
      if (event.data?.type === "restartCsCloudServerFailed") {
        if (frame?.contentWindow) {
          frame.contentWindow.postMessage(event.data, frameOrigin);
        }
      }
      if (event.data?.type === "theme") {
        if (frame?.contentWindow) {
          frame.contentWindow.postMessage(event.data, frameOrigin);
        }
      }
      if (event.data?.type === "GIT_BRANCHES") {
        if (frame?.contentWindow) {
          frame.contentWindow.postMessage(event.data, frameOrigin);
        }
      }
      if (event.data?.type === "WORKSPACE_FOLDERS") {
        if (frame?.contentWindow) {
          frame.contentWindow.postMessage(event.data, frameOrigin);
        }
      }
    });
  </script>
  <iframe id="cloud-frame" src="${escapeHtml(frameUrl)}" title="CoStrict Assistant UI"></iframe>
  <script nonce="${nonce}">${getFormStatePersistenceScript()}</script>
</body>
</html>`
}
