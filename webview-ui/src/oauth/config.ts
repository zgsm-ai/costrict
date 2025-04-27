import { defaultAuthConfig, generateAuthUrls } from "../config/auth"

// Complete AuthConfig interface, corresponding to the extended ApiConfiguration
export interface AuthConfig {
	baseUrl: string
	realmName: string
	clientId: string
	clientSecret: string
	loginUrl: string
	logoutUrl: string
	tokenUrl: string
	redirectUri: string
	completionUrl: string
	downloadUrl: string
}

class AuthConfigManager {
	private static instance: AuthConfigManager
	private config: AuthConfig

	// Private constructor to prevent instantiation outside the class
	private constructor() {
		this.config = this.initConfig(defaultAuthConfig)
	}

	// Initialize configuration by merging defaults with provided configuration
	private initConfig(config: Partial<AuthConfig>): AuthConfig {
		// Merge default values and provided configuration
		const baseConfig = {
			baseUrl: config.baseUrl || defaultAuthConfig.baseUrl,
			realmName: config.realmName || defaultAuthConfig.realmName,
			clientId: config.clientId || defaultAuthConfig.clientId,
			clientSecret: config.clientSecret || defaultAuthConfig.clientSecret,
			completionUrl: config.completionUrl || defaultAuthConfig.completionUrl,
			downloadUrl: config.downloadUrl || defaultAuthConfig.downloadUrl,
		}

		// Use provided URLs directly, or generate from baseUrl if not provided
		const urls =
			config.loginUrl && config.logoutUrl && config.tokenUrl && config.redirectUri
				? {
						loginUrl: config.loginUrl,
						logoutUrl: config.logoutUrl,
						tokenUrl: config.tokenUrl,
						redirectUri: config.redirectUri,
					}
				: generateAuthUrls(baseConfig as AuthConfig)

		// Return the merged configuration
		return {
			...baseConfig,
			...urls,
		}
	}

	// Get the singleton instance of AuthConfigManager
	public static getInstance(): AuthConfigManager {
		if (!AuthConfigManager.instance) {
			AuthConfigManager.instance = new AuthConfigManager()
		}
		return AuthConfigManager.instance
	}

	// Get the current authentication configuration
	public getConfig(): AuthConfig {
		return this.config
	}

	// Update the authentication configuration with new values
	public updateConfig(newConfig: Partial<AuthConfig>): void {
		// Update only the provided configuration items
		const updatedConfig = { ...this.config }

		// Update base URL and authentication information
		if (newConfig.baseUrl) updatedConfig.baseUrl = newConfig.baseUrl
		if (newConfig.realmName) updatedConfig.realmName = newConfig.realmName
		if (newConfig.clientId) updatedConfig.clientId = newConfig.clientId
		if (newConfig.clientSecret) updatedConfig.clientSecret = newConfig.clientSecret

		// Directly update URLs if provided
		if (newConfig.loginUrl) updatedConfig.loginUrl = newConfig.loginUrl
		if (newConfig.logoutUrl) updatedConfig.logoutUrl = newConfig.logoutUrl
		if (newConfig.tokenUrl) updatedConfig.tokenUrl = newConfig.tokenUrl
		if (newConfig.redirectUri) updatedConfig.redirectUri = newConfig.redirectUri

		// If a complete set of URLs is not provided but baseUrl is provided, regenerate URLs
		if (
			newConfig.baseUrl &&
			!(newConfig.loginUrl && newConfig.logoutUrl && newConfig.tokenUrl && newConfig.redirectUri)
		) {
			const urls = generateAuthUrls({
				...updatedConfig,
				baseUrl: newConfig.baseUrl,
			})
			updatedConfig.loginUrl = urls.loginUrl
			updatedConfig.logoutUrl = urls.logoutUrl
			updatedConfig.tokenUrl = urls.tokenUrl
			updatedConfig.redirectUri = urls.redirectUri
		}

		this.config = updatedConfig
	}
}

export const authConfigManager = AuthConfigManager.getInstance()
export const getAuthConfig = () => authConfigManager.getConfig()
export const updateAuthConfig = (config: Partial<AuthConfig>) => authConfigManager.updateConfig(config)
