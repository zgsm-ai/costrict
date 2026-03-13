import { jwtDecode } from "jwt-decode"
import type { ZgsmAuthTokens, ZgsmLoginState } from "./types"
import type { ClineProvider } from "../../webview/ClineProvider"
import { sendZgsmTokens } from "./ipc/client"
import { getClientId } from "../../../utils/getClientId"
import { zgsmCodebaseIndexManager } from "../codebase-index"
import { workspaceEventMonitor } from "../codebase-index/workspace-event-monitor"
import { writeCostrictAccessToken } from "../codebase-index/utils"

export class ZgsmAuthStorage {
	private static clineProvider?: ClineProvider
	private static instance?: ZgsmAuthStorage

	public static setProvider(clineProvider: ClineProvider): void {
		ZgsmAuthStorage.clineProvider = clineProvider
	}
	public static getInstance(): ZgsmAuthStorage {
		if (!ZgsmAuthStorage.instance) {
			ZgsmAuthStorage.instance = new ZgsmAuthStorage()
		}
		return ZgsmAuthStorage.instance
	}

	/**
	 * Save authentication tokens
	 */
	async saveTokens(tokens: ZgsmAuthTokens): Promise<void> {
		if (!ZgsmAuthStorage.clineProvider) return
		const state = await ZgsmAuthStorage.clineProvider.getState()
		if (!state.currentApiConfigName) {
			return
		}
		if (
			tokens.access_token === state.apiConfiguration.zgsmAccessToken ||
			tokens.refresh_token === state.apiConfiguration.zgsmRefreshToken
		) {
			ZgsmAuthStorage.clineProvider?.log(`[ZgsmLoginManager:${state}] saveTokens: tokens are already saved`)
			return
		}
		const { exp, iat } = jwtDecode(tokens.access_token) as any
		const zgsmApiKeyUpdatedAt = new Date(iat * 1000).toLocaleString()
		const zgsmApiKeyExpiredAt = new Date(exp * 1000).toLocaleString()
		const config = {
			...state.apiConfiguration,
			zgsmRefreshToken: tokens.refresh_token,
			zgsmAccessToken: tokens.access_token,
			zgsmState: tokens.state,
			zgsmApiKeyUpdatedAt,
			zgsmApiKeyExpiredAt,
		}
		await ZgsmAuthStorage.clineProvider?.providerSettingsManager.saveMergeConfig(
			config,
			(name, { apiProvider }) => {
				return apiProvider === "zgsm" && name !== state.currentApiConfigName
			},
		)
		ZgsmAuthStorage.clineProvider.setValue("zgsmRefreshToken", tokens.refresh_token)
		ZgsmAuthStorage.clineProvider.setValue("zgsmAccessToken", tokens.access_token)
		ZgsmAuthStorage.clineProvider.setValue("zgsmState", tokens.state)
		ZgsmAuthStorage.clineProvider.setValue("zgsmApiKeyUpdatedAt", zgsmApiKeyUpdatedAt)
		ZgsmAuthStorage.clineProvider.setValue("zgsmApiKeyExpiredAt", zgsmApiKeyExpiredAt)
		await ZgsmAuthStorage.clineProvider.upsertProviderProfile(state.currentApiConfigName, config, false)

		sendZgsmTokens(tokens)

		// Reinitialize codebase-index client independently from the workspace index toggle.
		writeCostrictAccessToken(tokens.access_token, tokens.refresh_token).then(async () => {
			if (state?.apiConfiguration?.apiProvider !== "zgsm") {
				return
			}
			await zgsmCodebaseIndexManager.ensureInitialized("saveTokens")
			await zgsmCodebaseIndexManager.syncToken()
			if (state.apiConfiguration.zgsmCodebaseIndexEnabled) {
				await workspaceEventMonitor.initialize()
			}
		})
	}

	/**
	 * Get saved authentication tokens
	 */
	async getTokens(): Promise<ZgsmAuthTokens | null> {
		if (!ZgsmAuthStorage.clineProvider) return null
		const state = await ZgsmAuthStorage.clineProvider.getState()
		return {
			access_token: state.apiConfiguration.zgsmAccessToken,
			refresh_token: state.apiConfiguration.zgsmRefreshToken,
			state: state.apiConfiguration.zgsmState,
		} as ZgsmAuthTokens
	}

	/**
	 * Save login status
	 */
	async saveLoginState(loginState: ZgsmLoginState): Promise<void> {
		if (!ZgsmAuthStorage.clineProvider) return
		const state = await ZgsmAuthStorage.clineProvider.getState()
		if (!state.currentApiConfigName) {
			return
		}
		const config = { ...state.apiConfiguration, zgsmState: loginState.state }
		// Save state value
		ZgsmAuthStorage.clineProvider.setValue("zgsmState", loginState.state)

		await ZgsmAuthStorage.clineProvider.upsertProviderProfile(state.currentApiConfigName, config, false)
	}

	/**
	 * Get saved login status
	 */
	async getLoginState(): Promise<ZgsmLoginState | null> {
		if (!ZgsmAuthStorage.clineProvider) return null
		const state = await ZgsmAuthStorage.clineProvider.getState()
		return state.apiConfiguration.zgsmState
			? { state: state.apiConfiguration.zgsmState, machineId: getClientId() }
			: null
	}

	/**
	 * Clear all authentication information
	 */
	async clearAllLoginState(): Promise<void> {
		if (!ZgsmAuthStorage.clineProvider) return
		const state = await ZgsmAuthStorage.clineProvider.getState()
		if (!state.currentApiConfigName) {
			return
		}
		const config = {
			zgsmBaseUrl: "",
			zgsmRefreshToken: "",
			zgsmAccessToken: "",
			zgsmState: "",
			zgsmApiKeyUpdatedAt: "",
			zgsmApiKeyExpiredAt: "",
		}
		await ZgsmAuthStorage.clineProvider?.providerSettingsManager.saveMergeConfig(
			config,
			(name) => name !== state.currentApiConfigName,
		)

		await ZgsmAuthStorage.clineProvider.setValue("zgsmBaseUrl", undefined)
		await ZgsmAuthStorage.clineProvider.setValue("zgsmAccessToken", undefined)
		await ZgsmAuthStorage.clineProvider.setValue("zgsmRefreshToken", undefined)
		await ZgsmAuthStorage.clineProvider.setValue("zgsmState", undefined)
		await ZgsmAuthStorage.clineProvider.setValue("zgsmApiKeyUpdatedAt", undefined)
		await ZgsmAuthStorage.clineProvider.setValue("zgsmApiKeyExpiredAt", undefined)
		await ZgsmAuthStorage.clineProvider.upsertProviderProfile(state.currentApiConfigName, config, false)
	}

	/**
	 * Check if there is valid login information
	 */
	async hasValidLogin(): Promise<boolean> {
		const tokens = await this.getTokens()
		return !!(tokens && tokens.access_token && tokens.refresh_token)
	}
}
