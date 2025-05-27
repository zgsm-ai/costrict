import * as vscode from "vscode"
import axios from "axios"
import { ClineProvider } from "../core/webview/ClineProvider"

// 登录状态枚举
export enum LoginStatus {
	LOGGED_OUT = "logged_out",
	ACTIVED = "actived",
	EXPIRED = "expired",
	UNKNOWN = "unknown",
}

// 登录状态接口
interface LoginState {
	status: LoginStatus
	message: string
	state?: string
	access_token?: string
}

// Token接口
interface TokenResponse {
	access_token: string
	refresh_token: string
}

export class ZgsmLoginManager {
	private static instance: ZgsmLoginManager
	public static provider: ClineProvider
	public static stateId: string

	public static machineCode: string
	private pollingInterval: NodeJS.Timeout | null = null
	private baseUrl: string = ""
	private loginUrl: string = ""
	private tokenUrl: string = ""
	private statusUrl: string = ""
	private logoutUrl: string = ""

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

	// 检查登录状态
	public async checkLoginStatus(): Promise<LoginStatus> {
		await this.initUrls()

		// 从 provider 获取 apiConfiguration
		const apiKey = ZgsmLoginManager.provider.getValue("apiKey")

		if (!apiKey) {
			return LoginStatus.LOGGED_OUT
		}
		const state = ZgsmLoginManager.provider.getValue("zgsmStateId")
		const refreshToken = ZgsmLoginManager.provider.getValue("zgsmRefreshToken")
		try {
			const response = await axios.post<LoginState>(
				this.tokenUrl,
				{
					machine_code: ZgsmLoginManager.getMachineCode(),
					uri_scheme: vscode.env.uriScheme,
					state,
					refresh_token: refreshToken,
				},
				{
					headers: {
						Authorization: `Bearer ${apiKey}`,
					},
				},
			)

			return response.data.status
		} catch (error) {
			console.error("检查登录状态失败:", error)
			return LoginStatus.UNKNOWN
		}
	}

	// 开始登录流程
	public async startLogin(): Promise<void> {
		await this.initUrls()
		// 打开登录页面
		const loginUrl = `${this.loginUrl}?machine_code=${ZgsmLoginManager.getMachineCode()}`
		vscode.env.openExternal(vscode.Uri.parse(loginUrl))

		// 开始轮询登录状态
		this.startPolling()
	}

	// 开始轮询
	private async startPolling(): Promise<void> {
		if (this.pollingInterval) {
			clearInterval(this.pollingInterval)
		}

		this.pollingInterval = setInterval(async () => {
			try {
				const response = await axios.get<LoginState>(
					`${this.loginUrl}?machine_code=${ZgsmLoginManager.getMachineCode()}`,
				)

				if (response.data.status === LoginStatus.ACTIVED) {
					// 登录成功，获取token
					await this.getToken()
					this.stopPolling()
				}
			} catch (error) {
				console.error("轮询登录状态失败:", error)
			}
		}, 3000) // 每3秒轮询一次
	}

	// 停止轮询
	private stopPolling(): void {
		if (this.pollingInterval) {
			clearInterval(this.pollingInterval)
			this.pollingInterval = null
		}
	}

	// 获取token
	private async getToken(): Promise<void> {
		try {
			const state = ZgsmLoginManager.provider.getValue("zgsmStateId")
			const refreshToken = ZgsmLoginManager.provider.getValue("zgsmRefreshToken")
			const response = await axios.post<TokenResponse>(this.tokenUrl, {
				machine_code: ZgsmLoginManager.getMachineCode(),
				uri_scheme: vscode.env.uriScheme,
				state,
				refresh_token: refreshToken,
			})

			// 更新 apiKey
			await ZgsmLoginManager.provider.setValue("apiKey", response.data.access_token)

			vscode.window.showInformationMessage("登录成功！")
		} catch (error) {
			console.error("获取token失败:", error)
			vscode.window.showErrorMessage("获取token失败，请重试！")
		}
	}

	// 登出
	public async logout(): Promise<void> {
		await this.initUrls()

		// 从 provider 获取 apiKey
		const apiKey = ZgsmLoginManager.provider.getValue("apiKey")

		if (!apiKey) {
			return
		}

		try {
			await axios.post(
				this.logoutUrl,
				{
					machine_code: ZgsmLoginManager.getMachineCode(),
					uri_scheme: vscode.env.uriScheme,
					state: ZgsmLoginManager.stateId,
				},
				{
					headers: {
						Authorization: `Bearer ${apiKey}`,
					},
				},
			)

			// 清除 apiKey
			await ZgsmLoginManager.provider.setValue("apiKey", undefined)

			vscode.window.showInformationMessage("登出成功！")
		} catch (error) {
			console.error("登出失败:", error)
			vscode.window.showErrorMessage("登出失败，请重试！")
		}
	}

	// 启动token过期检测
	public startTokenExpirationCheck(): void {
		setInterval(async () => {
			const status = await this.checkLoginStatus()
			if (status === LoginStatus.EXPIRED) {
				vscode.window.showWarningMessage("登录已过期，请重新登录！")
				await this.logout()
			}
		}, 60000) // 每分钟检查一次
	}
}
