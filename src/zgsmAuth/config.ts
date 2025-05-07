export interface AuthConfig {
	baseUrl: string
	clientId: string
	clientSecret: string
	loginUrl: string
	logoutUrl: string
	tokenUrl: string
	redirectUri: string
}

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

	constructor() {
		this.baseUrl = "https://zgsm.sangfor.com"
		this.zgsmSite = "https://zgsm.ai"
		this.clientId = "vscode"
		this.clientSecret = "jFWyVy9wUKKSkX55TDBt2SuQWl7fDM1l"
		this.redirectUri = `${this.baseUrl}${DefaultZgsmAuthConfig.URL_TEMPLATES.redirectUriTpl}`
		this.tokenUrl = `${this.baseUrl}${DefaultZgsmAuthConfig.URL_TEMPLATES.tokenUrlTpl}`
		this.loginUrl = `${this.baseUrl}${DefaultZgsmAuthConfig.URL_TEMPLATES.loginUrlTpl}`
		this.logoutUrl = `${this.baseUrl}${DefaultZgsmAuthConfig.URL_TEMPLATES.logoutUrlTpl}`
	}

	getAuthUrls(baseUrl?: string) {
		return {
			redirectUri: `${baseUrl || this.baseUrl}${DefaultZgsmAuthConfig.URL_TEMPLATES.redirectUriTpl}`,
			tokenUrl: `${baseUrl || this.baseUrl}${DefaultZgsmAuthConfig.URL_TEMPLATES.tokenUrlTpl}`,
			loginUrl: `${baseUrl || this.baseUrl}${DefaultZgsmAuthConfig.URL_TEMPLATES.loginUrlTpl}`,
			logoutUrl: `${baseUrl || this.baseUrl}${DefaultZgsmAuthConfig.URL_TEMPLATES.logoutUrlTpl}`,
		}
	}
}

export const defaultZgsmAuthConfig = new DefaultZgsmAuthConfig()
