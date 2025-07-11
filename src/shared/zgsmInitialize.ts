import { getZgsmModels } from "../api/providers/zgsm"
import { ClineProvider } from "../core/webview/ClineProvider"
import { defaultZgsmAuthConfig } from "../zgsmAuth/config"

export const initZgsmApiConfiguration = async (provider: ClineProvider) => {
	const { apiConfiguration } = await provider.getState()
	const [zgsmModels, zgsmDefaultModelId] = await getZgsmModels(
		provider?.context?.globalState?.get?.("zgsmBaseUrl") || defaultZgsmAuthConfig.baseUrl,
		apiConfiguration.zgsmApiKey,
	)
	const modelId = apiConfiguration.zgsmModelId || apiConfiguration.apiModelId || zgsmDefaultModelId

	await defaultZgsmAuthConfig.initProviderConfig(provider, {
		zgsmModels,
		zgsmDefaultModelId: modelId,
		apiModelId: modelId,
	})
}
