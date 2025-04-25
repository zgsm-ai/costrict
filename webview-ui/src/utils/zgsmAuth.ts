import { vscode } from "./vscode"
import { ApiConfiguration } from "../../../src/shared/api"
import { getZgsmAuthUrl } from "../oauth/urls"

/**
 * Generate ZGSM authentication URL
 * @param uriScheme URI scheme
 * @returns Authentication URL
 */
export function generateZgsmAuthUrl(apiConfiguration: ApiConfiguration, uriScheme?: string): string {
	const stateId = Math.random().toString(36).substring(2) + Date.now().toString(36)
	return getZgsmAuthUrl(stateId, apiConfiguration, uriScheme)
}

/**
 * Initiate ZGSM login authentication process
 * @param apiConfiguration API configuration
 * @param uriScheme URI scheme
 */
export function initiateZgsmLogin(apiConfiguration: ApiConfiguration, uriScheme?: string): void {
	const authUrl = generateZgsmAuthUrl(apiConfiguration, uriScheme)
	// Send message to extension to handle authentication process
	vscode.postMessage({
		type: "zgsmLogin",
		authUrl,
		apiConfiguration,
	})
}
