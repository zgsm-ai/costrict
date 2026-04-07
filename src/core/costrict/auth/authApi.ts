import { CostrictAuthConfig } from "./authConfig"
import type { ProviderSettings } from "@roo-code/types"
import type { ClineProvider } from "../../webview/ClineProvider"
import { LoginTokenResponse, CostrictLoginResponse } from "./types"
import { getParams } from "../../../utils/costrictUtils"
import { joinUrl } from "../../../utils/joinUrl"

export class CostrictAuthApi {
	private static clineProvider?: ClineProvider
	private static instance?: CostrictAuthApi

	loginUrl = "/oidc-auth/api/v1/plugin/login"
	tokenUrl = "/oidc-auth/api/v1/plugin/login/token"
	statusUrl = "/oidc-auth/api/v1/plugin/login/status"
	logoutUrl = `/oidc-auth/api/v1/plugin/logout`

	public static setProvider(clineProvider: ClineProvider): void {
		CostrictAuthApi.clineProvider = clineProvider
	}

	public static getInstance(): CostrictAuthApi {
		if (!CostrictAuthApi.instance) {
			CostrictAuthApi.instance = new CostrictAuthApi()
		}
		return CostrictAuthApi.instance
	}

	/**
	 * Get API configuration
	 */
	async getApiConfiguration(): Promise<ProviderSettings> {
		if (CostrictAuthApi.clineProvider) {
			try {
				const state = await CostrictAuthApi.clineProvider.getState()
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
	 * Get API base URL
	 */
	private async getApiBaseUrl(): Promise<string> {
		const apiConfig = await this.getApiConfiguration()

		// Prefer using baseUrl from apiConfiguration
		if (apiConfig.costrictBaseUrl?.trim()) {
			return `${apiConfig.costrictBaseUrl}`
		}

		// Use default API URL
		return CostrictAuthConfig.getInstance().getDefaultApiBaseUrl()
	}

	/**
	 * User logout
	 */
	async logoutUser(state?: string, access_token?: string): Promise<void> {
		try {
			const baseUrl = await this.getApiBaseUrl()
			const params = getParams(state || "", ["machine_code"])
			const url = `${baseUrl}?${params.map((p) => p.join("=")).join("&")}`

			await fetch(url, {
				method: "GET",
				headers: { Authorization: `Bearer ${access_token}` },
			})
		} catch (error) {
			console.error("User logout API failed:", error)
		}
	}

	/**
	 * Get user login status
	 */
	async getUserLoginState(state: string, access_token: string): Promise<CostrictLoginResponse> {
		try {
			const baseUrl = await this.getApiBaseUrl()
			const params = getParams(state, [access_token ? "machine_code" : ""])
			const url = `${joinUrl(baseUrl, [this.statusUrl])}?${params.map((p) => p.join("=")).join("&")}`
			const response = await fetch(url, {
				method: "GET",
				headers: access_token ? { Authorization: `Bearer ${access_token}` } : {},
			})

			if (!response.ok) {
				const error = new Error(`HTTP error! status: ${response.status} \n ${await response.text()}`)
				Object.assign(error, { status: response.status })
				throw error
			}

			const data = await response.json()
			return data as CostrictLoginResponse
		} catch (error) {
			console.error("[getUserLoginState] Failed to get login status:", error)
			throw error
		}
	}

	/**
	 * Refresh user token
	 */
	async getRefreshUserToken(refreshToken: string, machineId: string, state: string): Promise<LoginTokenResponse> {
		try {
			const baseUrl = await this.getApiBaseUrl()
			const params = getParams(state, [refreshToken ? "machine_code" : ""])

			const url = `${joinUrl(baseUrl, [this.tokenUrl])}?${params.map((p) => p.join("=")).join("&")}`
			const response = await fetch(url, {
				method: "GET",
				headers: refreshToken ? { Authorization: `Bearer ${refreshToken}` } : {},
			})

			if (!response.ok) {
				const error = new Error(`HTTP error! status: ${response.status} \n ${await response.text()}`)
				Object.assign(error, { status: response.status })
				throw error
			}

			const data = await response.json()

			return data as LoginTokenResponse
		} catch (error) {
			console.error("[getRefreshUserToken] Failed to get token:", error)
			throw error
		}
	}
}
