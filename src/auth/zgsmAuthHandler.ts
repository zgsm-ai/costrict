import { defaultAuthConfig } from "./../../webview-ui/src/config/auth"
import * as vscode from "vscode"
import { ClineProvider } from "../core/webview/ClineProvider"
import { ApiConfiguration } from "../shared/api"
import * as os from "os"
import * as querystring from "querystring"
import { getZgsmModels } from "../api/providers/zgsm"
import { logger } from "../utils/logging"

/**
 * Get local IP address
 * @returns Local IP address, or empty string if not found
 */
function getLocalIP(): string {
	try {
		const interfaces = os.networkInterfaces()
		let ipAddress = ""

		for (const interfaceName in interfaces) {
			const networkInterface = interfaces[interfaceName]
			if (!networkInterface) continue

			for (const iface of networkInterface) {
				// Filter for IPv4 and non-internal addresses
				if (iface.family === "IPv4" && !iface.internal) {
					ipAddress = iface.address
					break
				}
			}
			if (ipAddress) break // Break after finding the first valid IP
		}

		return ipAddress || ""
	} catch (error) {
		console.error("Failed to get local IP:", error)
		return ""
	}
}

/**
 * Create request headers including client identification information
 * @param dict Additional header information
 * @returns Complete headers object
 */
export function createHeaders(dict: Record<string, any> = {}): Record<string, any> {
	// Get extension information
	const extension =
		vscode.extensions.getExtension("zgsm-ai.zgsm") || vscode.extensions.getExtension("rooveterinaryinc.roo-cline")
	const extVersion = extension?.packageJSON.version || ""
	const ideVersion = vscode.version || ""
	const hostIp = getLocalIP()

	const headers = {
		ide: "vscode",
		"ide-version": extVersion,
		"ide-real-version": ideVersion,
		"host-ip": hostIp,
		...dict,
	}
	return headers
}

/**
 * Handle ZGSM OAuth callback
 * @param code Authorization code
 * @param state State value
 * @param provider ClineProvider instance
 */
export async function handleZgsmAuthCallback(code: string, state: string, provider: ClineProvider): Promise<void> {
	const afterLogin = async ({
		apiConfiguration,
		provider,
		tokenData,
	}: {
		apiConfiguration: ApiConfiguration
		provider: ClineProvider
		tokenData: any
	}) => {
		try {
			const zgsmModels = await getZgsmModels(
				apiConfiguration.zgsmBaseUrl || defaultAuthConfig.baseUrl,
				tokenData.access_token,
				apiConfiguration.openAiHostHeader,
			)
			provider.postMessageToWebview({ type: "zgsmModels", zgsmModels })
		} catch (error) {
			logger.error("Failed to get ZGSM models:", error)
		}
	}

	try {
		// Get current API configuration
		const { apiConfiguration, currentApiConfigName } = await provider.getState()
		// Get access token
		const tokenResponse = await getAccessToken(code, {
			...apiConfiguration,
			zgsmBaseUrl: apiConfiguration.zgsmBaseUrl || defaultAuthConfig.baseUrl,
			apiProvider: "zgsm",
		})

		if (tokenResponse.status === 200 && tokenResponse.data && tokenResponse.data.access_token) {
			const tokenData = tokenResponse.data

			// Update API configuration using token
			if (apiConfiguration) {
				const updatedConfig: ApiConfiguration = {
					...apiConfiguration,
					apiProvider: "zgsm",
					zgsmBaseUrl: apiConfiguration.zgsmBaseUrl || "",
					zgsmApiKey: tokenData.access_token,
				}

				// Update API configuration
				await provider.updateApiConfiguration(updatedConfig)

				const listApiConfig = (await provider.providerSettingsManager.listConfig()).filter(
					(config) => config.apiProvider === "zgsm",
				)

				const configUpdatesPromise = [provider.upsertApiConfiguration("zgsm", updatedConfig)]

				for (const configInfo of listApiConfig) {
					if (configInfo.name === "zgsm") continue
					configUpdatesPromise.push(provider.upsertApiConfiguration(configInfo.name, updatedConfig))
				}

				await Promise.all(configUpdatesPromise).then(() => {
					afterLogin({ apiConfiguration, provider, tokenData })
				})
			}

			// Show success message
			vscode.window.showInformationMessage("zgsm login successful")
		} else {
			throw new Error("Failed to get token")
		}
	} catch (error) {
		vscode.window.showErrorMessage(`ZGSM authorization failed: ${error}`)
	}
}

/**
 * Handle ZGSM OAuth message
 * @param authUrl Authentication URL
 * @param apiConfiguration API configuration
 * @param provider ClineProvider instance
 */
export async function handleZgsmLogin(
	authUrl: string,
	apiConfiguration: ApiConfiguration,
	provider: ClineProvider,
): Promise<void> {
	// Open authentication URL
	await vscode.env.openExternal(vscode.Uri.parse(authUrl))

	// Save apiConfiguration for use after successful authentication
	if (apiConfiguration) {
		await provider.updateApiConfiguration(apiConfiguration)
	}

	// Send message to webview indicating that authentication has been initiated
	provider.postMessageToWebview({ type: "state", state: await provider.getStateToPostToWebview() })
}

/**
 * Get access token
 * @param code Authorization code
 * @param apiConfiguration API configuration
 * @returns Response containing access token
 */
export async function getAccessToken(code: string, apiConfiguration?: ApiConfiguration) {
	try {
		// Prefer configuration from apiConfiguration, otherwise use defaults
		const clientId = apiConfiguration?.zgsmClientId || "vscode"
		const clientSecret = apiConfiguration?.zgsmClientSecret || "jFWyVy9wUKKSkX55TDBt2SuQWl7fDM1l"
		const redirectUri = apiConfiguration?.zgsmRedirectUri || `${apiConfiguration?.zgsmBaseUrl}/login/ok`
		const tokenUrl =
			apiConfiguration?.zgsmTokenUrl ||
			(apiConfiguration?.zgsmBaseUrl
				? `${apiConfiguration.zgsmBaseUrl}/realms/gw/protocol/openid-connect/token`
				: "https://zgsm.sangfor.com/realms/gw/protocol/openid-connect/token")

		// Set request parameters
		const params = {
			client_id: clientId,
			client_secret: clientSecret,
			code: code,
			grant_type: "authorization_code",
			redirect_uri: redirectUri,
		}

		// Use querystring to convert object to application/x-www-form-urlencoded format
		const formData = querystring.stringify(params)

		// Use fetch to request token with created headers
		const res = await fetch(tokenUrl, {
			method: "POST",
			headers: createHeaders({
				"Content-Type": "application/x-www-form-urlencoded",
			}),
			body: formData,
		})

		const data = await res.json()

		// Successfully retrieved token
		if (res.status === 200 && data && data.access_token) {
			return {
				status: 200,
				data,
			}
		} else {
			return {
				status: res.status || 400,
				data: null,
			}
		}
	} catch (err) {
		console.error("fetchToken: Axios error:", err.message)
		throw err
	}
}
