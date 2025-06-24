/**
 * Copyright (c) 2024 - Sangfor LTD.
 *
 * All rights reserved. Code licensed under the MIT license
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 */
import * as vscode from "vscode"
import { Logger } from "./log-util"
import { getLocalIP } from "./util"
import { Package } from "../../../src/schemas"

const baseEnvSetting = {
	baseUrl: "https://zgsm.sangfor.com", // Base URL of Shenma backend
	zgsmSite: "https://zgsm.ai", // Portal site of Shenma
	realmName: "gw", // Authentication: Keycloak tenant name
	clientId: "vscode", // Authentication: Client ID
	clientSecret: "jFWyVy9wUKKSkX55TDBt2SuQWl7fDM1l", // Authentication: Client secret

	loginUrl: "{baseUrl}/realms/{realmName}/protocol/openid-connect/auth",
	logoutUrl: "{baseUrl}/realms/{realmName}/protocol/openid-connect/logout",
	tokenUrl: "{baseUrl}/realms/{realmName}/protocol/openid-connect/token",
	redirectUri: "{baseUrl}/login/ok", // Authentication: Callback after successful login

	chatUrl: "{baseUrl}", // Chat service address
	completionUrl: "{baseUrl}/code-completion/api/v1", // Completion service address
	downloadUrl: "{baseUrl}/downloads", // Download address

	updateExtensionsTimeInterval: 1000 * 60 * 60 * 12,
}

const baseEnvClient = {
	ide: "vscode", // IDE name
	ideVersion: "", // IDE version
	extVersion: "", // Extension version
	hostIp: "", // Host IP
	apiKey: "", // API-KEY
}

// Define production environment configuration
let envSetting = baseEnvSetting
// Define client environment variables, which are automatically obtained by default and can be modified in scenarios such as testing
let envClient = baseEnvClient

/**
 * Parse variable placeholders {baseUrl}, {realmName} in template string
 */
// function replaceVars(template: string): string {
// 	let result = template.replace(/{baseUrl}/g, envSetting.baseUrl)
// 	result = result.replace(/{realmName}/g, envSetting.realmName)
// 	return result
// }
// /**
//  * Parse variable placeholders {baseUrl} in configuration
//  */
// function resolveEnvs() {
// 	envSetting.chatUrl = replaceVars(envSetting.chatUrl)
// 	envSetting.completionUrl = replaceVars(envSetting.completionUrl)
// 	envSetting.downloadUrl = replaceVars(envSetting.downloadUrl)
// 	envSetting.loginUrl = replaceVars(envSetting.loginUrl)
// 	envSetting.logoutUrl = replaceVars(envSetting.logoutUrl)
// 	envSetting.tokenUrl = replaceVars(envSetting.tokenUrl)
// 	envSetting.redirectUri = replaceVars(envSetting.redirectUri)
// }
/**
 * Automatically obtain client identification information
 */
function fetchEnvClient() {
	const extension = vscode.extensions.getExtension(Package.extensionId)
	if (!envClient.extVersion) {
		envClient.extVersion = extension?.packageJSON.version || ""
	}
	if (!envClient.ideVersion) {
		envClient.ideVersion = vscode.version || ""
	}
	if (!envClient.hostIp) {
		envClient.hostIp = getLocalIP()
	}
	Logger.log("envClient: ", envClient)
}
/**
 * Update local configuration, replace built-in variables with variables in local configuration
 * Use local environment variables (env-local.ts) to override
 */
function updateEnvByLocal() {
	try {
		// For local development, you can use env-local.ts, refer to env-dev.ts for changes
		const localEnv = require("./env-local") // Use env-local if configuration file exists
		envSetting = { ...envSetting, ...localEnv.envSetting }
		envClient = { ...envClient, ...localEnv.envClient }
	} catch {
		console.log()
	}
}

/**
 * Initialize system environment variables
 */
export function initEnv() {
	// Configuration priority: user settings (user) > local settings (local) > fallback settings (base)
	// 1. Load fallback settings
	envSetting = baseEnvSetting
	// 2. Load local settings
	updateEnvByLocal()
	// 3. Automatically obtain envClient related variables if not set in local-env.ts
	fetchEnvClient()
	// 4. Load user settings
	// updateEnv()
}
/**
 * Update user settings: update baseUrl, completionUrl and parse variables {baseUrl}
 * Update baseUrl according to user configuration content, use default data if user has not configured
 */
// export function updateEnv() {
// 	// const config = vscode.workspace.getConfiguration(configShenmaName)
// 	// let baseUrl: string | undefined = config.get("baseUrl")
// 	// if (!baseUrl) {
// 	// 	baseUrl = config.get("chatServer")
// 	// }
// 	// baseUrl = baseUrl?.replace(/\/+$/, "")
// 	// if (baseUrl) {
// 	// 	Logger.log(`User configuration updated baseUrl: ${baseUrl}`)
// 	// 	envSetting.baseUrl = baseUrl
// 	// }
// 	// const loginUrl: string | undefined = config.get("loginUrl")
// 	// if (loginUrl) {
// 	// 	Logger.log(`User setting updated loginUrl: ${loginUrl}`)
// 	// 	envSetting.loginUrl = loginUrl
// 	// }
// 	// const logoutUrl: string | undefined = config.get("logoutUrl")
// 	// if (logoutUrl) {
// 	// 	Logger.log(`User setting updated logoutUrl: ${logoutUrl}`)
// 	// 	envSetting.logoutUrl = logoutUrl
// 	// }
// 	// const tokenUrl: string | undefined = config.get("tokenUrl")
// 	// if (tokenUrl) {
// 	// 	Logger.log(`User setting updated tokenUrl: ${tokenUrl}`)
// 	// 	envSetting.tokenUrl = tokenUrl
// 	// }
// 	// resolveEnvs()
// 	// Logger.log("envSetting: ", envSetting)
// }
/**
 * Update the api-key of each software, using OAUTH2 access-token as authentication method
 */
export function updateApiKey(apikey: string) {
	envClient.apiKey = apikey
}

export { envSetting, envClient }
