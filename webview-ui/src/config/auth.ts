export const authConfig = {
	baseUrl: "https://zgsm.sangfor.com", // Base URL of Zhuge Shenma backend
	zgsmSite: "https://zgsm.ai", // Portal site of Zhuge Shenma
	realmName: "gw", // Authentication: Keycloak tenant name
	clientId: "vscode", // Authentication: Client ID
	clientSecret: "jFWyVy9wUKKSkX55TDBt2SuQWl7fDM1l", // Authentication: Client secret

	loginUrl: "{baseUrl}/realms/{realmName}/protocol/openid-connect/auth",
	logoutUrl: "{baseUrl}/realms/{realmName}/protocol/openid-connect/logout",
	tokenUrl: "{baseUrl}/realms/{realmName}/protocol/openid-connect/token",
	redirectUri: "{baseUrl}/login/ok", // Authentication: Callback after successful login
}

function replaceVars(template: string): string {
	let result = template.replace(/{baseUrl}/g, authConfig.baseUrl)
	result = result.replace(/{realmName}/g, authConfig.realmName)
	return result
}

export function getAuthUrls() {
	return {
		loginUrl: replaceVars(authConfig.loginUrl),
		logoutUrl: replaceVars(authConfig.logoutUrl),
		tokenUrl: replaceVars(authConfig.tokenUrl),
		redirectUri: replaceVars(authConfig.redirectUri),
	}
}
