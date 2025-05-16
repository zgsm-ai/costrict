import { defaultZgsmAuthConfig } from "./config"
import * as vscode from "vscode"
import { ClineProvider } from "../core/webview/ClineProvider"
import { ApiConfiguration } from "../shared/api"
import * as os from "os"
import * as querystring from "querystring"
import { getZgsmModels } from "../api/providers/zgsm"
import { logger } from "../utils/logging"

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
	const extension = vscode.extensions.getExtension("zgsm-ai.zgsm")
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
 * Common function to handle post-login operations
 */
export async function afterZgsmPostLogin({
	apiConfiguration,
	provider,
	configName,
	accessToken,
}: {
	apiConfiguration: ApiConfiguration
	provider: ClineProvider
	configName: string
	accessToken: string
}) {
	try {
		const [zgsmModels, zgsmDefaultModelId, err] = await getZgsmModels(
			apiConfiguration.zgsmBaseUrl || defaultZgsmAuthConfig.baseUrl,
			accessToken,
			apiConfiguration.openAiHostHeader,
		)

		await provider.upsertProviderProfile(configName, {
			...apiConfiguration,
			zgsmModelId: apiConfiguration.zgsmModelId || zgsmDefaultModelId,
			zgsmDefaultModelId,
		})

		provider.postMessageToWebview({ type: "zgsmModels", zgsmModels, zgsmDefaultModelId, errorObj: err })
	} catch (error) {
		logger.error("Failed to get Shenma models:", error)
		throw error
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
	// Open authentication link
	await vscode.env.openExternal(vscode.Uri.parse(authUrl))

	// // Save apiConfiguration for use after successful authentication
	// if (apiConfiguration) {
	// 	await provider.upsertProviderProfile((await provider.getState()).currentApiConfigName, apiConfiguration)
	// }

	// Send message to webview to notify that authentication has started
	provider.postMessageToWebview({ type: "state", state: await provider.getStateToPostToWebview() })
}

/**
 * Get access token
 * @param code Authorization code
 * @param apiConfiguration API configuration
 * @returns Response containing access token
 */
export async function getZgsmAccessToken(code: string, apiConfiguration?: ApiConfiguration) {
	try {
		const { redirectUri, tokenUrl } = defaultZgsmAuthConfig.getAuthUrls(apiConfiguration?.zgsmBaseUrl)

		// Prefer configuration in apiConfiguration, if not exist, use environment settings
		const clientId = apiConfiguration?.zgsmClientId || defaultZgsmAuthConfig.clientId
		const clientSecret = apiConfiguration?.zgsmClientSecret || defaultZgsmAuthConfig.clientSecret

		// Set request parameters
		const params = {
			client_id: clientId,
			client_secret: clientSecret,
			code,
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

		if (!res.ok) {
			throw new Error(`Failed to get token: ${await res.text()}`)
		}

		const data = await res.json()

		return data?.access_token
	} catch (err) {
		console.error("fetchToken: Axios error:", err.message)
		throw err
	}
}
