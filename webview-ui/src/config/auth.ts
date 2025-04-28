export interface AuthConfig {
	baseUrl: string
	zgsmSite: string
	realmName: string
	clientId: string
	clientSecret: string
	loginUrl: string
	logoutUrl: string
	tokenUrl: string
	redirectUri: string
	chatUrl: string
	completionUrl: string
	downloadUrl: string
}

export interface ClientConfig {
	ide: string
	ideVersion: string
	extVersion: string
	hostIp: string
	apiKey: string
	clientId: string
	clientSecret: string
	redirectUri: string
	loginUrl: string
	logoutUrl: string
	tokenUrl: string
	chatUrl: string
	completionUrl: string
	downloadUrl: string
}

export const defaultClientConfig: ClientConfig = {
	ide: "vscode",
	ideVersion: "",
	extVersion: "",
	hostIp: "",
	apiKey: "",
	clientId: "",
	clientSecret: "",
	redirectUri: "",
	loginUrl: "",
	logoutUrl: "",
	tokenUrl: "",
	chatUrl: "", // Will be generated
	completionUrl: "", // Will be generated
	downloadUrl: "", // Will be generated
}

export const defaultAuthConfig: AuthConfig = {
	baseUrl: "https://zgsm.sangfor.com", // Base URL of Zhuge Shenma backend
	zgsmSite: "https://zgsm.ai", // Portal site of Zhuge Shenma
	realmName: "gw", // Authentication: Keycloak tenant name
	clientId: "vscode", // Authentication: Client ID
	clientSecret: "jFWyVy9wUKKSkX55TDBt2SuQWl7fDM1l", // Authentication: Client secret
	loginUrl: "", // Will be generated
	logoutUrl: "", // Will be generated
	tokenUrl: "", // Will be generated
	redirectUri: "", // Will be generated
	chatUrl: "", // Will be generated
	completionUrl: "", // Will be generated
	downloadUrl: "", // Will be generated
}

// URL templates
const URL_TEMPLATES = {
	login: "{baseUrl}/realms/{realmName}/protocol/openid-connect/auth",
	logout: "{baseUrl}/realms/{realmName}/protocol/openid-connect/logout",
	token: "{baseUrl}/realms/{realmName}/protocol/openid-connect/token",
	redirect: "{baseUrl}/login/ok",
	chat: "{baseUrl}",
	completion: "{baseUrl}/v2",
	download: "{baseUrl}/downloads",
}
// 导出初始化后的配置
export let authConfig = { ...defaultAuthConfig }
export let clientConfig = { ...defaultClientConfig }

authConfig = generateAuthUrls({})

function replaceVars(template: string, config: AuthConfig): string {
	let result = template.replace(/{baseUrl}/g, config.baseUrl)
	result = result.replace(/{realmName}/g, config.realmName)
	return result
}

// 更新客户端配置
export function updateClientConfig(config: Partial<ClientConfig>) {
	Object.assign(clientConfig, config)
}

// 更新认证配置
export function updateAuthConfig(config: Partial<AuthConfig>) {
	const newConfig = { ...authConfig, ...config }
	authConfig = generateAuthUrls(newConfig)
}

export const getClientConfig = () => clientConfig
export const getAuthConfig = (opt = {}) => generateAuthUrls(opt)

export function generateAuthUrls(config: Partial<AuthConfig>): AuthConfig {
	const fullConfig = { ...authConfig, ...config }
	return {
		...fullConfig,
		loginUrl: replaceVars(URL_TEMPLATES.login, fullConfig),
		logoutUrl: replaceVars(URL_TEMPLATES.logout, fullConfig),
		tokenUrl: replaceVars(URL_TEMPLATES.token, fullConfig),
		redirectUri: replaceVars(URL_TEMPLATES.redirect, fullConfig),
		chatUrl: replaceVars(URL_TEMPLATES.chat, fullConfig),
		completionUrl: replaceVars(URL_TEMPLATES.completion, fullConfig),
		downloadUrl: replaceVars(URL_TEMPLATES.download, fullConfig),
	}
}
