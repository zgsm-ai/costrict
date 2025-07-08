import * as vscode from "vscode"
import { ClineProvider } from "../core/webview/ClineProvider"
import { LoginState, LoginStatus, LoginStatusResponse, LoginTokenResponse, LoginTokens } from "./types"
import { generateZgsmStateId } from "../shared/zgsmAuthUrl"
import { Package } from "../schemas"
import { parseJwt } from "../utils/jwt"
import { statusBarloginCallback } from "../../zgsm/src/common/services"
import { t } from "../i18n"
import { zgsmProviderKey } from "../shared/api"
import { initZgsmCodeBase } from "../core/codebase"
import { CompletionStatusBar } from "../../zgsm/src/codeCompletion/completionStatusBar"
import { sendTokens } from "./ipc/client"
import { getClientId } from "../utils/getClientId"

const TOKEN_REFRESH_BUFFER = 1800
const MAX_INTERVAL = 2147483647
const EMERGENCY_INTERVAL = 5000

export class ZgsmLoginManager {
	private static instance: ZgsmLoginManager
	public static provider: ClineProvider
	public static stateId: string

	private pollingInterval?: NodeJS.Timeout
	private baseUrl: string = ""
	private loginUrl: string = ""
	private tokenUrl: string = ""
	private statusUrl: string = ""
	private logoutUrl: string = ""
	private isPollingToken = false
	private isPollingTokenTimer?: NodeJS.Timeout
	private isPollingStatus = false
	private isPollingStatusTimer?: NodeJS.Timeout
	hasLoginTip: boolean = false
	logining: boolean = false
	fetchTokenAttempt: number = 0
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

		this.baseUrl = (
			ZgsmLoginManager.provider.getValue("zgsmBaseUrl") ||
			ZgsmLoginManager.provider.getValue("zgsmDefaultBaseUrl") ||
			"https://zgsm.sangfor.com"
		).trim()

		this.loginUrl = `${this.baseUrl}/oidc-auth/api/v1/plugin/login`
		this.tokenUrl = `${this.baseUrl}/oidc-auth/api/v1/plugin/login/token`
		this.statusUrl = `${this.baseUrl}/oidc-auth/api/v1/plugin/login/status`
		this.logoutUrl = `${this.baseUrl}/oidc-auth/api/v1/plugin/logout`
	}

	private validateUrls() {
		if (!this.loginUrl || !this.tokenUrl || !this.statusUrl || !this.logoutUrl) {
			throw new Error("URLs are not initialized. Call initUrls() first")
		}
	}

	public async startLogin() {
		this.logining = true
		clearTimeout(this.isPollingStatusTimer)
		clearTimeout(this.isPollingTokenTimer)

		this.stopRefreshToken()
		this.initUrls()

		const state = generateZgsmStateId()
		ZgsmLoginManager.provider.log(`[ZgsmLoginManager:${state}] startLogin.stopRefreshToken`)
		ZgsmLoginManager.provider.log(`[ZgsmLoginManager:${state}] generateZgsmStateId: ${state}`)

		await this.openLoginPage(state)

		try {
			CompletionStatusBar.login()
			const { access_token, refresh_token } = await this.pollForToken(state)
			await this.pollForLoginStatus(state, access_token)
			await this.saveTokens(state, access_token, refresh_token)
			this.startRefreshToken(access_token)
			vscode.window.showInformationMessage("login successful")

			CompletionStatusBar.complete()
			CompletionStatusBar.resetCommand()
		} catch (error) {
			ZgsmLoginManager.provider.log(`${error.message}`)
			CompletionStatusBar.fail(error)
			CompletionStatusBar.resetCommand()
			throw error
		} finally {
			this.logining = false
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

	private async pollForToken(state: string): Promise<LoginTokens> {
		return new Promise(async (resolve, reject) => {
			this.isPollingToken = true
			const maxAttempts = 20 * 5
			const interval = 3000
			let attempts = 0
			ZgsmLoginManager.provider.log(`[ZgsmLoginManager:${state}] pollForToken attempts: ${attempts}`)

			const poll = async () => {
				if (!this.isPollingToken || attempts >= maxAttempts) {
					this.isPollingToken = false
					reject(new Error("[pollForToken] Token polling timeout"))
					ZgsmLoginManager.provider.log(`[ZgsmLoginManager:${state}] pollForToken timeout`)

					return
				}

				attempts++
				try {
					const tokens = await this.fetchToken(state)
					ZgsmLoginManager.provider.log(
						`[ZgsmLoginManager:${state}] fetchToken response: ${JSON.stringify(tokens, null, 2)}`,
					)

					if (tokens?.access_token && tokens?.refresh_token && tokens?.state === state) {
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
					reject(new Error("[pollForLoginStatus] Token polling timeout"))
					ZgsmLoginManager.provider.log(`[ZgsmLoginManager:${state}] pollForLoginStatus timeout`)

					return
				}

				attempts++
				try {
					const data = await this.checkLoginStatus(state, access_token)

					if (data?.status === LoginStatus.LOGGED_IN && data?.state === state) {
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

	public async saveTokens(state: string, access_token: string, refresh_token: string, silent = false) {
		const config = await ZgsmLoginManager.provider.getState()
		if (!access_token || !refresh_token) {
			throw new Error("Access token or refresh token is missing")
		}

		if (
			access_token === config.apiConfiguration.zgsmApiKey ||
			refresh_token === config.apiConfiguration.zgsmRefreshToken
		) {
			ZgsmLoginManager.provider.log(`[ZgsmLoginManager:${state}] saveTokens: tokens are already saved`)
			return
		}

		const zgsmApiKeyUpdatedAt = new Date().toLocaleString()
		const zgsmApiKeyExpiredAt = new Date(parseJwt(access_token).exp * 1000).toLocaleString()
		const newConfiguration = {
			...config.apiConfiguration,
			zgsmModelId: config.apiConfiguration.zgsmModelId || config.apiConfiguration.zgsmDefaultModelId,
			zgsmApiKey: access_token,
			zgsmRefreshToken: refresh_token,
			isZgsmApiKeyValid: true,
			zgsmStateId: state,
			zgsmApiKeyUpdatedAt,
			zgsmApiKeyExpiredAt,
		}

		await ZgsmLoginManager.provider.providerSettingsManager.saveMergeConfig(
			{
				zgsmBaseUrl: newConfiguration.zgsmBaseUrl,
				zgsmApiKey: newConfiguration.zgsmApiKey,
				zgsmRefreshToken: refresh_token,
				isZgsmApiKeyValid: newConfiguration.isZgsmApiKeyValid,
				zgsmStateId: newConfiguration.zgsmStateId,
				zgsmApiKeyUpdatedAt: newConfiguration.zgsmApiKeyUpdatedAt,
				zgsmApiKeyExpiredAt: newConfiguration.zgsmApiKeyExpiredAt,
			},
			(name, { apiProvider }) => {
				return apiProvider === zgsmProviderKey && name !== config.currentApiConfigName
			},
		)

		await ZgsmLoginManager.provider.upsertProviderProfile(config.currentApiConfigName, newConfiguration)

		!silent &&
			(await ZgsmLoginManager.provider.postMessageToWebview({
				type: "afterZgsmPostLogin",
				values: { zgsmApiKey: access_token, zgsmApiKeyUpdatedAt },
			}))

		await ZgsmLoginManager.provider.setValue("zgsmApiKey", access_token)
		await ZgsmLoginManager.provider.setValue("zgsmRefreshToken", refresh_token)

		sendTokens({
			access_token,
			refresh_token,
			state,
		})

		ZgsmLoginManager.provider.log(
			`[ZgsmLoginManager:${state}] saveTokens: ${JSON.stringify({ access_token, refresh_token }, null, 2)}}`,
		)

		initZgsmCodeBase(
			`${config.apiConfiguration.zgsmBaseUrl || config.apiConfiguration.zgsmDefaultBaseUrl}`,
			access_token,
		)
	}

	public async fetchToken(state?: string, refresh_token?: string): Promise<LoginTokens> {
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

			if (res.status === 401 && !this.hasLoginTip && !this.logining) {
				this.openStatusBarloginDialog()
			}

			if (!res.ok) {
				ZgsmLoginManager.provider.log(`[ZgsmLoginManager:${state}] fetchToken error:  ${await res.text()}`)

				throw new Error(`Token fetch failed with status ${res.status}`)
			}

			const { success, data, message } = (await res.json()) as LoginTokenResponse

			if (!success) {
				ZgsmLoginManager.provider.log(`[ZgsmLoginManager:${state}] fetchToken error:  ${message}`)

				throw new Error(message)
			}

			if (!data.access_token || !data.refresh_token) {
				throw new Error(`Invalid token response: ${JSON.stringify(data)}`)
			}

			return data
		} catch (error) {
			ZgsmLoginManager.provider.log(`[ZgsmLoginManager:${state}] Failed to fetch token: ${error.message}`)
			throw error
		}
	}

	openStatusBarloginDialog() {
		this.hasLoginTip = true

		statusBarloginCallback(undefined, undefined, {
			errorTitle: t("common:window.error.login_expired"),
			cb: () => {
				this.hasLoginTip = false
			},
		})
	}

	private async checkLoginStatus(state?: string, access_token?: string): Promise<LoginState> {
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

			const { success, data, message } = (await res.json()) as LoginStatusResponse

			if (!success) {
				ZgsmLoginManager.provider.log(`[ZgsmLoginManager:${state}] checkLoginStatus error: ${message}`)

				throw new Error(message)
			}

			ZgsmLoginManager.provider.log(
				`[ZgsmLoginManager:${state}] checkLoginStatus response: ${JSON.stringify(data, null, 2)}`,
			)

			return data as LoginState
		} catch (error) {
			ZgsmLoginManager.provider.log(`[ZgsmLoginManager:${state}] Status check error: ${error.message}`)
			throw error
		}
	}

	public async startRefreshToken(access_token: string, immediate = false) {
		const refresh = async (oldToken: string) => {
			this.initUrls()
			const zgsmRefreshToken = ZgsmLoginManager.provider.getValue("zgsmRefreshToken")
			const zgsmStateId = ZgsmLoginManager.provider.getValue("zgsmStateId")

			try {
				if (!zgsmRefreshToken) {
					throw new Error("No refresh token available")
				}

				const {
					access_token,
					refresh_token,
					state: checkState,
				} = await this.fetchToken(zgsmStateId, zgsmRefreshToken)

				if (zgsmStateId === checkState) {
					await this.saveTokens(zgsmStateId, access_token, refresh_token, true)
				} else {
					ZgsmLoginManager.provider.log(`[ZgsmLoginManager:${zgsmStateId}] State mismatch: ${checkState}`)
				}
				this.pollingInterval = setTimeout(refresh, this.getZgsmRefreshTokenInterval(access_token), access_token)
			} catch (error) {
				ZgsmLoginManager.provider.log(
					`[ZgsmLoginManager:${zgsmStateId}] Failed to refresh token: ${error.message}`,
				)
				this.pollingInterval = setTimeout(refresh, this.getZgsmRefreshTokenInterval(oldToken), oldToken)
			}
		}

		if (immediate) {
			return refresh(access_token)
		}

		this.pollingInterval = setTimeout(refresh, this.getZgsmRefreshTokenInterval(access_token), access_token)
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
			ZgsmLoginManager.provider.log(`[ZgsmLoginManager:${state}] Logout failed: ${error.message}`)
			throw error
		}
	}

	public getParams(state: string, ignore: string[] = []) {
		return [
			["machine_code", getClientId()],
			["state", state],
			["provider", "casdoor"],
			["plugin_version", Package.version],
			["vscode_version", vscode.version],
			["uri_scheme", vscode.env.uriScheme],
		].filter(([key]) => !ignore.includes(key))
	}

	getZgsmRefreshTokenInterval(token: string) {
		const { exp } = parseJwt(token)
		const interval = Math.min((exp - TOKEN_REFRESH_BUFFER) * 1000 - Date.now(), MAX_INTERVAL)

		return interval <= 0 && this.hasLoginTip ? EMERGENCY_INTERVAL : interval
	}

	dispose() {
		this.stopRefreshToken()
		clearTimeout(this.isPollingTokenTimer)
		clearTimeout(this.isPollingStatusTimer)
	}
}
