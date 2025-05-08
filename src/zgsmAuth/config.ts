class DefaultZgsmAuthConfig {
	static URL_TEMPLATES = {
		loginUrlTpl: "/realms/gw/protocol/openid-connect/auth",
		logoutUrlTpl: "/realms/gw/protocol/openid-connect/logout",
		tokenUrlTpl: "/realms/gw/protocol/openid-connect/token",
		redirectUriTpl: "/login/ok", // Authentication: Callback after successful login
	}

	baseUrl: string
	zgsmSite: string
	clientId: string
	clientSecret: string
	redirectUri: string
	tokenUrl: string
	loginUrl: string
	logoutUrl: string
	completionUrl: string
	downloadUrl: string
	// tokenIsValid
	isZgsmApiKeyValid: boolean

	constructor() {
		this.baseUrl = "https://zgsm.sangfor.com"
		this.zgsmSite = "https://zgsm.ai"
		this.clientId = "vscode"
		this.clientSecret = "jFWyVy9wUKKSkX55TDBt2SuQWl7fDM1l"
		this.completionUrl = "/v2"
		this.downloadUrl = "/downloads"
		this.loginUrl = "/realms/gw/protocol/openid-connect/auth"
		this.logoutUrl = "/realms/gw/protocol/openid-connect/logout"
		this.tokenUrl = "/realms/gw/protocol/openid-connect/token"
		this.redirectUri = "/login/ok"
		this.isZgsmApiKeyValid = true
	}

	getAuthUrls(baseUrl?: string) {
		return {
			redirectUri: `${baseUrl || this.baseUrl}${this.redirectUri}`,
			tokenUrl: `${baseUrl || this.baseUrl}${this.tokenUrl}`,
			loginUrl: `${baseUrl || this.baseUrl}${this.loginUrl}`,
			logoutUrl: `${baseUrl || this.baseUrl}${this.logoutUrl}`,
		}
	}
}

export const defaultZgsmAuthConfig = new DefaultZgsmAuthConfig()
