import { defaultZgsmAuthConfig } from "../zgsmAuth/config"
import { ApiConfiguration } from "./api"

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function getZgsmAuthUrl(stateId: string, apiConfiguration?: ApiConfiguration, uriScheme?: string) {
	// const { loginUrl, clientId, redirectUri } = getAuthConfig()
	const scopes = ["openid", "profile", "email"]
	const baseUrl = `${apiConfiguration?.zgsmBaseUrl || apiConfiguration?.zgsmDefaultBaseUrl || defaultZgsmAuthConfig.baseUrl}`
	const params = [
		["response_type", "code"],
		["client_id", `${apiConfiguration?.zgsmClientId}`],
		["redirect_uri", `${baseUrl}${apiConfiguration?.zgsmRedirectUri}`],
		["state", stateId],
		["scope", scopes.join(" ")],
	]
	const searchParams = new URLSearchParams(params)

	return `${baseUrl}${apiConfiguration?.zgsmLoginUrl}?${searchParams.toString()}`
}

/**
 * Generate ZGSM authentication URL
 * @param uriScheme URI scheme
 * @returns Authentication URL
 */
export function generateZgsmAuthUrl(apiConfiguration: ApiConfiguration, uriScheme?: string): string {
	const stateId = Math.random().toString(36).substring(2) + Date.now().toString(36)
	return getZgsmAuthUrl(stateId, apiConfiguration, uriScheme)
}
