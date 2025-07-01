/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Copyright (c) 2024 - Sangfor LTD.
 *
 * All rights reserved. Code licensed under the MIT license
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 */
import axios from "axios"
import { envSetting, envClient } from "./env"
import { Logger } from "./log-util"

/**
 * Build REST API request headers with client identification and authentication API-KEY
 */
export function createAuthenticatedHeaders(dict: Record<string, any> = {}): Record<string, any> {
	const headers = {
		ide: envClient.ide,
		"ide-version": envClient.extVersion,
		"ide-real-version": envClient.ideVersion,
		"host-ip": envClient.hostIp,
		"api-key": envClient.apiKey,
		...dict,
	}
	return headers
}

/**
 * Query the list of language suffixes
 */
export async function getLanguageExtensions() {
	const url = `${envSetting.baseUrl}/api/configuration?belong_type=language&attribute_key=language_map`
	Logger.log("Request started: getLanguageExtensions()", url)
	return axios
		.get(url, {
			headers: createAuthenticatedHeaders({
				"Content-Type": "application/json",
			}),
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
	Logger.log("Request started: getExtensionsLatestVersion()")
	const url = `${envSetting.baseUrl}/vscode/ex-server-api/zgsm-ai/zgsm/latest`

	return axios
		.get(url, {
			headers: createAuthenticatedHeaders({
				"Content-Type": "application/json",
			}),
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
