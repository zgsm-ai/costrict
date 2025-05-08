import { vscode } from "./vscode"
import { ApiConfiguration } from "../../../src/shared/api"
import { generateZgsmAuthUrl } from "../../../src/shared/zgsmAuthUrl"

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
