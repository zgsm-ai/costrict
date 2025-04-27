/**
 * Copyright (c) 2024 - Sangfor LTD.
 *
 * All rights reserved. Code licensed under the MIT license
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 */
import axios from "axios"
import { getClientConfig, getAuthConfig } from "./env"
import { Logger } from "./log-util"

/**
 * Build REST API request headers with client identification and authentication API-KEY
 */
export const createAuthenticatedHeaders = (token?: string, dict: Record<string, string> = {}) => {
	return {
		ide: clientConfig.ide,
		"ide-version": clientConfig.extVersion,
		"ide-real-version": clientConfig.ideVersion,
		"host-ip": clientConfig.hostIp,
		"api-key": token,
		"Content-Type": "application/json",
		...dict,
	}
}

/**
 * Query the list of language suffixes
 */
export async function getLanguageExtensions() {
	const authConfig = getAuthConfig()
	const clientConfig = getClientConfig()

	const url = `${authConfig.baseUrl}/api/configuration?belong_type=language&attribute_key=language_map`
	Logger.log("Request started: getLanguageExtensions()", url)
	return axios
		.get(url, {
			headers: createAuthenticatedHeaders(clientConfig.apiKey),
		})
		.then((res) => {
			if (res.status === 200 && Array.isArray(res.data?.data)) {
				Logger.log("Request succeeded: getLanguageExtensions()", res.data)
				return res.data
			}
			Logger.error(
				`Request failed: getLanguageExtensions() status code:${res.status} data.code:${res.data?.code}`,
			)
			return undefined
		})
		.catch((err) => {
			Logger.error("Request error: getLanguageExtensions", err)
			return undefined
		})
}

/**
 * Check if the extension plugin has a new version
 */
export async function getExtensionsLatestVersion() {
	const authConfig = getAuthConfig()
	const clientConfig = getClientConfig()

	Logger.log("Request started: getExtensionsLatestVersion()")
	const url = `${authConfig.baseUrl}/vscode/ex-server-api/zgsm-ai/zgsm/latest`

	return axios
		.get(url, {
			headers: createAuthenticatedHeaders(clientConfig.apiKey),
		})
		.then((res) => {
			if (res.status === 200 && res.data?.version) {
				Logger.log("Request succeeded: getExtensionsLatestVersion()", res.data.version)
				return res.data
			}
			Logger.error(
				`Request failed: getExtensionsLatestVersion() status code:${res.status} data.version:${res.data?.version}`,
			)
			return undefined
		})
		.catch((err) => {
			Logger.error("Request error: getExtensionsLatestVersion" + err)
			return undefined
		})
}
