import { jwtDecode } from "jwt-decode"
import type { CostrictAuthTokens, CostrictLoginState } from "./types"
import type { ClineProvider } from "../../webview/ClineProvider"
import { sendCostrictTokens } from "./ipc/client"
import { getClientId } from "../../../utils/getClientId"
import { ensureCompletionRuntimeReady, writeCostrictRuntimeAuth } from "../runtime-config"

export class CostrictAuthStorage {
	private static clineProvider?: ClineProvider
	private static instance?: CostrictAuthStorage

	public static setProvider(clineProvider: ClineProvider): void {
		CostrictAuthStorage.clineProvider = clineProvider
	}
	public static getInstance(): CostrictAuthStorage {
		if (!CostrictAuthStorage.instance) {
			CostrictAuthStorage.instance = new CostrictAuthStorage()
		}
		return CostrictAuthStorage.instance
	}

	/**
	 * Save authentication tokens
	 */
	async saveTokens(tokens: CostrictAuthTokens): Promise<void> {
		if (!CostrictAuthStorage.clineProvider) return
		const state = await CostrictAuthStorage.clineProvider.getState()
		if (!state.currentApiConfigName) {
			return
		}
		if (
			tokens.access_token === state.apiConfiguration.costrictAccessToken ||
			tokens.refresh_token === state.apiConfiguration.costrictRefreshToken
		) {
			CostrictAuthStorage.clineProvider?.log(
				`[CostrictLoginManager:${state}] saveTokens: tokens are already saved`,
			)
			return
		}
		const { exp, iat } = jwtDecode(tokens.access_token) as any
		const costrictApiKeyUpdatedAt = new Date(iat * 1000).toLocaleString()
		const costrictApiKeyExpiredAt = new Date(exp * 1000).toLocaleString()
		const config = {
			...state.apiConfiguration,
			costrictRefreshToken: tokens.refresh_token,
			costrictAccessToken: tokens.access_token,
			costrictState: tokens.state,
			costrictApiKeyUpdatedAt,
			costrictApiKeyExpiredAt,
		}
		await CostrictAuthStorage.clineProvider?.providerSettingsManager.saveMergeConfig(
			config,
			(name, { apiProvider }) => {
				return apiProvider === "costrict" && name !== state.currentApiConfigName
			},
		)
		CostrictAuthStorage.clineProvider.setValue("costrictRefreshToken", tokens.refresh_token)
		CostrictAuthStorage.clineProvider.setValue("costrictAccessToken", tokens.access_token)
		CostrictAuthStorage.clineProvider.setValue("costrictState", tokens.state)
		CostrictAuthStorage.clineProvider.setValue("costrictApiKeyUpdatedAt", costrictApiKeyUpdatedAt)
		CostrictAuthStorage.clineProvider.setValue("costrictApiKeyExpiredAt", costrictApiKeyExpiredAt)
		await CostrictAuthStorage.clineProvider.upsertProviderProfile(state.currentApiConfigName, config, false)

		sendCostrictTokens(tokens)

		void writeCostrictRuntimeAuth(tokens.access_token, tokens.refresh_token)
			.then(() => ensureCompletionRuntimeReady())
			.catch((error) => {
				CostrictAuthStorage.clineProvider?.log(
					`[CostrictLoginManager] failed to prepare completion runtime: ${error instanceof Error ? error.message : String(error)}`,
				)
			})
	}

	/**
	 * Get saved authentication tokens
	 */
	async getTokens(): Promise<CostrictAuthTokens | null> {
		if (!CostrictAuthStorage.clineProvider) return null
		const state = await CostrictAuthStorage.clineProvider.getState()
		return {
			access_token: state.apiConfiguration.costrictAccessToken,
			refresh_token: state.apiConfiguration.costrictRefreshToken,
			state: state.apiConfiguration.costrictState,
		} as CostrictAuthTokens
	}

	/**
	 * Save login status
	 */
	async saveLoginState(loginState: CostrictLoginState): Promise<void> {
		if (!CostrictAuthStorage.clineProvider) return
		const state = await CostrictAuthStorage.clineProvider.getState()
		if (!state.currentApiConfigName) {
			return
		}
		const config = { ...state.apiConfiguration, costrictState: loginState.state }
		// Save state value
		CostrictAuthStorage.clineProvider.setValue("costrictState", loginState.state)

		await CostrictAuthStorage.clineProvider.upsertProviderProfile(state.currentApiConfigName, config, false)
	}

	/**
	 * Get saved login status
	 */
	async getLoginState(): Promise<CostrictLoginState | null> {
		if (!CostrictAuthStorage.clineProvider) return null
		const state = await CostrictAuthStorage.clineProvider.getState()
		return state.apiConfiguration.costrictState
			? { state: state.apiConfiguration.costrictState, machineId: getClientId() }
			: null
	}

	/**
	 * Clear all authentication information
	 */
	async clearAllLoginState(): Promise<void> {
		if (!CostrictAuthStorage.clineProvider) return
		const state = await CostrictAuthStorage.clineProvider.getState()
		if (!state.currentApiConfigName) {
			return
		}
		const config = {
			costrictBaseUrl: "",
			costrictRefreshToken: "",
			costrictAccessToken: "",
			costrictState: "",
			costrictApiKeyUpdatedAt: "",
			costrictApiKeyExpiredAt: "",
		}
		await CostrictAuthStorage.clineProvider?.providerSettingsManager.saveMergeConfig(
			config,
			(name) => name !== state.currentApiConfigName,
		)

		await CostrictAuthStorage.clineProvider.setValue("costrictBaseUrl", undefined)
		await CostrictAuthStorage.clineProvider.setValue("costrictAccessToken", undefined)
		await CostrictAuthStorage.clineProvider.setValue("costrictRefreshToken", undefined)
		await CostrictAuthStorage.clineProvider.setValue("costrictState", undefined)
		await CostrictAuthStorage.clineProvider.setValue("costrictApiKeyUpdatedAt", undefined)
		await CostrictAuthStorage.clineProvider.setValue("costrictApiKeyExpiredAt", undefined)
		await CostrictAuthStorage.clineProvider.upsertProviderProfile(state.currentApiConfigName, config, false)
	}

	/**
	 * Check if there is valid login information
	 */
	async hasValidLogin(): Promise<boolean> {
		const tokens = await this.getTokens()
		return !!(tokens && tokens.access_token && tokens.refresh_token)
	}
}
