import type { ModelInfo } from "../model.js"

// https://platform.deepseek.com/docs/api
// preserveReasoning enables interleaved thinking mode for tool calls:
// DeepSeek requires reasoning_content to be passed back during tool call
// continuation within the same turn. See: https://api-docs.deepseek.com/guides/thinking_mode
export type DeepSeekModelId = keyof typeof deepSeekModels

export const deepSeekDefaultModelId: DeepSeekModelId = "deepseek-chat"

export const deepSeekModels = {
	"deepseek-chat": {
		maxTokens: 8192, // 8K max output
		contextWindow: 128_000,
		supportsImages: false,
		supportsPromptCache: true,
		inputPrice: 0.28, // $0.28 per million tokens (cache miss) - Updated Dec 9, 2025
		outputPrice: 0.42, // $0.42 per million tokens - Updated Dec 9, 2025
		cacheWritesPrice: 0.28, // $0.28 per million tokens (cache miss) - Updated Dec 9, 2025
		cacheReadsPrice: 0.028, // $0.028 per million tokens (cache hit) - Updated Dec 9, 2025
		description: `DeepSeek-V3.2 (Non-thinking Mode) achieves a significant breakthrough in inference speed over previous models. It tops the leaderboard among open-source models and rivals the most advanced closed-source models globally. Supports JSON output, tool calls, chat prefix completion (beta), and FIM completion (beta).`,
	},
	"deepseek-reasoner": {
		maxTokens: 8192, // 8K max output
		contextWindow: 128_000,
		supportsImages: false,
		supportsPromptCache: true,
		preserveReasoning: true,
		inputPrice: 0.28, // $0.28 per million tokens (cache miss) - Updated Dec 9, 2025
		outputPrice: 0.42, // $0.42 per million tokens - Updated Dec 9, 2025
		cacheWritesPrice: 0.28, // $0.28 per million tokens (cache miss) - Updated Dec 9, 2025
		cacheReadsPrice: 0.028, // $0.028 per million tokens (cache hit) - Updated Dec 9, 2025
		description: `DeepSeek-V3.2 (Thinking Mode) achieves performance comparable to OpenAI-o1 across math, code, and reasoning tasks. Supports Chain of Thought reasoning with up to 8K output tokens. Supports JSON output, tool calls, and chat prefix completion (beta).`,
	},
	"deepseek-v4-pro": {
		maxTokens: 384_000, // 384K max output
		contextWindow: 1_000_000,
		supportsImages: false,
		supportsPromptCache: true,
		preserveReasoning: true,
		inputPrice: 1.74, // $1.74 per million tokens (cache miss)
		outputPrice: 3.48, // $3.48 per million tokens
		cacheWritesPrice: 1.74, // $1.74 per million tokens (cache miss)
		cacheReadsPrice: 0.0145, // $0.0145 per million tokens (cache hit)
		description: `DeepSeek-V4-Pro is the flagship Mixture-of-Experts model in the DeepSeek-V4 Preview series with 1.6T total parameters and 49B activated parameters. Supports a 1M-token context window with up to 384K output tokens, thinking mode (default), JSON output, tool calls, chat prefix completion (beta), and FIM completion (beta, non-thinking only). Best for complex reasoning, advanced coding, agentic workflows, and long-context analysis.`,
	},
	"deepseek-v4-flash": {
		maxTokens: 384_000, // 384K max output
		contextWindow: 1_000_000,
		supportsImages: false,
		supportsPromptCache: true,
		preserveReasoning: true,
		inputPrice: 0.14, // $0.14 per million tokens (cache miss)
		outputPrice: 0.28, // $0.28 per million tokens
		cacheWritesPrice: 0.14, // $0.14 per million tokens (cache miss)
		cacheReadsPrice: 0.0028, // $0.0028 per million tokens (cache hit)
		description: `DeepSeek-V4-Flash is the fast, cost-efficient Mixture-of-Experts model in the DeepSeek-V4 Preview series with 284B total parameters and 13B activated parameters. Supports a 1M-token context window with up to 384K output tokens, thinking mode (default), JSON output, tool calls, chat prefix completion (beta), and FIM completion (beta, non-thinking only). Best for high-volume workloads, chatbots, long document processing, and cost-sensitive applications.`,
	},
} as const satisfies Record<string, ModelInfo>

// https://api-docs.deepseek.com/quick_start/parameter_settings
export const DEEP_SEEK_DEFAULT_TEMPERATURE = 0.3
