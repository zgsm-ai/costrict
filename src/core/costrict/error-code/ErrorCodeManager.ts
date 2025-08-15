import axios from "axios"
import { jwtDecode } from "jwt-decode"
import crypto from "crypto"

import { t } from "../../../i18n"
import { ClineProvider } from "../../webview/ClineProvider"
import { TelemetryService } from "@roo-code/telemetry"
import { ZgsmAuthConfig } from "../auth"

export interface IErrorMap {
	[code: string]: {
		message: string
		solution: string
	}
}

export class ErrorCodeManager {
	private static instance: ErrorCodeManager
	private errorMap: IErrorMap = {}
	private provider!: ClineProvider

	private constructor() {}

	public static getInstance(): ErrorCodeManager {
		if (!ErrorCodeManager.instance) {
			ErrorCodeManager.instance = new ErrorCodeManager()
		}
		return ErrorCodeManager.instance
	}

	/**
	 * 初始化错误码管理器
	 * @param provider ClineProvider 实例
	 */
	public async initialize(provider: ClineProvider): Promise<void> {
		try {
			this.provider = provider
			await this.refreshErrorCodes()
		} catch (error) {
			console.error("Failed to initialize ErrorCodeManager:", error)
		}
	}

	/**
	 * 刷新错误码映射
	 */
	public async refreshErrorCodes(): Promise<void> {
		try {
			// 清空现有的错误码映射
			this.errorMap = {}
			// 获取远程错误码
			const remoteErrorMap = await this.fetchRemoteCodes()
			this.errorMap = remoteErrorMap
		} catch (error) {
			console.error("Failed to refresh error codes:", error)
		}
	}

	/**
	 * 从远程获取错误码
	 * @returns Promise<IErrorMap> 远程错误码映射
	 */
	private async fetchRemoteCodes(): Promise<IErrorMap> {
		try {
			const { language, apiConfiguration } = await this.provider.getState()
			const baseUrl = apiConfiguration.zgsmBaseUrl || ZgsmAuthConfig.getInstance().getDefaultApiBaseUrl()
			const response = await axios.get(`${baseUrl}/shenma/api/v1/error-code/error_codes_${language}.json`)
			return response.data
		} catch (error) {
			console.error("Failed to fetch remote error codes:", error)
			// 任何异常情况都返回空对象作为降级处理
			return {}
		}
	}
	/**
	 * 解析ZGSM JWT token信息
	 * @param zgsmAccessToken JWT token
	 * @returns 包含过期时间、更新时间和是否旧模式登录状态的对象
	 */
	private parseZgsmTokenInfo(zgsmAccessToken?: string): {
		zgsmApiKeyExpiredAt: string
		zgsmApiKeyUpdatedAt: string
		isOldModeLoginState: boolean
	} {
		if (!zgsmAccessToken) {
			return {
				zgsmApiKeyExpiredAt: "",
				zgsmApiKeyUpdatedAt: "",
				isOldModeLoginState: false,
			}
		}

		try {
			const { exp, iat, universal_id } = jwtDecode(zgsmAccessToken) as any
			return {
				zgsmApiKeyExpiredAt: new Date(exp * 1000).toLocaleString(),
				zgsmApiKeyUpdatedAt: new Date(iat * 1000).toLocaleString(),
				isOldModeLoginState: !universal_id,
			}
		} catch (error) {
			console.error("Failed to decode ZGSM access token:", error)
			return {
				zgsmApiKeyExpiredAt: "",
				zgsmApiKeyUpdatedAt: "",
				isOldModeLoginState: false,
			}
		}
	}

	/**
	 * 解析错误响应
	 * @param errorCode 错误码
	 * @returns 格式化的错误信息对象
	 */
	public async parseResponse(error: any, taskId: string, instanceId: string): Promise<string> {
		const isHtml = error?.headers && error.headers["content-type"] && error.headers["content-type"] === "text/html"
		let rawError = error.error?.metadata?.raw ? JSON.stringify(error.error.metadata.raw, null, 2) : error.message
		let status = error.status as number
		const unknownError = { message: t("apiErrors:status.unknown"), solution: t("apiErrors:solution.unknown") }
		let jsonBody = rawError.split(", response body: {")[1] || ""
		jsonBody = jsonBody ? `{${jsonBody}` : ""
		const zgsmParse = (errStr: string, rawError: string) => {
			try {
				const { code, message } = JSON.parse(errStr)
				this.provider?.log(
					`[Costrict#apiErrors] task ${taskId}.${instanceId} SerializeError Raw Failed: ${message || rawError}\n\n (${code})`,
				)
				return { message, code }
			} catch (error) {
				console.warn("[zgsmParse]", error.message)

				return { message: "", code: "" }
			}
		}
		if (!jsonBody && zgsmParse(error.message, error.message).code !== "") {
			jsonBody = error.message
		}
		const { apiConfiguration } = await this.provider.getState()
		const { zgsmApiKeyExpiredAt, zgsmApiKeyUpdatedAt, isOldModeLoginState } = this.parseZgsmTokenInfo(
			apiConfiguration.zgsmAccessToken,
		)
		const defaultError = {
			401: {
				message: isOldModeLoginState
					? t("apiErrors:status.old_mode_token")
					: t("apiErrors:status.401", {
							exp: zgsmApiKeyExpiredAt || "-",
							iat: zgsmApiKeyUpdatedAt || "-",
						}),
				solution: t("apiErrors:solution.401"),
			},
			400: { message: rawError || t("apiErrors:status.400"), solution: t("apiErrors:solution.400") },
			403: { message: rawError || t("apiErrors:status.403"), solution: t("apiErrors:solution.403") },
			404: { message: isHtml ? t("apiErrors:status.404") : rawError, solution: t("apiErrors:solution.404") },
			429: { message: rawError || t("apiErrors:status.429"), solution: t("apiErrors:solution.429") },
			500: { message: isHtml ? t("apiErrors:status.500") : rawError, solution: t("apiErrors:solution.500") },
			502: { message: isHtml ? t("apiErrors:status.502") : rawError, solution: t("apiErrors:solution.502") },
			503: { message: isHtml ? t("apiErrors:status.503") : rawError, solution: t("apiErrors:solution.503") },
			504: { message: isHtml ? t("apiErrors:status.504") : rawError, solution: t("apiErrors:solution.504") },
			undefined: {
				message: rawError || t("apiErrors:status.undefined"),
				solution: t("apiErrors:solution.undefined"),
			},
		} as Record<string | number, { message: string; solution: string }>
		// 需要鉴权的错误码列表
		const authRequiredCodes = [
			"ai-gateway.unauthorized",
			"quota-manager.unauthorized",
			"quota-manager.token_invalid",
			"quota-manager.voucher_expired",
		]
		if (jsonBody) {
			const { code } = zgsmParse(jsonBody, rawError)
			let { message, solution } = this.errorMap[code] || unknownError
			if (authRequiredCodes.includes(code)) {
				rawError = message
				message = defaultError["401"].message
				solution = defaultError["401"].solution
				error.status = status = 401
			} else if (code === "ai-gateway.insufficient_quota" || code === "ai-gateway.star_required") {
				const hash = await this.hashToken(apiConfiguration.zgsmAccessToken || "")
				const baseurl = ZgsmAuthConfig.getInstance().getDefaultLoginBaseUrl()
				const isQuota = code === "ai-gateway.insufficient_quota"

				const solution1 = isQuota
					? t("apiErrors:solution.ai-gateway.insufficientCredits")
					: t("apiErrors:solution.ai-gateway.pleaseStarProject")
				const solution2 = isQuota
					? t("apiErrors:solution.ai-gateway.quotaAcquisition")
					: t("apiErrors:solution.ai-gateway.howToStar")

				const checkRemainingQuotaStr = !isQuota
					? `${t("apiErrors:solution.quota-check.checkRemainingQuota")} “ <a href='${baseurl}/credit/manager/credits?state=${hash}' style="text-decoration: none">${t("apiErrors:solution.quota-check.creditUsageStats")}</a> ” ${t("apiErrors:solution.quota-check.viewDetails")}`
					: ""

				solution = `\n\n
<span style="color:#E64545">${solution1}</span> <a href='${baseurl}/credit/manager/md-preview?state=${hash}' style="text-decoration: none">${solution2}</a>

${checkRemainingQuotaStr}
`
			}
			TelemetryService.instance.captureError(`ApiError_${code}`)
			this.provider.log(`[Costrict#apiErrors] task ${taskId}.${instanceId} Raw Error: ${rawError}`)
			return `${t("apiErrors:request.error_details")}\n\n${message}\n\n${t("apiErrors:request.solution")}\n${solution}`
		}
		const { message, solution } = defaultError[status] || unknownError
		if (defaultError[status]) {
			TelemetryService.instance.captureError(
				status === undefined ? `ApiError_unknown` : `ApiError_status_${status}`,
			)
		} else {
			TelemetryService.instance.captureError(`ApiError_unknown`)
		}
		this.provider.log(`[Costrict#apiErrors] task ${taskId}.${instanceId} Raw Error: ${rawError}`)
		return `${t("apiErrors:request.error_details")}\n\n${message}\n\n${t("apiErrors:request.solution")}\n${solution}`
	}
	private async hashToken(token: string) {
		const encoder = new TextEncoder()
		const data = encoder.encode(token)
		const hashBuffer = await crypto.subtle.digest("SHA-256", data)
		return Array.from(new Uint8Array(hashBuffer))
			.map((b) => b.toString(16).padStart(2, "0"))
			.join("")
	}
}
