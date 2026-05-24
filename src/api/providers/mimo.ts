import OpenAI from "openai"

import { mimoModels, mimoDefaultModelId, MIMO_DEFAULT_TEMPERATURE, type ModelInfo } from "@roo-code/types"

import type { ApiHandlerOptions } from "../../shared/api"

import { ApiStream } from "../transform/stream"
import { convertToR1Format } from "../transform/r1-format"
import { getModelParams } from "../transform/model-params"
import { calculateApiCostOpenAI } from "../../shared/cost"
import { handleProviderError } from "./utils/error-handler"

import { OpenAiHandler } from "./openai"
import type { ApiHandlerCreateMessageMetadata } from "../index"
import { sanitizeOpenAiCallId } from "../../utils/tool-id"

/**
 * MiMoHandler extends OpenAiHandler with MiMo-specific adaptations.
 *
 * CRITICAL: Per MiMo's official docs, reasoning_content MUST be passed back
 * in multi-turn conversations with tool calls. Without it, the API returns 400.
 *
 * Reference: https://platform.xiaomimimo.com/#/docs/usage-guide/passing-back-reasoning_content
 */
export class MimoHandler extends OpenAiHandler {
	constructor(options: ApiHandlerOptions) {
		super({
			...options,
			openAiApiKey: options.mimoApiKey ?? "not-provided",
			openAiModelId: options.apiModelId ?? mimoDefaultModelId,
			openAiBaseUrl: options.mimoBaseUrl || "https://token-plan-sgp.xiaomimimo.com/v1",
			openAiStreamingEnabled: true,
			includeMaxTokens: false,
		})
	}

	/**
	 * Maps the configured model ID to its MiMo model info and parameters.
	 * Falls back to the default model (mimo-v2.5-pro) if the stored ID
	 * doesn't match any known model — this can happen when users manually
	 * type a model name in settings.
	 */
	override getModel() {
		const id = this.options.apiModelId ?? mimoDefaultModelId
		const info: ModelInfo = mimoModels[id as keyof typeof mimoModels] || mimoModels[mimoDefaultModelId]
		const params = getModelParams({
			format: "openai",
			modelId: id,
			model: info,
			settings: this.options,
			defaultTemperature: MIMO_DEFAULT_TEMPERATURE,
		})
		return { id, info, ...params }
	}

	/**
	 * Streams a chat completion from MiMo's OpenAI-compatible API.
	 *
	 * Uses convertToR1Format (shared with DeepSeek/Z.ai) for message conversion
	 * with mergeToolResultText and normalizeToolCallId options enabled.
	 * MiMo-specific: enables thinking mode via extra_body.thinking.
	 *
	 * supportsPromptCache is false because MiMo doesn't support client-side
	 * cache_control injection. However, MiMo's server-side cache CAN return
	 * cached_tokens in usage, so cacheReadsPrice/cacheWritesPrice in the model
	 * definitions are correct for cost calculation.
	 */
	override async *createMessage(
		systemPrompt: string,
		messages: any[],
		metadata?: ApiHandlerCreateMessageMetadata,
	): ApiStream {
		const { id: modelId, info: modelInfo } = this.getModel()

		// Use shared R1-format conversion with tool ID sanitization and text merging
		const convertedMessages = convertToR1Format(messages, {
			mergeToolResultText: true,
			normalizeToolCallId: sanitizeOpenAiCallId,
		})

		const tools = metadata?.tools

		// Build request per MiMo's OpenAI-compatible API
		// https://developer.puter.com/ai/xiaomi/mimo-v2.5-pro/
		// Note: temperature is omitted because MiMo forces it to 1.0 when thinking mode
		// is enabled, regardless of what is passed (see model-hyperparameters docs).
		const params: Record<string, any> = {
			model: modelId,
			messages: [{ role: "system", content: systemPrompt }, ...convertedMessages],
			stream: true,
			stream_options: { include_usage: true },
			// MiMo requires thinking to be enabled via extra_body
			extra_body: { thinking: { type: "enabled" } },
		}

		if (tools && tools.length > 0) {
			params.tools = tools
		}

		let stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>
		try {
			stream = (await this.client.chat.completions.create(params as any)) as any
		} catch (error) {
			throw handleProviderError(error, "MiMo")
		}

		let lastUsage: OpenAI.CompletionUsage | undefined
		const activeToolCallIds = new Set<string>()

		for await (const chunk of stream) {
			const delta = chunk.choices?.[0]?.delta ?? {}
			const finishReason = chunk.choices?.[0]?.finish_reason
			const sanitizedDelta = delta.tool_calls
				? {
						...delta,
						tool_calls: delta.tool_calls.map((toolCall) => ({
							...toolCall,
							id: toolCall.id ? sanitizeOpenAiCallId(toolCall.id) : toolCall.id,
						})),
					}
				: delta

			if (delta.content) {
				yield {
					type: "text",
					text: delta.content,
				}
			}

			if ("reasoning_content" in delta && delta.reasoning_content) {
				yield {
					type: "reasoning",
					text: (delta.reasoning_content as string) || "",
				}
			}

			yield* this.processToolCalls(sanitizedDelta, finishReason, activeToolCallIds)

			if (chunk.usage) {
				lastUsage = chunk.usage
			}
		}

		if (lastUsage) {
			const inputTokens = lastUsage?.prompt_tokens || 0
			const outputTokens = lastUsage?.completion_tokens || 0
			const cacheWriteTokens = (lastUsage?.prompt_tokens_details as any)?.cache_write_tokens || 0
			const cacheReadTokens = lastUsage?.prompt_tokens_details?.cached_tokens || 0

			const { totalCost } = calculateApiCostOpenAI(
				modelInfo,
				inputTokens,
				outputTokens,
				cacheWriteTokens,
				cacheReadTokens,
			)

			yield {
				type: "usage",
				inputTokens,
				outputTokens,
				cacheWriteTokens: cacheWriteTokens || undefined,
				cacheReadTokens: cacheReadTokens || undefined,
				totalCost,
			}
		}
	}
}
