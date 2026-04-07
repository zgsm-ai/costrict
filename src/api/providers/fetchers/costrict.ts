import axios from "axios"
import { v7 as uuidv7 } from "uuid"
import { COSTRICT_DEFAULT_HEADERS } from "../../../shared/headers"
import type { InviteCodeInfo, ICostrictModelResponseData, QuotaInfo } from "@roo-code/types"
import { readModels } from "./modelCache"
import { CostrictAuthService } from "../../../core/costrict/auth"

export async function getCostrictModels(baseUrl?: string, apiKey?: string, openAiHeaders?: Record<string, string>) {
	const requestId = uuidv7()

	try {
		if (!baseUrl) {
			return []
		}

		// Trim whitespace from baseUrl to handle cases where users accidentally include spaces
		const trimmedBaseUrl = baseUrl.trim()

		if (!URL.canParse(trimmedBaseUrl)) {
			return []
		}
		const { id } = (await CostrictAuthService.getInstance()?.getUserInfo()) || {}

		const config: Record<string, any> = {}
		const headers: Record<string, string> = {
			...COSTRICT_DEFAULT_HEADERS,
			...(openAiHeaders || {}),
			"X-Request-ID": requestId,
			"x-user-id": id || "",
		}

		if (apiKey) {
			headers["Authorization"] = `Bearer ${apiKey}`
		}

		if (Object.keys(headers).length > 0) {
			config["headers"] = headers
		}

		const response = await axios.get(`${baseUrl}/ai-gateway/api/v1/models`, config)
		const fullResponseData = response.data?.data || []
		return fullResponseData as Array<ICostrictModelResponseData>
	} catch (error) {
		console.warn(
			`Error fetching costrictModels from [${requestId}|${baseUrl}/ai-gateway/api/v1/models]:`,
			error.message,
		)
		const modelCache = (await readModels("costrict")) || {}

		return Object.keys(modelCache).map((key) => modelCache[key])
	}
}

export async function fetchCostrictQuotaInfo(baseUrl?: string, apiKey?: string): Promise<QuotaInfo | null> {
	const requestId = uuidv7()
	try {
		if (!baseUrl || !apiKey) {
			return null
		}

		// Trim whitespace from baseUrl to handle cases where users accidentally include spaces
		const trimmedBaseUrl = baseUrl.trim()

		if (!URL.canParse(trimmedBaseUrl)) {
			return null
		}
		const config: Record<string, any> = {}
		const headers: Record<string, string> = {
			...COSTRICT_DEFAULT_HEADERS,
			"X-Request-ID": requestId,
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
		}

		if (Object.keys(headers).length > 0) {
			config["headers"] = headers
		}
		const response = await axios.get(`${baseUrl}/quota-manager/api/v1/quota`, config)

		return response?.data?.data as QuotaInfo
	} catch (error) {
		console.warn(
			`Error fetching CostrictQuotaInfo from [${requestId}|${baseUrl}/quota-manager/api/v1/quota]:`,
			error.message,
		)
		return null
	}
}

export async function fetchCostrictInviteCode(baseUrl?: string, apiKey?: string): Promise<InviteCodeInfo | null> {
	const requestId = uuidv7()

	try {
		if (!baseUrl || !apiKey) {
			return null
		}

		// Trim whitespace from baseUrl to handle cases where users accidentally include spaces
		const trimmedBaseUrl = baseUrl.trim()

		if (!URL.canParse(trimmedBaseUrl)) {
			return null
		}

		const config: Record<string, any> = {}
		const headers: Record<string, string> = {
			...COSTRICT_DEFAULT_HEADERS,
			"X-Request-ID": requestId,
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
		}

		if (Object.keys(headers).length > 0) {
			config["headers"] = headers
		}
		const response = await axios.get(`${baseUrl}/oidc-auth/api/v1/manager/invite-code`, config)

		return response?.data?.data as InviteCodeInfo
	} catch (error) {
		console.warn(
			`Error fetching CostrictInviteCode from [${requestId}|${baseUrl}/quota-manager/api/v1/quota]:`,
			error.message,
		)
		return null
	}
}
