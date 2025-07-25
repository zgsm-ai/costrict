import { parseJwt } from "../../../utils/zgsmUtils"
import { getClientId } from "../../../utils/getClientId"

export class ZgsmAuthConfig {
	private static instance: ZgsmAuthConfig

	private constructor() {
		// 私有构造函数，防止外部 new
	}

	public static getInstance(): ZgsmAuthConfig {
		if (!ZgsmAuthConfig.instance) {
			ZgsmAuthConfig.instance = new ZgsmAuthConfig()
		}
		return ZgsmAuthConfig.instance
	}

	/**
	 * 获取默认登录基础URL
	 */
	public getDefaultLoginBaseUrl(): string {
		return this.getDefaultApiBaseUrl()
	}

	/**
	 * 获取默认API基础URL
	 */
	public getDefaultApiBaseUrl(): string {
		return "https://zgsm.sangfor.com"
	}

	/**
	 * 获取轮询间隔时间（毫秒）
	 */
	public getWaitLoginPollingInterval(): number {
		return 5000 // 5秒
	}

	/**
	 * 获取token刷新间隔时间（毫秒）
	 */
	public getTokenRefreshInterval(refreshToken?: string, min = 3): number {
		if (!refreshToken) return 24 * 60 * 60 * 1000 // 24h

		const { exp } = parseJwt(refreshToken)
		const refreshInterval = Math.min((exp - 1800) * 1000 - Date.now(), 2147483647)
		return refreshInterval > 0 ? refreshInterval : min * 1000
	}

	/**
	 * 获取最大轮询次数
	 */
	public getMaxPollingAttempts(): number {
		return 120 // 10分钟（120 * 5秒）
	}

	/**
	 * 获取请求超时时间（毫秒）
	 */
	public getRequestTimeout(): number {
		return 10000 // 10秒
	}

	public getClientId(): string {
		return getClientId()
	}

	/**
	 * 获取Costrict site
	 */
	public getDefaultSite(): string {
		return "https://costrict.ai"
	}
}
