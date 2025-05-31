import * as vscode from "vscode"
import { ClineProvider } from "../core/webview/ClineProvider"
import { LoginState, LoginStatus } from "./types"
import { generateZgsmStateId } from "../shared/zgsmAuthUrl"
import { Package } from "../schemas"

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
	private isPollingTokenTimer?: NodeJS.Timeout
	private isPollingStatus = false
	private isPollingStatusTimer?: NodeJS.Timeout
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
		clearTimeout(this.isPollingStatusTimer)
		clearTimeout(this.isPollingTokenTimer)

		this.stopRefreshToken()
		this.initUrls()

		const state = generateZgsmStateId()
		ZgsmLoginManager.provider.log(`[ZgsmLoginManager:${state}] startLogin.stopRefreshToken`)
		ZgsmLoginManager.provider.log(`[ZgsmLoginManager:${state}] generateZgsmStateId: ${state}`)

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
		const pageUrl =
			this.loginUrl +
			"?" +
			this.getParams(state)
				.map((p) => p.join("="))
				.join("&")
		ZgsmLoginManager.provider.log(`[ZgsmLoginManager:${state}] openLoginPage: ${pageUrl}`)

		await vscode.env.openExternal(vscode.Uri.parse(pageUrl))
	}

	private async pollForToken(state: string): Promise<{ access_token: string; refresh_token: string }> {
		return new Promise(async (resolve, reject) => {
			this.isPollingToken = true
			const maxAttempts = 20 * 5
			const interval = 3000
			let attempts = 0
			ZgsmLoginManager.provider.log(`[ZgsmLoginManager:${state}] pollForToken attempts: ${attempts}`)

			const poll = async () => {
				if (!this.isPollingToken || attempts >= maxAttempts) {
					this.isPollingToken = false
					reject(new Error("Token polling timeout"))
					ZgsmLoginManager.provider.log(`[ZgsmLoginManager:${state}] pollForToken timeout`)

					return
				}

				attempts++
				try {
					const tokens = await this.fetchToken(state)
					ZgsmLoginManager.provider.log(
						`[ZgsmLoginManager:${state}] fetchToken response: ${JSON.stringify(tokens, null, 2)}`,
					)

					if (tokens?.access_token && tokens?.refresh_token) {
						// if (tokens?.access_token && tokens?.refresh_token && tokens?.state === state) {
						this.isPollingToken = false
						resolve(tokens)
						return
					}
				} catch (error) {
					ZgsmLoginManager.provider.log(
						`[ZgsmLoginManager:${state}] Token polling attempt failed: ${error.message}`,
					)
				}

				this.isPollingTokenTimer = setTimeout(poll, interval)
			}

			await poll()
		})
	}

	private async pollForLoginStatus(state?: string, access_token?: string): Promise<LoginState> {
		return new Promise(async (resolve, reject) => {
			this.isPollingStatus = true
			const maxAttempts = 20 * 5
			const interval = 3000
			let attempts = 0
			ZgsmLoginManager.provider.log(`[ZgsmLoginManager:${state}] pollForLoginStatus attempts: ${attempts}`)

			const poll = async () => {
				if (!this.isPollingStatus || attempts >= maxAttempts) {
					this.isPollingStatus = false
					reject(new Error("Token polling timeout"))
					ZgsmLoginManager.provider.log(`[ZgsmLoginManager:${state}] pollForLoginStatus timeout`)

					return
				}

				attempts++
				try {
					const data = await this.checkLoginStatus(state, access_token)

					if (data?.status === LoginStatus.LOGGED_IN) {
						// if (tokens?.access_token && tokens?.refresh_token && tokens?.state === state) {
						this.isPollingStatus = false
						resolve(data)
						return
					}
				} catch (error) {
					ZgsmLoginManager.provider.log(
						`[ZgsmLoginManager:${state}] Token polling attempt failed: ${error.message}`,
					)
				}

				this.isPollingStatusTimer = setTimeout(poll, interval)
			}

			await poll()
		})
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
	): Promise<{ access_token: string; refresh_token: string; state: string }> {
		this.initUrls()
		this.validateUrls()
		state = state || generateZgsmStateId()

		const params = this.getParams(state, [refresh_token ? "machine_code" : ""])

		try {
			const url = `${this.tokenUrl}?${params.map((p) => p.join("=")).join("&")}`
			ZgsmLoginManager.provider.log(`[ZgsmLoginManager:${state}] fetchToken url:  ${url}`)
			ZgsmLoginManager.provider.log(
				`[ZgsmLoginManager:${state}] fetchToken headers:  ${JSON.stringify(refresh_token ? { Authorization: `Bearer ${refresh_token}` } : {}, null, 2)}`,
			)
			const res = await fetch(url, {
				headers: refresh_token ? { Authorization: `Bearer ${refresh_token}` } : {},
			})

			if (!res.ok) {
				ZgsmLoginManager.provider.log(`[ZgsmLoginManager:${state}] fetchToken error:  ${await res.text()}`)

				throw new Error(`Token fetch failed with status ${res.status}`)
			}

			const data = await res.json()

			if (!data.access_token || !data.refresh_token) {
				throw new Error("Invalid token response")
			}

			return data
		} catch (error) {
			console.error("Failed to fetch token:", error)
			ZgsmLoginManager.provider.log(`[ZgsmLoginManager:${state}] Failed to fetch token: ${error.message}`)
			throw error
		}
	}

	private async checkLoginStatus(state?: string, access_token?: string) {
		this.initUrls()
		this.validateUrls()

		try {
			const { apiConfiguration } = await ZgsmLoginManager.provider.getState()
			const stateid = state || apiConfiguration.zgsmStateId
			if (!stateid) {
				throw new Error("No state available")
			}
			const params = this.getParams(stateid, [access_token ? "machine_code" : ""])

			const url = `${this.statusUrl}?${params.map((p) => p.join("=")).join("&")}`
			ZgsmLoginManager.provider.log(`[ZgsmLoginManager:${state}] checkLoginStatus url:  ${url}`)
			ZgsmLoginManager.provider.log(
				`[ZgsmLoginManager:${state}] checkLoginStatus headers:  ${JSON.stringify(access_token ? { Authorization: `Bearer ${access_token}` } : {}, null, 2)}`,
			)
			const res = await fetch(url, {
				headers: {
					Authorization: `Bearer ${access_token}`,
				},
			})

			if (!res.ok) {
				ZgsmLoginManager.provider.log(`[ZgsmLoginManager:${state}] checkLoginStatus error: ${await res.text()}`)

				throw new Error(`Status check failed with status ${res.status}`)
			}

			const data = await res.json()
			ZgsmLoginManager.provider.log(
				`[ZgsmLoginManager:${state}] checkLoginStatus response: ${JSON.stringify(data, null, 2)}`,
			)

			return data as LoginState
		} catch (error) {
			console.error("Status check error:", error)
			ZgsmLoginManager.provider.log(`[ZgsmLoginManager:${state}] Status check error: ${error.message}`)
			throw error
		}
	}

	public async startRefreshToken() {
		let state
		try {
			this.initUrls()
			const { apiConfiguration, currentApiConfigName } = await ZgsmLoginManager.provider.getState()
			state = apiConfiguration.zgsmStateId
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
			ZgsmLoginManager.provider.log(`[ZgsmLoginManager:${state}] Failed to refresh token: ${error.message}`)

			this.pollingInterval = setTimeout(() => this.startRefreshToken(), 5000)
		}
	}

	public async stopRefreshToken() {
		clearTimeout(this.pollingInterval as NodeJS.Timeout)
	}

	public async logout() {
		let state
		try {
			this.initUrls()
			this.validateUrls()
			const { apiConfiguration, currentApiConfigName } = await ZgsmLoginManager.provider.getState()
			state = apiConfiguration.zgsmStateId
			if (!state) {
				throw new Error("No state available")
			}
			const params = this.getParams(state, ["machine_code"])
			const url = `${this.logoutUrl}?${params.map((p) => p.join("=")).join("&")}`
			await fetch(url, {
				headers: {
					Authorization: `Bearer ${apiConfiguration.zgsmApiKey}`,
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
			ZgsmLoginManager.provider.log(`[ZgsmLoginManager:${state}] Logout failed: ${error.message}`)
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
