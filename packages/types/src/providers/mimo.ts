import type { ModelInfo } from "../model.js"

// https://developer.puter.com/ai/xiaomi/mimo-v2.5-pro/
// https://developer.puter.com/ai/xiaomi/mimo-v2.5/
// https://platform.xiaomimimo.com/docs/en-US/quick-start/model-hyperparameters
//
// NOTE: mimo-v2-flash is not included here. Its thinking mode defaults to
// disabled and it doesn't reliably handle reasoning_content passthrough
// during multi-turn tool calling, which causes 400 errors from the proxy.
// If flash support is needed later, it should be validated against the API
// first — the tool-calling + thinking flow is what makes MiMo useful as
// an agentic provider, and flash just can't do that yet.
export type MimoModelId = keyof typeof mimoModels

export const mimoDefaultModelId: MimoModelId = "mimo-v2.5-pro"

export const mimoModels = {
	"mimo-v2.5-pro": {
		maxTokens: 131_072,
		contextWindow: 1_048_576,
		supportsImages: false, // Pro series is text-only
		supportsPromptCache: false,
		preserveReasoning: true,
		inputPrice: 1.0, // $1.00/1M tokens (cache miss, ≤256K)
		outputPrice: 3.0, // $3.00/1M tokens (≤256K)
		cacheReadsPrice: 0.2, // $0.20/1M tokens (cache hit, ≤256K)
		cacheWritesPrice: 0, // Free for limited time
		// MiMo charges 2x above 256K context
		longContextPricing: {
			thresholdTokens: 256_000,
			inputPriceMultiplier: 2,
			outputPriceMultiplier: 2,
			cacheReadsPriceMultiplier: 2,
		},
		description:
			"MiMo V2.5 Pro - Xiaomi's flagship reasoning model with 1M context, deep thinking, tool calling, and structured output.",
	},
	"mimo-v2.5": {
		maxTokens: 131_072,
		contextWindow: 1_048_576,
		supportsImages: true, // Full-modal: text, image, audio, video input
		supportsPromptCache: false,
		preserveReasoning: true,
		inputPrice: 0.4, // $0.40/1M tokens (cache miss, ≤256K)
		outputPrice: 2.0, // $2.00/1M tokens (≤256K)
		cacheReadsPrice: 0.08, // $0.08/1M tokens (cache hit, ≤256K)
		cacheWritesPrice: 0, // Free for limited time
		// MiMo charges 2x above 256K context
		longContextPricing: {
			thresholdTokens: 256_000,
			inputPriceMultiplier: 2,
			outputPriceMultiplier: 2,
			cacheReadsPriceMultiplier: 2,
		},
		description:
			"MiMo V2.5 - Full-modal understanding model (text, image, audio, video) with 1M context, deep thinking, tool calling, and structured output.",
	},
} as const satisfies Record<string, ModelInfo>

export const mimoDefaultModelInfo: ModelInfo = mimoModels[mimoDefaultModelId]

export const MIMO_DEFAULT_TEMPERATURE = 1.0
