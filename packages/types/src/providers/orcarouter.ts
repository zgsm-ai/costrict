import type { ModelInfo } from "../model.js"

// https://api.orcarouter.ai/v1
export const orcaRouterDefaultModelId = "orcarouter/auto"

export const orcaRouterDefaultModelInfo: ModelInfo = {
	maxTokens: 64000,
	contextWindow: 200000,
	supportsImages: true,
	supportsPromptCache: true,
	inputPrice: 3,
	outputPrice: 15,
	cacheWritesPrice: 3.75,
	cacheReadsPrice: 0.3,
	description:
		"OrcaRouter is a unified OpenAI-compatible gateway that routes requests to a wide catalog of models from a single endpoint, and runs gateway-level, zero-trust security for AI agents on the same endpoint — screening every prompt/response and governing every tool call on a default-deny basis.",
}

export const ORCAROUTER_DEFAULT_TEMPERATURE = 0.7
