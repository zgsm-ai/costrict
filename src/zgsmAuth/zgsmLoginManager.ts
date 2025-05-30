import * as vscode from "vscode"
// import axios from "axios"
import { ClineProvider } from "../core/webview/ClineProvider"
// import { LoginState, LoginStatus, TokenResponse } from "./types"
import { generateZgsmStateId } from "../shared/zgsmAuthUrl"
import { Package } from "../schemas"
import delay from "delay"

// 根据以下需求，在当前代码基础上重构优化代码：
// 1.用户 vscode.env.openExternal 打开外部登陆页，然后开始轮询(api tokenUrl， 不需要带上 Authorization: `Bearer ${refresh_token}` )获取用户 token (两种token: access_token, refresh_token)
// 2.如果 token 获取成功，则停止轮询，并返回 token（access_token, refresh_token）
// 3.使用 token 获取用户状态（api statusUrl 需要带上 Authorization: `Bearer ${access_token}`）
// 4.如果用户状态为登录状态，则停止轮询，将 state, access_token, refresh_token  通过 upsertProviderProfile 写入 vscode
// 5.开始轮询 refresh_token 获取新的 token（api tokenUrl， 需要带上 Authorization: `Bearer ${refresh_token}` ）
export class ZgsmLoginManager {
	private static instance: ZgsmLoginManager
	public static provider: ClineProvider
	public static stateId: string

	private static get machineCode(): string {
		return vscode.env.machineId
	}

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

	public static getMachineCode() {
		return vscode.env.machineId
	}

	// 初始化URL
	private async initUrls(): Promise<void> {
		if (!ZgsmLoginManager.provider) {
			throw new Error("Provider not initialized")
		}

		// 从 provider 获取 baseUrl
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
		await this.initUrls()

		const state = generateZgsmStateId()
		await this.openLoginPage(state)

		try {
			const { access_token, refresh_token } = await this.pollForToken(state)
			await this.pollForLoginStatus(access_token)
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

	private async pollForLoginStatus(access_token: string) {
		this.isPollingStatus = true
		try {
			await Promise.race([
				this.checkLoginStatus(access_token),
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
		await this.initUrls()
		this.validateUrls()
		state = state || generateZgsmStateId()

		const params = this.getParams(state)
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

	private async checkLoginStatus(access_token: string): Promise<void> {
		await this.initUrls()
		this.validateUrls()
		const controller = new AbortController()
		this.abortControllers.push(controller)
		const { signal } = controller

		try {
			const { apiConfiguration } = await ZgsmLoginManager.provider.getState()
			const state = apiConfiguration.zgsmStateId
			if (!state) {
				throw new Error("No state available")
			}
			const params = this.getParams(state)

			while (this.isPollingStatus) {
				const res = await fetch(`${this.statusUrl}?${params.map((p) => p.join("=")).join("&")}`, {
					method: "POST",
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
				if (data.state === "login") {
					return
				}

				await delay(1000)
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
			await this.initUrls()
			const { apiConfiguration, currentApiConfigName } = await ZgsmLoginManager.provider.getState()

			if (!apiConfiguration.zgsmRefreshToken) {
				throw new Error("No refresh token available")
			}

			const { access_token, refresh_token } = await this.fetchToken(
				apiConfiguration.zgsmStateId,
				apiConfiguration.zgsmRefreshToken,
			)

			// 更新存储的token
			await ZgsmLoginManager.provider.upsertProviderProfile(currentApiConfigName, {
				...apiConfiguration,
				zgsmApiKey: access_token,
				zgsmRefreshToken: refresh_token,
			})

			// 设置下一次刷新
			this.pollingInterval = setTimeout(
				() => this.startRefreshToken(),
				1000 * 60 * 60, // 1小时
			)
		} catch (error) {
			console.error("Failed to refresh token:", error)
			// 在失败情况下，缩短重试间隔
			this.pollingInterval = setTimeout(
				() => this.startRefreshToken(),
				1000 * 60 * 5, // 5分钟
			)
		}
	}

	public async stopRefreshToken() {
		clearTimeout(this.pollingInterval as NodeJS.Timeout)
	}

	public async logout() {
		try {
			await this.initUrls()
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

			// 清除本地存储的token
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

	public getParams(state: string) {
		return [
			["machine_code", ZgsmLoginManager.getMachineCode()],
			["state", state],
			["plugin_version", Package.version],
			["vscode_version", vscode.version],
			["uri_scheme", vscode.env.uriScheme],
		]
	}
}
