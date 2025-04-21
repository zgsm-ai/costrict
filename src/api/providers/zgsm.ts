import { OpenAiHandler, OpenAiHandlerOptions } from "./openai"
import { deepSeekModels, ModelInfo } from "../../shared/api"
import { ApiStreamUsageChunk } from "../transform/stream" // Import for type
import { getModelParams } from "../index"

export class ZgsmHandler extends OpenAiHandler {
	constructor(options: OpenAiHandlerOptions) {
		super({
			...options,
			openAiApiKey: options.zgsmApiKey ?? "not-provided",
			openAiModelId: options.zgsmModelId ?? "deepseek-chat",
			openAiBaseUrl: options.zgsmBaseUrl ?? "https://zgsm.sangfor.com",
			openAiStreamingEnabled: true,
			includeMaxTokens: true,
		})
	}

	override getModel(): { id: string; info: ModelInfo } {
		const modelId = this.options.apiModelId ?? "deepseek-chat"
		const info = deepSeekModels[modelId as keyof typeof deepSeekModels] || deepSeekModels["deepseek-chat"]

		return {
			id: modelId,
			info,
			...getModelParams({ options: this.options, model: info }),
		}
	}

	// Override to handle DeepSeek's usage metrics, including caching.
	protected override processUsageMetrics(usage: any): ApiStreamUsageChunk {
		return {
			type: "usage",
			inputTokens: usage?.prompt_tokens || 0,
			outputTokens: usage?.completion_tokens || 0,
			cacheWriteTokens: usage?.prompt_tokens_details?.cache_miss_tokens,
			cacheReadTokens: usage?.prompt_tokens_details?.cached_tokens,
		}
	}
}
