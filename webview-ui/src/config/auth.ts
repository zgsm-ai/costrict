export interface AuthConfig {
	baseUrl: string
	realmName: string
	clientId: string
	clientSecret: string
	loginUrl: string
	logoutUrl: string
	tokenUrl: string
	redirectUri: string
}

export const defaultAuthConfig = {
	baseUrl: "https://zgsm.sangfor.com", // Base URL of Shenma backend
	zgsmSite: "https://zgsm.ai", // Portal site of Shenma
	realmName: "gw", // Authentication: Keycloak tenant name
	clientId: "vscode", // Authentication: Client ID
	clientSecret: "jFWyVy9wUKKSkX55TDBt2SuQWl7fDM1l", // Authentication: Client secret

	loginUrlTpl: "{baseUrl}/realms/{realmName}/protocol/openid-connect/auth",
	logoutUrlTpl: "{baseUrl}/realms/{realmName}/protocol/openid-connect/logout",
	tokenUrlTpl: "{baseUrl}/realms/{realmName}/protocol/openid-connect/token",
	redirectUriTpl: "{baseUrl}/login/ok", // Authentication: Callback after successful login
}

function replaceVars(template: string, config: AuthConfig): string {
	let result = template.replace(/{baseUrl}/g, config.baseUrl)
	result = result.replace(/{realmName}/g, config.realmName)
	return result
}

export function getAuthUrls(config: AuthConfig) {
	return {
		loginUrl: replaceVars(defaultAuthConfig.loginUrlTpl, config),
		logoutUrl: replaceVars(defaultAuthConfig.logoutUrlTpl, config),
		tokenUrl: replaceVars(defaultAuthConfig.tokenUrlTpl, config),
		redirectUri: replaceVars(defaultAuthConfig.redirectUriTpl, config),
	}
}
