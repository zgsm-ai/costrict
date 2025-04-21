import * as vscode from "vscode"
import { ClineProvider } from "../core/webview/ClineProvider"
import { ApiConfiguration } from "../shared/api"

/**
 * 处理 ZGSM OAuth 回调
 * @param code 授权码
 * @param state 状态值
 * @param provider ClineProvider 实例
 */
export async function handleZgsmAuthCallback(code: string, state: string, provider: ClineProvider): Promise<void> {
	try {
		// 在实际实现中应该去交换 token，这里为了简化直接使用授权码作为令牌
		const tokenData = { access_token: code, state }

		// 获取当前的 API 配置
		const { apiConfiguration } = await provider.getState()

		// 使用 token 更新 API 配置
		if (apiConfiguration) {
			const updatedConfig: ApiConfiguration = {
				...apiConfiguration,
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
export async function handleZgsmLogin(authUrl: string, apiConfiguration: any, provider: ClineProvider): Promise<void> {
	// 打开认证链接
	await vscode.env.openExternal(vscode.Uri.parse(authUrl))

	// 保存 apiConfiguration，以便在认证成功后使用
	if (apiConfiguration) {
		await provider.updateApiConfiguration(apiConfiguration)
	}

	// 向 webview 发送消息，通知认证已发起
	provider.postMessageToWebview({ type: "state", state: await provider.getStateToPostToWebview() })
}
