import * as vscode from "vscode"

import { ClineProvider } from "../core/webview/ClineProvider"

// const handleAuthWithoutVisibleProvider = async (provider: ClineProvider | undefined, params: URLSearchParams) => {
// 	if (!provider) {
// 		return
// 	}

// 	const code = params.get("code")
// 	const state = params.get("state")
// 	const token = params.get("token")

// 	if ((code && state) || token) {
// 		await provider?.handleZgsmAuthCallback(code, state, token, false)
// 	}
// }

export const handleUri = async (uri: vscode.Uri) => {
	const path = uri.path
	const query = new URLSearchParams(uri.query.replace(/\+/g, "%2B"))
	const visibleProvider = ClineProvider.getVisibleInstance()

	// not open webview to re-login
	if (!visibleProvider) {
		// if (path === "/callback") {
		// 	const cacheProvider = ClineProvider.getCacheInstances()
		// 	handleAuthWithoutVisibleProvider(cacheProvider, query)
		// }
		return
	}

	switch (path) {
		case "/glama": {
			const code = query.get("code")
			if (code) {
				await visibleProvider.handleGlamaCallback(code)
			}
			break
		}
		case "/openrouter": {
			const code = query.get("code")
			if (code) {
				await visibleProvider.handleOpenRouterCallback(code)
			}
			break
		}
		case "/requesty": {
			const code = query.get("code")
			if (code) {
				await visibleProvider.handleRequestyCallback(code)
			}
			break
		}
		// case "/callback": {
		// 	const code = query.get("code")
		// 	const state = query.get("state")
		// 	const token = query.get("token")
		// 	if ((code && state) || token) {
		// 		await visibleProvider.handleZgsmAuthCallback(code, state, token)
		// 	}
		// 	break
		// }
		default:
			break
	}
}
