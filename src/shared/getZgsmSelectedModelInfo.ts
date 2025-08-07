import {
	anthropicDefaultModelId,
	deepSeekDefaultModelId,
	geminiDefaultModelId,
	mistralDefaultModelId,
	ModelInfo,
	openAiNativeDefaultModelId,
	zgsmModels,
} from "@roo-code/types"
// import { ModelInfo } from "../schemas"
// import {
// 	anthropicDefaultModelId,
// 	deepSeekDefaultModelId,
// 	geminiDefaultModelId,
// 	mistralDefaultModelId,
// 	openAiNativeDefaultModelId,
// 	zgsmModelInfos,
// } from "./api"

export const getZgsmSelectedModelInfo = (modelId: string): ModelInfo => {
	if (!modelId) {
		return {} as ModelInfo
	}

	const ids = Object.keys(zgsmModels as Record<string, ModelInfo>)

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

	return (zgsmModels as Record<string, ModelInfo>)[`${mastchKey}`] || zgsmModels.default
}

// Module-level variable to store full response data
let zgsmFullResponseData: ModelInfo[] = []

// Function to set full response data
export const setZgsmFullResponseData = (data: ModelInfo[]): void => {
	zgsmFullResponseData = data
}

// Function to get full response data
export const getZgsmFullResponseData = (): ModelInfo[] => {
	return zgsmFullResponseData
}
