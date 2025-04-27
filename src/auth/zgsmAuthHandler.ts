import { getAuthConfig, getClientConfig } from "./../../webview-ui/src/config/auth"
import * as vscode from "vscode"
import { ClineProvider } from "../core/webview/ClineProvider"
import { ApiConfiguration, zgsmProviderKey } from "../shared/api"
import * as os from "os"
import * as querystring from "querystring"
import { getZgsmModels } from "../api/providers/zgsm"
import { logger } from "../utils/logging"

// Get extended information
export const getExtensionInfo = () => {
	const extension =
		vscode.extensions.getExtension("zgsm-ai.zgsm") || vscode.extensions.getExtension("rooveterinaryinc.roo-cline")
	const extVersion = extension?.packageJSON?.version || ""

	return { extVersion, ideVersion: vscode.version || "" }
}

/**
 * Get local IP address
 * @returns Local IP address, or an empty string if not found
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
			if (ipAddress) break // Exit after finding the first valid IP
		}

		return ipAddress || ""
	} catch (error) {
		logger.error("Failed to get local IP:", error)
		return ""
	}
}

/**
 * Create request headers with client identification information
 * @param dict Additional request header information
 * @returns Complete request header object
 */
export function createHeaders(dict: Record<string, any> = {}): Record<string, any> {
	// Get extended information
	const { extVersion, ideVersion } = getExtensionInfo()

	const headers = {
		ide: getClientConfig().ide,
		"ide-version": extVersion,
		"ide-real-version": ideVersion,
		"host-ip": getLocalIP(),
		...dict,
	}

	return headers
}

/**
 * Common function to handle post-login operations
 */
async function handlePostLogin({
	apiConfiguration,
	provider,
	accessToken,
}: {
	apiConfiguration: ApiConfiguration
	provider: ClineProvider
	accessToken: string
}): Promise<void> {
	try {
		const [zgsmModels, zgsmDefaultModelId] = await getZgsmModels(
			apiConfiguration.zgsmBaseUrl || getAuthConfig().baseUrl,
			accessToken,
			apiConfiguration.openAiHostHeader,
		)

		await provider.updateApiConfiguration({
			...apiConfiguration,
			zgsmModelId: zgsmDefaultModelId,
			zgsmDefaultModelId,
		})

		provider.postMessageToWebview({ type: "zgsmModels", zgsmModels, zgsmDefaultModelId })
	} catch (error) {
		logger.error("Failed to get zgsm models:", error)
		throw error
	}
}

/**
 * Common function to update API configurations
 */
async function updateApiConfigurations(
	provider: ClineProvider,
	currentConfigName: string,
	updatedConfig: ApiConfiguration,
): Promise<void> {
	const listApiConfig = (await provider.providerSettingsManager.listConfig()).filter(
		(config) => config.apiProvider === zgsmProviderKey,
	)

	const configUpdatesPromise = [provider.upsertApiConfiguration(currentConfigName, updatedConfig)]

	for (const configInfo of listApiConfig) {
		if (configInfo.name === currentConfigName) continue
		configUpdatesPromise.push(provider.upsertApiConfiguration(configInfo.name, updatedConfig))
	}

	await Promise.all(configUpdatesPromise)
}

/**
 * Handle ZGSM OAuth callback
 */
export async function handleZgsmAuthCallback(
	code: string | null,
	state: string | null,
	token: string | null,
	provider: ClineProvider,
): Promise<void> {
	logger.info(`handleZgsmAuthCallback: code: ${code}, state: ${state}, token: ${token}`)

	try {
		if (token) {
			await handleZgsmAuthCallbackWithToken(token, provider)
		} else if (code && state) {
			await handleZgsmAuthCallbackWithCode(code, state, provider)
		} else {
			throw new Error("Invalid callback parameters")
		}
	} catch (error) {
		logger.error(`zgsm login failed: ${error}`)
		throw error
	}
}

/**
 * Handle ZGSM OAuth callback with direct token
 */
async function handleZgsmAuthCallbackWithToken(token: string, provider: ClineProvider): Promise<void> {
	const { apiConfiguration, currentApiConfigName } = await provider.getState()

	if (!apiConfiguration) {
		throw new Error("No API configuration found")
	}

	const updatedConfig: ApiConfiguration = {
		...apiConfiguration,
		zgsmBaseUrl: apiConfiguration.zgsmBaseUrl || "",
		apiProvider: zgsmProviderKey,
		zgsmApiKey: token,
	}

	await updateApiConfigurations(provider, currentApiConfigName, updatedConfig)
	await handlePostLogin({ apiConfiguration: updatedConfig, provider, accessToken: token })

	vscode.window.showInformationMessage("zgsm login successful")
}

/**
 * Handle ZGSM OAuth callback with authorization code
 */
export async function handleZgsmAuthCallbackWithCode(
	code: string,
	state: string,
	provider: ClineProvider,
): Promise<void> {
	const { apiConfiguration, currentApiConfigName } = await provider.getState()

	if (!apiConfiguration) {
		throw new Error("No API configuration found")
	}

	const tokenResponse = await getAccessToken(code, {
		...apiConfiguration,
		zgsmBaseUrl: apiConfiguration.zgsmBaseUrl || getAuthConfig().baseUrl,
		apiProvider: zgsmProviderKey,
	})

	if (tokenResponse.status !== 200 || !tokenResponse.data?.access_token) {
		logger.error(`Failed to get access token: ${tokenResponse}`)
		throw new Error("Failed to get access token")
	}

	const tokenData = tokenResponse.data
	const updatedConfig: ApiConfiguration = {
		...apiConfiguration,
		zgsmBaseUrl: apiConfiguration.zgsmBaseUrl || "",
		apiProvider: zgsmProviderKey,
		zgsmApiKey: tokenData.access_token,
	}
	await updateApiConfigurations(provider, currentApiConfigName, updatedConfig)
	await handlePostLogin({ apiConfiguration: updatedConfig, provider, accessToken: tokenData.access_token })

	vscode.window.showInformationMessage("zgsm login successful")
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
	// Open authentication link
	await vscode.env.openExternal(vscode.Uri.parse(authUrl))

	// Save apiConfiguration for use after successful authentication
	if (apiConfiguration) {
		await provider.updateApiConfiguration(apiConfiguration)
	}

	// Send message to webview to notify that authentication has started
	provider.postMessageToWebview({ type: "state", state: await provider.getStateToPostToWebview() })
}

/**
 * Get access token
 * @param code Authorization code
 * @param apiConfiguration API configuration
 * @returns Response containing access token
 */
export async function getAccessToken(code: string, apiConfiguration?: ApiConfiguration) {
	const authConfig = getAuthConfig()
	try {
		// Prefer configuration in apiConfiguration, if not exist, use environment settings
		const clientId = apiConfiguration?.zgsmClientId || authConfig.clientId
		const clientSecret = apiConfiguration?.zgsmClientSecret || authConfig.clientSecret
		const redirectUri = apiConfiguration?.zgsmRedirectUri || authConfig.redirectUri
		const tokenUrl = apiConfiguration?.zgsmTokenUrl || authConfig.tokenUrl

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

		// Use fetch to send request and get token, add created request headers
		const res = await fetch(tokenUrl, {
			method: "POST",
			headers: createHeaders({
				"Content-Type": "application/x-www-form-urlencoded",
			}),
			body: formData,
		})

		const data = await res.json()

		// Successfully obtained token
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
