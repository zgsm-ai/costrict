import { ClineProvider } from "../core/webview/ClineProvider"

class DefaultZgsmAuthConfig {
	static URL_TEMPLATES = {
		loginUrlTpl: "/realms/gw/protocol/openid-connect/auth",
		logoutUrlTpl: "/realms/gw/protocol/openid-connect/logout",
		tokenUrlTpl: "/realms/gw/protocol/openid-connect/token",
		redirectUriTpl: "/login/ok", // Authentication: Callback after successful login
	}

	prevBaseUrl: string
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
		this.baseUrl = process.env?.ZGSM_BASE_URL || "https://zgsm.sangfor.com"
		this.prevBaseUrl = this.baseUrl
		this.zgsmSite = "https://costrict.ai"
		this.clientId = "vscode"
		this.clientSecret = "jFWyVy9wUKKSkX55TDBt2SuQWl7fDM1l"
		this.completionUrl = "/code-completion/api/v1"
		this.downloadUrl = "/downloads"
		this.loginUrl = DefaultZgsmAuthConfig.URL_TEMPLATES.loginUrlTpl
		this.logoutUrl = DefaultZgsmAuthConfig.URL_TEMPLATES.logoutUrlTpl
		this.tokenUrl = DefaultZgsmAuthConfig.URL_TEMPLATES.tokenUrlTpl
		this.redirectUri = DefaultZgsmAuthConfig.URL_TEMPLATES.redirectUriTpl
		this.isZgsmApiKeyValid = true
	}

	async getAuthUrls(baseUrl = this.baseUrl) {
		baseUrl = baseUrl || this.baseUrl
		const config = {} as {
			redirectUri?: string
			tokenUrl?: string
			loginUrl?: string
			logoutUrl?: string
		}

		if (this.prevBaseUrl !== baseUrl) {
			Object.assign(config, await this.fetchZgsmAuthConfiguration(baseUrl))
			this.prevBaseUrl = baseUrl
		}

		return {
			redirectUri: config?.redirectUri || `${baseUrl || this.baseUrl}${this.redirectUri}`,
			tokenUrl: config?.tokenUrl || `${baseUrl || this.baseUrl}${this.tokenUrl}`,
			loginUrl: config?.loginUrl || `${baseUrl || this.baseUrl}${this.loginUrl}`,
			logoutUrl: config?.logoutUrl || `${baseUrl || this.baseUrl}${this.logoutUrl}`,
		}
	}

	async fetchZgsmAuthConfiguration(baseUrl?: string): Promise<{
		loginUrl?: string
		tokenUrl?: string
		logoutUrl?: string
		redirectUri?: string
	}> {
		try {
			const response = await fetch(
				`${baseUrl}/api/configuration?belong_type=authenticate&attribute_key=custom_url`,
			)
			const responseData = await response.json()

			if (!responseData.data || responseData.data.length === 0) {
				return {}
			}
			return responseData.data[0].attribute_value || {}
		} catch (error) {
			return {}
		}
	}

	async initProviderConfig(provider: ClineProvider, config: any) {
		await provider?.setValues({
			...config,
			zgsmSite: this.zgsmSite,
			zgsmDefaultBaseUrl: this.baseUrl,
			zgsmLoginUrl: this.loginUrl,
			zgsmLogoutUrl: this.logoutUrl,
			zgsmTokenUrl: this.tokenUrl,
			zgsmCompletionUrl: this.completionUrl,
			zgsmDownloadUrl: this.downloadUrl,
			zgsmRedirectUri: this.redirectUri,
			zgsmClientId: this.clientId,
			zgsmClientSecret: this.clientSecret,
		})

		await provider.postStateToWebview()
	}
}

export const defaultZgsmAuthConfig = new DefaultZgsmAuthConfig()
