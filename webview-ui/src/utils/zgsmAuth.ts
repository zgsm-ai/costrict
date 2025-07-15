import { vscode } from "./vscode"
import { ApiConfiguration } from "../../../src/shared/api"
import { generateZgsmAuthUrl } from "../../../src/shared/zgsmAuthUrl"
import i18next from "i18next"

/**
 * Fetch Costrict configuration from API
 * @param baseUrl Base URL for the API
 */
export async function fetchZgsmAuthConfiguration(baseUrl: string): Promise<any> {
	const response = await fetch(`${baseUrl}/api/configuration?belong_type=authenticate&attribute_key=custom_url`)
	if (!response.ok) {
		throw new Error(i18next.t("settings:error.failed_to_fetch_auth_url_config") + response.statusText)
	}
	const responseData = await response.json()
	if (!responseData.success) {
		throw new Error(i18next.t("settings:error.failed_to_fetch_auth_url_config") + responseData.message)
	}

	if (!responseData.data || responseData.data.length === 0) {
		return {}
	}
	return responseData.data[0].attribute_value || {}
}

/**
 * Initiate Costrict login authentication process
 * @param apiConfiguration API configuration
 * @param uriScheme URI scheme
 */
export function initiateZgsmLogin(apiConfiguration: ApiConfiguration, uriScheme?: string): void {
	const authUrl = generateZgsmAuthUrl(apiConfiguration, uriScheme)
	// Send message to extension to handle authentication process
	vscode.postMessage({
		type: "zgsmLogin",
		url: authUrl,
		apiConfiguration,
	})
}
