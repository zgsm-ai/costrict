/**
 * Copyright (c) 2024 - Sangfor LTD.
 *
 * All rights reserved. Code licensed under the MIT license
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 */
import axios from "axios"
import { Logger } from "./log-util"
import { ClineProvider } from "../../../src/core/webview/ClineProvider"
import { createHeaders } from "../../../src/auth/zgsmAuthHandler"

/**
 * Build REST API request headers with client identification and authentication API-KEY
 */
export const createAuthenticatedHeaders = (token = "", dict: Record<string, string> = {}) => {
	return createHeaders({
		"Content-Type": "application/json",
		"api-key": token,
		...dict,
	})
}

/**
 * Query the list of language suffixes
 */
export async function getLanguageExtensions() {
	const provider = await ClineProvider.getCacheInstances()
	if (!provider) throw new Error("provider is not defined")
	const { apiConfiguration } = await provider.getState()

	const url = `${apiConfiguration.zgsmBaseUrl}/api/configuration?belong_type=language&attribute_key=language_map`
	Logger.log("Request started: getLanguageExtensions()", url)
	return axios
		.get(url, {
			headers: createAuthenticatedHeaders(apiConfiguration.zgsmApiKey),
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
	const provider = await ClineProvider.getCacheInstances()
	if (!provider) throw new Error("provider is not defined")
	const { apiConfiguration } = await provider.getState()

	Logger.log("Request started: getExtensionsLatestVersion()")
	const url = `${apiConfiguration.zgsmBaseUrl}/vscode/ex-server-api/zgsm-ai/zgsm/latest`

	return axios
		.get(url, {
			headers: createAuthenticatedHeaders(apiConfiguration.zgsmApiKey),
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
