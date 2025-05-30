import * as vscode from "vscode"
import { ClineProvider } from "../core/webview/ClineProvider"
import { LoginStatus } from "./types"
import { generateZgsmStateId } from "../shared/zgsmAuthUrl"
import { Package } from "../schemas"
import delay from "delay"

export class ZgsmLoginManager {
	private static instance: ZgsmLoginManager
	public static provider: ClineProvider
	public static stateId: string

	private pollingInterval: NodeJS.Timeout | null = null
	private baseUrl: string = ""
	private loginUrl: string = ""
	private tokenUrl: string = ""
	private statusUrl: string = ""
	private logoutUrl: string = ""
	private isPollingToken = false
	private isPollingStatus = false
	private abortControllers: AbortController[] = []
	public static setProvider(provider: ClineProvider) {
		ZgsmLoginManager.provider = provider
	}

	public static setStateId(id: string) {
		ZgsmLoginManager.stateId = id
	}

	public static getInstance(): ZgsmLoginManager {
		if (!ZgsmLoginManager.instance) {
			ZgsmLoginManager.instance = new ZgsmLoginManager()
		}
		return ZgsmLoginManager.instance
	}

	private initUrls() {
		if (!ZgsmLoginManager.provider) {
			throw new Error("Provider not initialized")
		}

		this.baseUrl =
			ZgsmLoginManager.provider.getValue("zgsmBaseUrl") ||
			ZgsmLoginManager.provider.getValue("zgsmDefaultBaseUrl") ||
			"https://zgsm.sangfor.com"

		this.loginUrl = `${this.baseUrl}/oidc_auth/plugin/login`
		this.tokenUrl = `${this.baseUrl}/oidc_auth/plugin/login/token`
		this.statusUrl = `${this.baseUrl}/oidc_auth/plugin/login/status`
		this.logoutUrl = `${this.baseUrl}/oidc_auth/plugin/logout`
	}

	private validateUrls() {
		if (!this.loginUrl || !this.tokenUrl || !this.statusUrl || !this.logoutUrl) {
			throw new Error("URLs are not initialized. Call initUrls() first")
		}
	}

	public async startLogin() {
		this.abortControllers.forEach((controller) => controller.abort())
		this.abortControllers = []
		this.stopRefreshToken()
		this.initUrls()

		const state = generateZgsmStateId()
		await this.openLoginPage(state)

		try {
			const { access_token, refresh_token } = await this.pollForToken(state)
			await this.pollForLoginStatus(state, access_token)
			await this.saveTokens(state, access_token, refresh_token)
			this.startRefreshToken()
		} catch (error) {
			console.error("Login failed:", error)
			throw error
		}
	}

	private async openLoginPage(state: string) {
		this.validateUrls()
		await vscode.env.openExternal(
			vscode.Uri.parse(
				this.loginUrl +
					"?" +
					this.getParams(state)
						.map((p) => p.join("="))
						.join("&"),
			),
		)
	}

	private async pollForToken(state: string): Promise<{ access_token: string; refresh_token: string }> {
		return new Promise(async (resolve, reject) => {
			this.isPollingToken = true
			const maxAttempts = 25
			const interval = 2000
			let attempts = 0

			const poll = async () => {
				if (!this.isPollingToken || attempts >= maxAttempts) {
					this.isPollingToken = false
					reject(new Error("Token polling timeout"))
					return
				}

				attempts++
				try {
					const tokens = await this.fetchToken(state)
					if (tokens?.access_token && tokens?.refresh_token) {
						this.isPollingToken = false
						resolve(tokens)
						return
					}
				} catch (error) {
					console.log("Token polling attempt failed:", error)
				}

				setTimeout(poll, interval)
			}

			await poll()
		})
	}

	private async pollForLoginStatus(state?: string, access_token?: string) {
		this.isPollingStatus = true
		try {
			await Promise.race([
				this.checkLoginStatus(state, access_token),
				new Promise((_, reject) =>
					setTimeout(
						() => {
							this.isPollingStatus = false
							reject(new Error("Status check timeout"))
						},
						1000 * 60 * 5,
					),
				),
			])
		} finally {
			this.isPollingStatus = false
		}
	}

	private async saveTokens(state: string, access_token: string, refresh_token: string) {
		const config = await ZgsmLoginManager.provider.getState()
		await ZgsmLoginManager.provider.upsertProviderProfile(config.currentApiConfigName, {
			...config.apiConfiguration,
			zgsmApiKey: access_token,
			zgsmRefreshToken: refresh_token,
			zgsmStateId: state,
		})
		await ZgsmLoginManager.provider.postMessageToWebview({
			type: "afterZgsmPostLogin",
			values: { apiKey: access_token },
		})
	}

	public async fetchToken(
		state?: string,
		refresh_token?: string,
	): Promise<{ access_token: string; refresh_token: string }> {
		this.initUrls()
		this.validateUrls()
		state = state || generateZgsmStateId()

		const params = this.getParams(state, [refresh_token ? "machine_code" : ""])
		const abortController = new AbortController()
		this.abortControllers.push(abortController)

		try {
			const url = `${this.tokenUrl}?${params.map((p) => p.join("=")).join("&")}`
			const res = await fetch(url, {
				signal: abortController.signal,
				headers: refresh_token ? { Authorization: `Bearer ${refresh_token}` } : {},
			})

			if (!res.ok) {
				throw new Error(`Token fetch failed with status ${res.status}`)
			}

			const data = await res.json()

			if (!data.access_token || !data.refresh_token) {
				throw new Error("Invalid token response")
			}

			return {
				access_token: data.access_token,
				refresh_token: data.refresh_token,
			}
		} catch (error) {
			console.error("Failed to fetch token:", error)
			throw error
		} finally {
			this.abortControllers = this.abortControllers.filter((c) => c !== abortController)
		}
	}

	private async checkLoginStatus(state?: string, access_token?: string): Promise<void> {
		this.initUrls()
		this.validateUrls()
		const controller = new AbortController()
		this.abortControllers.push(controller)
		const { signal } = controller

		try {
			const { apiConfiguration } = await ZgsmLoginManager.provider.getState()
			const stateid = state || apiConfiguration.zgsmStateId
			if (!stateid) {
				throw new Error("No state available")
			}
			const params = this.getParams(stateid, [access_token ? "machine_code" : ""])

			while (this.isPollingStatus) {
				const res = await fetch(`${this.statusUrl}?${params.map((p) => p.join("=")).join("&")}`, {
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${access_token}`,
					},
					signal,
				})

				if (!res.ok) {
					throw new Error(`Status check failed with status ${res.status}`)
				}

				const data = await res.json()
				if (data.state === state && data.status === LoginStatus.LOGGED_IN) {
					return
				}

				await delay(3000)
			}
		} catch (error) {
			if (error.name !== "AbortError") {
				console.error("Status check error:", error)
				throw error
			}
		} finally {
			this.abortControllers = this.abortControllers.filter((c) => c !== controller)
		}
	}

	public async startRefreshToken() {
		try {
			this.initUrls()
			const { apiConfiguration, currentApiConfigName } = await ZgsmLoginManager.provider.getState()

			if (!apiConfiguration.zgsmRefreshToken) {
				throw new Error("No refresh token available")
			}

			const { access_token, refresh_token } = await this.fetchToken(
				apiConfiguration.zgsmStateId,
				apiConfiguration.zgsmRefreshToken,
			)

			await ZgsmLoginManager.provider.upsertProviderProfile(currentApiConfigName, {
				...apiConfiguration,
				zgsmApiKey: access_token,
				zgsmRefreshToken: refresh_token,
			})
			ZgsmLoginManager.provider.setValue("zgsmApiKey", access_token)
			ZgsmLoginManager.provider.setValue("zgsmRefreshToken", refresh_token)

			this.pollingInterval = setTimeout(() => this.startRefreshToken(), 1000 * 60 * 60)
		} catch (error) {
			console.error("Failed to refresh token:", error)
			this.pollingInterval = setTimeout(() => this.startRefreshToken(), 5000)
		}
	}

	public async stopRefreshToken() {
		clearTimeout(this.pollingInterval as NodeJS.Timeout)
	}

	public async logout() {
		try {
			this.initUrls()
			this.validateUrls()
			const { apiConfiguration, currentApiConfigName } = await ZgsmLoginManager.provider.getState()
			const state = apiConfiguration.zgsmStateId
			if (!state) {
				throw new Error("No state available")
			}
			const params = this.getParams(state)

			await fetch(`${this.logoutUrl}?${params.map((p) => p.join("=")).join("&")}`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
			})

			await ZgsmLoginManager.provider.upsertProviderProfile(currentApiConfigName, {
				...apiConfiguration,
				zgsmApiKey: "",
				zgsmRefreshToken: "",
				zgsmStateId: "",
			})
		} catch (error) {
			console.error("Logout failed:", error)
			throw error
		}
	}

	public getParams(state: string, ignore: string[] = []) {
		return [
			["machine_code", vscode.env.machineId],
			["state", state],
			["plugin_version", Package.version],
			["vscode_version", vscode.version],
			["uri_scheme", vscode.env.uriScheme],
		].filter(([key]) => !ignore.includes(key))
	}
}
