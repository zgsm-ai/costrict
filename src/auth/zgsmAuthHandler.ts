import * as vscode from "vscode"
import { ClineProvider } from "../core/webview/ClineProvider"
import { ApiConfiguration } from "../shared/api"
import axios from "axios"
import * as os from "os"
import * as querystring from "querystring"

/**
 * 获取本地IP地址
 * @returns 本地IP地址，如果找不到则返回空字符串
 */
function getLocalIP(): string {
	try {
		const interfaces = os.networkInterfaces()
		let ipAddress = ""

		for (const interfaceName in interfaces) {
			const networkInterface = interfaces[interfaceName]
			if (!networkInterface) continue

			for (const iface of networkInterface) {
				// 筛选IPv4且非内部地址
				if (iface.family === "IPv4" && !iface.internal) {
					ipAddress = iface.address
					break
				}
			}
			if (ipAddress) break // 找到第一个有效IP后退出
		}

		return ipAddress || ""
	} catch (error) {
		console.error("Failed to get local IP:", error)
		return ""
	}
}

/**
 * 创建请求头部，包含客户端识别信息
 * @param dict 额外的请求头信息
 * @returns 完整的请求头对象
 */
function createHeaders(dict: Record<string, any> = {}): Record<string, any> {
	// 获取扩展信息
	const extension =
		vscode.extensions.getExtension("zgsm-ai.zgsm") || vscode.extensions.getExtension("rooveterinaryinc.roo-cline")
	const extVersion = extension?.packageJSON.version || ""
	const ideVersion = vscode.version || ""
	const hostIp = getLocalIP()

	const headers = {
		ide: "vscode",
		"ide-version": extVersion,
		"ide-real-version": ideVersion,
		"host-ip": hostIp,
		...dict,
	}
	return headers
}

/**
 * 处理 ZGSM OAuth 回调
 * @param code 授权码
 * @param state 状态值
 * @param provider ClineProvider 实例
 */
export async function handleZgsmAuthCallback(code: string, state: string, provider: ClineProvider): Promise<void> {
	try {
		// 获取当前的 API 配置
		const { apiConfiguration } = await provider.getState()
		// 获取访问令牌
		const tokenResponse = await getAccessToken(code, { ...apiConfiguration, apiProvider: "zgsm" })

		if (tokenResponse.status === 200 && tokenResponse.data && tokenResponse.data.access_token) {
			const tokenData = tokenResponse.data

			// 使用 token 更新 API 配置
			if (apiConfiguration) {
				const updatedConfig: ApiConfiguration = {
					...apiConfiguration,
					apiProvider: "zgsm",
					zgsmApiKey: tokenData.access_token,
				}

				// 更新 API 配置
				await provider.updateApiConfiguration(updatedConfig)

				// 保存更新后的配置
				await provider.upsertApiConfiguration("zgsm", updatedConfig)
			}

			// 发送更新的状态到 webview
			provider.postMessageToWebview({ type: "state", state: await provider.getStateToPostToWebview() })

			// 显示成功消息
			vscode.window.showInformationMessage("zgsm login successful")
		} else {
			throw new Error("获取令牌失败")
		}
	} catch (error) {
		vscode.window.showErrorMessage(`ZGSM 授权失败: ${error}`)
	}
}

/**
 * 处理 ZGSM OAuth 消息
 * @param authUrl 认证 URL
 * @param apiConfiguration API 配置
 * @param provider ClineProvider 实例
 */
export async function handleZgsmLogin(
	authUrl: string,
	apiConfiguration: ApiConfiguration,
	provider: ClineProvider,
): Promise<void> {
	// 打开认证链接
	await vscode.env.openExternal(vscode.Uri.parse(authUrl))

	// 保存 apiConfiguration，以便在认证成功后使用
	if (apiConfiguration) {
		await provider.updateApiConfiguration(apiConfiguration)
	}

	// 向 webview 发送消息，通知认证已发起
	provider.postMessageToWebview({ type: "state", state: await provider.getStateToPostToWebview() })
}

/**
 * 获取访问令牌
 * @param code 授权码
 * @param apiConfiguration API配置
 * @returns 包含访问令牌的响应
 */
export async function getAccessToken(code: string, apiConfiguration?: ApiConfiguration) {
	try {
		// 优先使用 apiConfiguration 中的配置，如果不存在则使用环境设置
		const clientId = apiConfiguration?.zgsmClientId || "vscode"
		const clientSecret = apiConfiguration?.zgsmClientSecret || "jFWyVy9wUKKSkX55TDBt2SuQWl7fDM1l"
		const redirectUri = apiConfiguration?.zgsmRedirectUri || `${apiConfiguration?.zgsmBaseUrl}/login/ok`
		const tokenUrl =
			apiConfiguration?.zgsmTokenUrl ||
			(apiConfiguration?.zgsmBaseUrl
				? `${apiConfiguration.zgsmBaseUrl}/realms/gw/protocol/openid-connect/token`
				: "https://zgsm.sangfor.com/realms/gw/protocol/openid-connect/token")

		// 设置请求参数
		const params = {
			client_id: clientId,
			client_secret: clientSecret,
			code: code,
			grant_type: "authorization_code",
			redirect_uri: redirectUri,
		}

		// 使用querystring将对象转换为application/x-www-form-urlencoded格式
		const formData = querystring.stringify(params)

		// 发送请求获取token，添加创建的请求头
		const res = await axios.post(tokenUrl, formData, {
			headers: createHeaders({
				"Content-Type": "application/x-www-form-urlencoded",
			}),
		})

		// 成功获取token
		if (res.status === 200 && res.data && res.data.access_token) {
			return {
				status: 200,
				data: res.data,
			}
		} else {
			return {
				status: res.status || 400,
				data: null,
			}
		}
	} catch (err) {
		console.error("fetchToken: Axios error:", err.message)
		throw err
	}
}
