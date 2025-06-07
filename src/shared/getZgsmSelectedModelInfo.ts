import { ModelInfo } from "../schemas"
import {
	anthropicDefaultModelId,
	deepSeekDefaultModelId,
	geminiDefaultModelId,
	mistralDefaultModelId,
	openAiNativeDefaultModelId,
	zgsmModelInfos,
} from "./api"

export const getZgsmSelectedModelInfo = (modelId: string): ModelInfo => {
	if (!modelId) {
		return {} as ModelInfo
	}

	const ids = Object.keys(zgsmModelInfos as Record<string, ModelInfo>)

	let mastchKey = ids.find((id) => modelId && id.includes(modelId))

	if (!mastchKey) {
		if (modelId.startsWith("claude-")) {
			mastchKey = anthropicDefaultModelId
		} else if (modelId.startsWith("deepseek-")) {
			mastchKey = deepSeekDefaultModelId
		} else if (modelId.startsWith("gpt-")) {
			mastchKey = openAiNativeDefaultModelId
		} else if (modelId.startsWith("gemini-")) {
			mastchKey = geminiDefaultModelId
		} else if (modelId.startsWith("mistral-")) {
			mastchKey = mistralDefaultModelId
		}
	}

	return (zgsmModelInfos as Record<string, ModelInfo>)[`${mastchKey}`] || zgsmModelInfos.default
}
