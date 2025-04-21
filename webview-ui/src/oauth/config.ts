import { defaultAuthConfig, getAuthUrls, AuthConfig } from "../config/auth"

class AuthConfigManager {
	private static instance: AuthConfigManager
	private config: AuthConfig

	private constructor() {
		this.config = this.initConfig(defaultAuthConfig)
	}

	private initConfig(config: AuthConfig) {
		const urls = getAuthUrls(config)
		return {
			baseUrl: config.baseUrl,
			realmName: config.realmName,
			clientId: config.clientId,
			clientSecret: config.clientSecret,
			loginUrl: urls.loginUrl,
			logoutUrl: urls.logoutUrl,
			tokenUrl: urls.tokenUrl,
			redirectUri: urls.redirectUri,
		}
	}

	public static getInstance(): AuthConfigManager {
		if (!AuthConfigManager.instance) {
			AuthConfigManager.instance = new AuthConfigManager()
		}
		return AuthConfigManager.instance
	}

	public getConfig(): AuthConfig {
		return this.config
	}

	public updateConfig(newConfig: Partial<AuthConfig>): void {
		this.config = this.initConfig({
			...this.config,
			...newConfig,
		})
	}
}

export const authConfigManager = AuthConfigManager.getInstance()
export const getAuthConfig = () => authConfigManager.getConfig()
export const updateAuthConfig = (config: Partial<AuthConfig>) => authConfigManager.updateConfig(config)
