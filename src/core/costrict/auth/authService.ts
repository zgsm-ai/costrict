import * as vscode from "vscode"
import { jwtDecode } from "jwt-decode"
import { ZgsmAuthStorage } from "./authStorage"
import { ZgsmAuthApi } from "./authApi"
import { ZgsmAuthConfig } from "./authConfig"
import type { ProviderSettings } from "@roo-code/types"
import type { ClineProvider } from "../../webview/ClineProvider"
import { getParams, retryWrapper } from "../../../utils/zgsmUtils"
import { joinUrl } from "../../../utils/joinUrl"
import { ZgsmAuthStatus, ZgsmAuthTokens, ZgsmLoginState, ZgsmUserInfo, LoginTokenResponse } from "./types"
import { getClientId } from "../../../utils/getClientId"
import { sendZgsmLogout } from "./ipc/client"
import { CompletionStatusBar } from "../completion"

export class ZgsmAuthService {
	private static instance: ZgsmAuthService
	private static hasStatusBarLoginTip = false

	private storage: ZgsmAuthStorage
	private api: ZgsmAuthApi
	private loginStateTmp: ZgsmLoginState | undefined
	private config: ZgsmAuthConfig
	private waitLoginPollingInterval?: NodeJS.Timeout
	private tokenRefreshInterval?: NodeJS.Timeout
	private startLoginTokenPollInterval?: NodeJS.Timeout
	private clineProvider: ClineProvider
	private disposed = false
	private userInfo = {} as ZgsmUserInfo

	protected constructor(clineProvider: ClineProvider) {
		this.storage = ZgsmAuthStorage.getInstance()
		if (clineProvider) {
			this.storage.setClineProvider(clineProvider)
		}
		this.api = new ZgsmAuthApi(clineProvider)
		this.config = ZgsmAuthConfig.getInstance() // 使用单例
		this.clineProvider = clineProvider
	}

	public static initialize(clineProvider: ClineProvider): void {
		if (!ZgsmAuthService.instance) {
			ZgsmAuthService.instance = new ZgsmAuthService(clineProvider)
		}
	}

	public static getInstance(): ZgsmAuthService {
		if (!ZgsmAuthService.instance) {
			throw new Error("ZgsmAuthService not initialized")
		}
		return ZgsmAuthService.instance
	}

	/**
	 * Resets the singleton instance for testing purposes.
	 * @internal
	 */
	public static _resetForTesting(): void {
		ZgsmAuthService.instance = undefined!
	}

	/**
	 * 设置ClineProvider实例
	 */
	setClineProvider(clineProvider: ClineProvider): ZgsmAuthService {
		this.clineProvider = clineProvider
		this.api.setClineProvider(clineProvider)
		return this
	}

	/**
	 * 获取API配置
	 */
	private async getApiConfiguration(): Promise<ProviderSettings> {
		if (this.clineProvider) {
			try {
				const state = await this.clineProvider.getState()
				return state.apiConfiguration
			} catch (error) {
				console.error("获取API配置失败:", error)
			}
		}

		// 返回默认配置
		return {
			apiProvider: "zgsm",
			apiKey: "",
			zgsmBaseUrl: this.config.getDefaultLoginBaseUrl(),
		}
	}

	/**
	 * 启动登录流程
	 */
	async startLogin(): Promise<ZgsmLoginState> {
		this.stopWaitLoginPolling()
		this.stopRefreshToken()
		this.stopStartLoginTokenPoll()
		try {
			// 生成新的登录状态参数
			this.loginStateTmp = this.generateLoginState()

			// 构建登录URL
			const loginUrl = await this.buildLoginUrl(this.loginStateTmp)

			// 在默认浏览器中打开登录页面
			await vscode.env.openExternal(vscode.Uri.parse(loginUrl))

			// 显示通知
			const result = await this.getStartLoginTokenPoll(this.loginStateTmp!.state)
			this.startWaitLoginPolling(Object.assign(this.loginStateTmp, result.data))

			return this.loginStateTmp
		} catch (error) {
			vscode.window.showErrorMessage(`启动登录失败: ${error}`)
			throw error
		}
	}

	getStartLoginTokenPoll(state: string): Promise<LoginTokenResponse> {
		return new Promise((resolve, reject) => {
			const maxAttempt = 60
			let attempt = 0
			// 清除之前的定时器
			this.stopStartLoginTokenPoll()

			if (this.disposed) {
				reject(new Error("AuthService已销毁"))
				return
			}

			const run = async () => {
				attempt++
				if (attempt > maxAttempt) {
					this.stopStartLoginTokenPoll()
					reject(new Error("获取登录token超时"))
					return
				}

				this.api
					.getRefreshUserToken("", this.getMachineId(), state)
					.then((result) => {
						if (result.data?.access_token && result.data?.refresh_token && result.data?.state === state) {
							this.stopStartLoginTokenPoll()
							resolve(result)
						} else {
							this.startLoginTokenPollInterval = setTimeout(run, 3000)
						}
					})
					.catch((error) => {
						console.error("第 ${attempt} 获取登录token失败:", error)
					})
			}

			run()
		})
	}

	/**
	 * 开始轮询登录状态
	 */
	private async startWaitLoginPolling(loginState: ZgsmLoginState & ZgsmAuthTokens): Promise<void> {
		const maxAttempt = 60
		let attempt = 0
		const pollLoginState = async () => {
			try {
				const { data, success } = await retryWrapper(
					"pollLoginState",
					() => this.api.getUserLoginState(loginState.state, loginState.access_token),
					undefined,
					0,
				)

				if (
					success &&
					data?.state &&
					data.state === this.loginStateTmp?.state &&
					data?.status === ZgsmAuthStatus.LOGGED_IN
				) {
					// 登录成功，保存token
					await this.storage.saveTokens(loginState)
					// 登录成功后 保存登录状态到本地
					await this.storage.saveLoginState(loginState)
					// 停止轮询
					this.stopWaitLoginPolling()

					// 开始token刷新定时器
					this.startTokenRefresh(
						loginState.refresh_token,
						loginState.machineId || getClientId(),
						loginState.state,
					)

					// 触发登录成功事件
					this.onLoginSuccess(loginState)
					return
				}
			} catch (error) {
				console.error("轮询登录状态失败:", error)
			}

			if (++attempt > maxAttempt) {
				vscode.window.showInformationMessage("登录超时！")
				return
			}

			// 设置轮询间隔（每5秒检查一次）
			this.waitLoginPollingInterval = setTimeout(pollLoginState, this.config.getWaitLoginPollingInterval())
		}

		// 立即执行一次
		await pollLoginState()
	}

	/**
	 * 停止轮询
	 */
	private stopStartLoginTokenPoll(): void {
		if (this.startLoginTokenPollInterval) {
			clearInterval(this.startLoginTokenPollInterval)
			this.startLoginTokenPollInterval = undefined
		}
	}
	private stopWaitLoginPolling(): void {
		if (this.waitLoginPollingInterval) {
			clearTimeout(this.waitLoginPollingInterval)
			this.waitLoginPollingInterval = undefined
		}
	}

	private stopRefreshToken(): void {
		if (this.tokenRefreshInterval) {
			clearInterval(this.tokenRefreshInterval)
			this.tokenRefreshInterval = undefined
		}
	}

	/**
	 * 开始token刷新定时器
	 */
	startTokenRefresh(refreshToken: string, machineId: string, state: string): void {
		// 清除之前的定时器
		this.stopRefreshToken()
		if (this.disposed) return
		// 定时刷新一次token
		this.tokenRefreshInterval = setInterval(
			async (refreshToken, machineId, state) => {
				try {
					await this.refreshToken(refreshToken, machineId, state)
				} catch (error) {
					console.error("自动刷新token失败:", error)
					vscode.window.showErrorMessage("Token刷新失败，请重新登录")
					// this.logout()
				}
			},
			this.config.getTokenRefreshInterval(refreshToken),
			refreshToken,
			machineId,
			state,
		)
	}

	/**
	 * 刷新token
	 */
	async refreshToken(refreshToken: string, machineId: string, state: string, auto = true): Promise<ZgsmAuthTokens> {
		try {
			const { success, data, message } = await retryWrapper("refreshToken", () =>
				this.api.getRefreshUserToken(refreshToken, machineId, state),
			)

			if (
				success &&
				data &&
				data.access_token &&
				data.refresh_token &&
				this.loginStateTmp?.state === data.state
			) {
				// 更新保存的token
				await this.storage.saveTokens(data)

				// 更新刷新定时器
				if (auto) {
					this.startTokenRefresh(data.refresh_token, machineId, state)
				}

				return data
			} else {
				throw new Error(`[${state}]` + (message || "刷新token失败"))
			}
		} catch (error) {
			console.error(`[${state}] 刷新token失败`, error)
			throw error
		}
	}

	async getTokens() {
		return await this.storage.getTokens()
	}
	async saveTokens(tokens: ZgsmAuthTokens) {
		return await this.storage.saveTokens(tokens)
	}

	/**
	 * 插件启动时检查登录状态
	 */
	async checkLoginStatusOnStartup(): Promise<boolean> {
		try {
			const tokens = await this.storage.getTokens()

			if (!tokens?.access_token || !tokens?.refresh_token) {
				return false
			}

			const jwt = jwtDecode(tokens?.refresh_token) as any

			return jwt.exp * 1000 > Date.now()
		} catch (error) {
			console.error("启动时检查登录状态失败:", error)
			return false
		}
	}

	/**
	 * 获取当前token
	 */
	async getCurrentAccessToken(): Promise<string | null> {
		const tokens = await this.storage.getTokens()
		return tokens?.access_token || null
	}

	/**
	 * 登出
	 */
	async logout(auto = false): Promise<void> {
		// 停止所有定时器
		this.stopStartLoginTokenPoll()
		this.stopWaitLoginPolling()
		this.stopRefreshToken()

		if (!auto) {
			// 触发登出事件
			await this.onLogout()
		}
		// 清除存储的登录信息
		await this.storage.clearAllLoginState()
		if (!auto) {
			sendZgsmLogout(vscode.env.sessionId)
		}
	}

	/**
	 * 生成登录状态参数
	 */
	private generateLoginState(): ZgsmLoginState {
		return {
			state: this.generateRandomString(),
			machineId: this.getMachineId(),
		}
	}

	/**
	 * 构建登录URL
	 */
	private async buildLoginUrl(loginState: ZgsmLoginState): Promise<string> {
		const apiConfig = await this.getApiConfiguration()
		const baseUrl = this.getLoginBaseUrl(apiConfig)
		const params = getParams(loginState.state, [])

		return `${joinUrl(baseUrl, [this.api.loginUrl])}?${params.map((p) => p.join("=")).join("&")}`
	}

	/**
	 * 获取登录基础URL
	 */
	private getLoginBaseUrl(apiConfig: ProviderSettings): string {
		// 优先使用apiConfiguration中的baseUrl
		if (apiConfig.zgsmBaseUrl?.trim()) {
			return apiConfig.zgsmBaseUrl
		}

		// 使用默认URL
		return this.config.getDefaultLoginBaseUrl()
	}

	/**
	 * 生成随机字符串
	 */
	private generateRandomString(): string {
		return Math.random().toString(36).substring(2) + Date.now().toString(36)
	}

	/**
	 * 获取机器ID
	 */
	private getMachineId(): string {
		// 使用VSCode的机器ID或生成一个唯一标识
		return getClientId()
	}

	/**
	 * 登录成功回调
	 */
	protected onLoginSuccess(tokens: ZgsmAuthTokens): void {
		this.updateUserInfo(tokens.refresh_token)
		vscode.window.showInformationMessage(`${this.userInfo.name}用户登录成功`)
		this.clineProvider?.postMessageToWebview?.({ type: "zgsmLogined" })
		CompletionStatusBar.complete()
		CompletionStatusBar.resetCommand()
	}

	updateUserInfo(token: string) {
		const jwt = jwtDecode(token) as any

		this.userInfo = {
			id: jwt.id,
			name: jwt?.properties?.oauth_GitHub_username || jwt.id,
			picture: jwt.avatar,
			email: jwt.email,
			phone: jwt.phone,
		}
	}

	getUserInfo() {
		return this.userInfo
	}

	/**
	 * 登出回调
	 */
	protected async onLogout() {
		const state = await this.storage.getLoginState()
		const tokens = await this.storage.getTokens()
		// 可以在这里添加登出后的逻辑
		await retryWrapper(
			"onLogout",
			() => this.api.logoutUser(state?.state || tokens?.state, tokens?.access_token),
			undefined,
			1,
		)
	}

	static async openStatusBarLoginTip(
		opt: {
			cb?: () => void
			errorTitle?: string
			btnText?: string
		} = {},
	) {
		if (this.hasStatusBarLoginTip) return
		this.hasStatusBarLoginTip = true

		const reLoginText = opt?.btnText || "登录"

		vscode.window
			.showWarningMessage(opt?.errorTitle || "登录后可使用完整功能", reLoginText)
			.then(async (selection) => {
				this.hasStatusBarLoginTip = false
				if (selection !== reLoginText) {
					opt?.cb?.()
					return
				}

				opt?.cb?.()
				ZgsmAuthService?.instance?.startLogin()
			})
	}

	/**
	 * 销毁服务
	 */
	dispose(): void {
		this.disposed = true
		this.stopStartLoginTokenPoll()
		this.stopWaitLoginPolling()
		this.stopRefreshToken()
	}
}
