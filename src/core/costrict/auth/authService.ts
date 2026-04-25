import * as vscode from "vscode"
import { jwtDecode } from "jwt-decode"
import { CostrictAuthStorage } from "./authStorage"
import { CostrictAuthApi } from "./authApi"
import { CostrictAuthConfig } from "./authConfig"
import type { ProviderSettings, CostrictUserInfo } from "@roo-code/types"
import type { ClineProvider } from "../../webview/ClineProvider"
import { getParams, retryWrapper } from "../../../utils/costrictUtils"
import { joinUrl } from "../../../utils/joinUrl"
import { CostrictAuthStatus, CostrictAuthTokens, CostrictLoginState, LoginTokenResponse } from "./types"
import { generateNewSessionClientId, getClientId } from "../../../utils/getClientId"
import { sendCostrictLogout } from "./ipc/client"
import { CompletionStatusBar } from "../auto-complete"
import { t } from "../../../i18n"

let _loginState = ""

export class CostrictAuthService {
	private static instance: CostrictAuthService
	private static hasStatusBarLoginTip = false
	private static clineProvider: ClineProvider

	private loginStateTmp: CostrictLoginState | undefined
	private waitLoginPollingInterval?: NodeJS.Timeout
	private tokenRefreshInterval?: NodeJS.Timeout
	private startLoginTokenPollInterval?: NodeJS.Timeout
	private disposed = false
	private userInfo = {} as CostrictUserInfo
	private statusBar = CompletionStatusBar.getInstance()

	public static setProvider(clineProvider: ClineProvider): void {
		CostrictAuthService.clineProvider = clineProvider
	}

	public static getInstance(): CostrictAuthService {
		if (!CostrictAuthService.instance) {
			if (!CostrictAuthService.clineProvider) {
				throw new Error("CostrictAuthService not initialized")
			}

			CostrictAuthService.instance = new CostrictAuthService()
		}
		return CostrictAuthService.instance
	}

	/**
	 * Resets the singleton instance for testing purposes.
	 * @internal
	 */
	public static _resetForTesting(): void {
		CostrictAuthService.instance = undefined!
	}

	/**
	 * Get API configuration
	 */
	private async getApiConfiguration(): Promise<ProviderSettings> {
		if (CostrictAuthService.clineProvider) {
			try {
				const state = await CostrictAuthService.clineProvider.getState()
				return state.apiConfiguration
			} catch (error) {
				console.error("Failed to get API configuration:", error)
			}
		}

		// Return default configuration
		return {
			apiProvider: "costrict",
			apiKey: "",
			costrictBaseUrl: CostrictAuthConfig.getInstance().getDefaultLoginBaseUrl(),
		}
	}

	/**
	 * Start login process
	 */
	async startLogin(): Promise<CostrictLoginState> {
		this.stopWaitLoginPolling()
		this.stopRefreshToken()
		this.stopStartLoginTokenPoll()
		// Generate new login state parameters
		this.loginStateTmp = this.generateLoginState()
		_loginState = this.loginStateTmp!.state
		// Build login URL
		const loginUrl = await this.buildLoginUrl(this.loginStateTmp)
		// Copy login URL to clipboard so users can paste it manually if needed
		void vscode.env.clipboard.writeText(loginUrl).then(() => {
			vscode.window.showInformationMessage(t("common:login_url_copied"))
		})
		// Open login page in default browser
		await vscode.env.openExternal(vscode.Uri.parse(loginUrl))

		// Show notification
		const result = await this.getStartLoginTokenPoll(this.loginStateTmp!.state)
		this.startWaitLoginPolling(Object.assign(this.loginStateTmp, result.data))

		return this.loginStateTmp
	}

	getStartLoginTokenPoll(state: string): Promise<LoginTokenResponse> {
		return new Promise((resolve, reject) => {
			const maxAttempt = 60
			let attempt = 0
			// Clear previous timer
			this.stopStartLoginTokenPoll()

			if (this.disposed) {
				reject(new Error("AuthService has been disposed"))
				return
			}

			const run = async () => {
				if (_loginState !== state) {
					throw new Error(`Login state changed: ${_loginState} <-- ${state}`)
				}

				attempt++
				if (attempt > maxAttempt) {
					this.stopStartLoginTokenPoll()
					reject(new Error("Timeout getting login token"))
					return
				}

				CostrictAuthApi.getInstance()
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
						console.error(`Attempt ${attempt} failed to get login token:`, error)
					})
			}

			run()
		})
	}

	/**
	 * Start polling login status
	 */
	private async startWaitLoginPolling(loginState: CostrictLoginState & CostrictAuthTokens): Promise<void> {
		const maxAttempt = 60
		let attempt = 0
		const pollLoginState = async () => {
			if (_loginState !== loginState.state) {
				throw new Error(`Login state changed: ${_loginState} <-- ${loginState.state}`)
			}

			try {
				const { data, success } = await retryWrapper(
					"pollLoginState",
					() => CostrictAuthApi.getInstance().getUserLoginState(loginState.state, loginState.access_token),
					undefined,
					0,
				)

				if (
					success &&
					data?.state &&
					data.state === this.loginStateTmp?.state &&
					data?.status === CostrictAuthStatus.LOGGED_IN
				) {
					// Login successful, save tokens
					await CostrictAuthStorage.getInstance().saveTokens(loginState)
					// After successful login, save login status locally
					await CostrictAuthStorage.getInstance().saveLoginState(loginState)
					// Stop polling
					this.stopWaitLoginPolling()

					// Start token refresh timer
					this.startTokenRefresh(
						loginState.refresh_token,
						loginState.machineId || getClientId(),
						loginState.state,
					)

					// Trigger login success event
					this.onLoginSuccess(loginState)
					return
				}
			} catch (error) {
				console.error("Failed to poll login status:", error)
			}

			if (++attempt > maxAttempt) {
				vscode.window.showInformationMessage("Login timeout!")
				return
			}

			// Set polling interval (check every 5 seconds)
			this.waitLoginPollingInterval = setTimeout(
				pollLoginState,
				CostrictAuthConfig.getInstance().getWaitLoginPollingInterval(),
			)
		}

		// Execute immediately once
		await pollLoginState()
	}

	/**
	 * Stop polling
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
	 * Start token refresh timer
	 */
	startTokenRefresh(refreshToken: string, machineId: string, state: string): void {
		// Clear previous timer
		this.stopRefreshToken()
		if (this.disposed) return
		// Periodically refresh token
		this.tokenRefreshInterval = setInterval(
			async (refreshToken, machineId, state) => {
				try {
					await this.refreshToken(refreshToken, machineId, state)
				} catch (error) {
					console.error("Failed to auto-refresh token:", error)
					vscode.window.showErrorMessage("Token refresh failed, please login again")
				}
			},
			CostrictAuthConfig.getInstance().getTokenRefreshInterval(refreshToken),
			refreshToken,
			machineId,
			state,
		)
	}

	/**
	 * Refresh token
	 */
	async refreshToken(
		refreshToken: string,
		machineId: string,
		state: string,
		auto = true,
	): Promise<CostrictAuthTokens> {
		try {
			const { success, data, message } = await retryWrapper("refreshToken", () =>
				CostrictAuthApi.getInstance().getRefreshUserToken(refreshToken, machineId, state),
			)

			if (
				success &&
				data &&
				data.access_token &&
				data.refresh_token &&
				this.loginStateTmp?.state === data.state
			) {
				// Update saved tokens
				await CostrictAuthStorage.getInstance().saveTokens(data)

				// Update refresh timer
				if (auto) {
					this.startTokenRefresh(data.refresh_token, machineId, state)
				}

				return data
			} else {
				throw new Error(`[${state}]` + (message || "Failed to refresh token"))
			}
		} catch (error) {
			console.error(`[${state}] Failed to refresh token`, error)
			throw error
		}
	}

	async getTokens() {
		return await CostrictAuthStorage.getInstance().getTokens()
	}
	async saveTokens(tokens: CostrictAuthTokens) {
		return await CostrictAuthStorage.getInstance().saveTokens(tokens)
	}

	/**
	 * Check login status on plugin startup
	 */
	async checkLoginStatusOnStartup(): Promise<boolean> {
		try {
			const tokens = await CostrictAuthStorage.getInstance().getTokens()

			if (!tokens?.access_token || !tokens?.refresh_token) {
				return false
			}

			const jwt = jwtDecode(tokens?.refresh_token) as any

			return jwt.exp * 1000 > Date.now()
		} catch (error) {
			console.error("Failed to check login status on startup:", error)
			return false
		}
	}

	/**
	 * Get current token
	 */
	async getCurrentAccessToken(): Promise<string | null> {
		const tokens = await CostrictAuthStorage.getInstance().getTokens()
		return tokens?.access_token || null
	}

	/**
	 * Logout
	 */
	async logout(auto = false): Promise<void> {
		// Stop all timers
		this.stopStartLoginTokenPoll()
		this.stopWaitLoginPolling()
		this.stopRefreshToken()

		if (!auto) {
			// Trigger logout event
			await this.onLogout()
		}
		// Clear stored login information
		await CostrictAuthStorage.getInstance().clearAllLoginState()
		if (!auto) {
			sendCostrictLogout(generateNewSessionClientId())
		}
	}

	/**
	 * Generate login state parameters
	 */
	private generateLoginState(): CostrictLoginState {
		return {
			state: this.generateRandomString(),
			machineId: this.getMachineId(),
		}
	}

	/**
	 * Build login URL
	 */
	private async buildLoginUrl(loginState: CostrictLoginState): Promise<string> {
		const apiConfig = await this.getApiConfiguration()
		const baseUrl = this.getLoginBaseUrl(apiConfig)
		const params = getParams(loginState.state, [])

		return `${joinUrl(baseUrl, [CostrictAuthApi.getInstance().loginUrl])}?${params.map((p) => p.join("=")).join("&")}`
	}

	/**
	 * Get login base URL
	 */
	private getLoginBaseUrl(apiConfig: ProviderSettings): string {
		// Prefer using baseUrl from apiConfiguration
		const baseUrl = apiConfig.costrictBaseUrl?.trim()
		if (baseUrl) {
			return baseUrl
		}

		// Use default URL
		return CostrictAuthConfig.getInstance().getDefaultLoginBaseUrl()
	}

	/**
	 * Generate random string
	 */
	private generateRandomString(): string {
		return Math.random().toString(36).substring(2) + Date.now().toString(36)
	}

	/**
	 * Get machine ID
	 */
	private getMachineId(): string {
		// Use VSCode's machine ID or generate a unique identifier
		return getClientId()
	}

	/**
	 * Login success callback
	 */
	protected onLoginSuccess(tokens: CostrictAuthTokens): void {
		this.updateUserInfo(tokens.refresh_token)
		vscode.window.showInformationMessage(`${this.userInfo.name} user logged in successfully`)
		CostrictAuthService.clineProvider?.postMessageToWebview?.({ type: "costrictLogined" })
		this.statusBar.complete()
	}

	updateUserInfo(token: string) {
		const jwt = jwtDecode(token) as any

		this.userInfo = {
			id: jwt.universal_id,
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
	 * Logout callback
	 */
	protected async onLogout() {
		const state = await CostrictAuthStorage.getInstance().getLoginState()
		const tokens = await CostrictAuthStorage.getInstance().getTokens()
		// Can add post-logout logic here
		await retryWrapper(
			"onLogout",
			() => CostrictAuthApi.getInstance().logoutUser(state?.state || tokens?.state, tokens?.access_token),
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

		const reLoginText = opt?.btnText || "Login"

		vscode.window
			.showWarningMessage(opt?.errorTitle || t("common:window.error.login_for_full_features"), reLoginText)
			.then(async (selection) => {
				this.hasStatusBarLoginTip = false
				if (selection !== reLoginText) {
					opt?.cb?.()
					return
				}

				opt?.cb?.()
				CostrictAuthService?.instance?.startLogin()
			})
	}

	/**
	 * Dispose service
	 */
	dispose(): void {
		this.disposed = true
		this.stopStartLoginTokenPoll()
		this.stopWaitLoginPolling()
		this.stopRefreshToken()
	}
}
