import { Anthropic } from "@anthropic-ai/sdk"
import OpenAI, { AzureOpenAI } from "openai"
import { v7 as uuidv7 } from "uuid"

import {
	type ModelInfo,
	azureOpenAiDefaultApiVersion,
	DEEP_SEEK_DEFAULT_TEMPERATURE,
	OPENAI_AZURE_AI_INFERENCE_PATH,
	zgsmDefaultModelId,
	zgsmModelsConfig as zgsmModels,
	// TOOL_PROTOCOL,
	ClineApiReqCancelReason,
} from "@roo-code/types"

import type { ApiHandlerOptions } from "../../shared/api"

import { TagMatcher } from "../../utils/tag-matcher"

import { convertToOpenAiMessages } from "../transform/openai-format"
import { convertToR1Format } from "../transform/r1-format"
import { ApiStream, ApiStreamUsageChunk } from "../transform/stream"
import { getModelParams } from "../transform/model-params"

import { BaseProvider } from "./base-provider"
import type { SingleCompletionHandler, ApiHandlerCreateMessageMetadata } from "../index"
import { ZgsmAuthConfig, ZgsmAuthService } from "../../core/costrict/auth"
import { getClientId } from "../../utils/getClientId"
import { getWorkspacePath } from "../../utils/path"
import { getApiRequestTimeout } from "./utils/timeout-config"
import { getApiResponseRenderMode, renderModes } from "./utils/response-render-config"
import { createLogger, ILogger } from "../../utils/logger"
import { Package } from "../../shared/package"
import { COSTRICT_DEFAULT_HEADERS } from "../../shared/headers"
import { handleOpenAIError } from "./utils/openai-error-handler"
import { getModels } from "./fetchers/modelCache"
import { getEditorType } from "../../utils/getEditorType"
import { ChatCompletionChunk } from "openai/resources/index.mjs"
import { convertToZAiFormat } from "../transform/zai-format"
import { isDebug } from "../../utils/getDebugState"
import { liteToolContractPrompt } from "../../core/prompts/tools/lite-descriptions"

const autoModeModelId = "Auto"
const isDev = process.env.NODE_ENV === "development"

export class ZgsmAiHandler extends BaseProvider implements SingleCompletionHandler {
	protected options: ApiHandlerOptions
	private client: OpenAI
	private readonly providerName = "zgsm"
	private baseURL: string
	private chatType?: "user" | "system"
	private modelInfo = {} as ModelInfo
	private apiResponseRenderModeInfo = renderModes.fast
	private logger: ILogger
	private abortController?: AbortController

	constructor(options: ApiHandlerOptions) {
		super()
		this.options = options
		this.logger = createLogger(Package.outputChannel)
		this.baseURL = `${this.options.zgsmBaseUrl?.trim() || ZgsmAuthConfig.getInstance().getDefaultApiBaseUrl()}/chat-rag/api/v1`
		const apiKey = options.zgsmAccessToken || "not-provided"
		const isAzureAiInference = this._isAzureAiInference(this.baseURL)
		const urlHost = this._getUrlHost(this.baseURL)
		const isAzureOpenAi = urlHost === "azure.com" || urlHost.endsWith(".azure.com") || options.openAiUseAzure

		this.updateModelInfo()
		const timeout = getApiRequestTimeout()
		this.apiResponseRenderModeInfo = getApiResponseRenderMode()
		if (isAzureAiInference) {
			// Azure AI Inference Service (e.g., for DeepSeek) uses a different path structure
			this.client = new OpenAI({
				baseURL: this.baseURL,
				apiKey,
				timeout,
				maxRetries: 0,
				defaultHeaders: COSTRICT_DEFAULT_HEADERS,
				defaultQuery: { "api-version": this.options.azureApiVersion || "2024-05-01-preview" },
			})
		} else if (isAzureOpenAi) {
			// Azure API shape slightly differs from the core API shape:
			// https://github.com/openai/openai-node?tab=readme-ov-file#microsoft-azure-openai
			this.client = new AzureOpenAI({
				baseURL: this.baseURL,
				apiKey,
				timeout,
				maxRetries: 0,
				apiVersion: this.options.azureApiVersion || azureOpenAiDefaultApiVersion,
				defaultHeaders: COSTRICT_DEFAULT_HEADERS,
			})
		} else {
			this.client = new OpenAI({
				baseURL: this.baseURL,
				apiKey,
				timeout,
				maxRetries: 0,
				defaultHeaders: COSTRICT_DEFAULT_HEADERS,
			})
		}
	}

	override async *createMessage(
		systemPrompt: string,
		messages: Anthropic.Messages.MessageParam[],
		metadata?: ApiHandlerCreateMessageMetadata,
	): ApiStream {
		// Performance monitoring log
		this.abortController = new AbortController()
		const requestId = uuidv7()
		const workflowModes = ["strict", "plan"] as Array<string | undefined>
		await this.updateModelInfo()
		const fromWorkflow =
			metadata?.zgsmWorkflowMode ||
			workflowModes.includes(metadata?.mode) ||
			workflowModes.includes(metadata?.rooTaskMode) ||
			workflowModes.includes(metadata?.parentTaskMode) ||
			workflowModes.includes(metadata?.zgsmCodeMode)
		this.apiResponseRenderModeInfo = getApiResponseRenderMode()
		if ("review" === metadata?.mode && this.client) {
			this.client.maxRetries = 1
		}
		// 1. Cache calculation results and configuration
		const { info: modelInfo, reasoning, id: modelId } = this.getModel()
		const modelUrl = this.baseURL || ZgsmAuthConfig.getInstance().getDefaultApiBaseUrl()
		const enabledR1Format = this.options.openAiR1FormatEnabled ?? false
		const isNative = true

		// Cache boolean calculation results
		const isAzureAiInference = this._isAzureAiInference(modelUrl)
		const isDeepseekReasoner = modelId.includes("deepseek-reasoner")
		const isMiniMax = modelId.toLowerCase().includes("minimax")
		const deepseekReasoner = isDeepseekReasoner || enabledR1Format
		const isGrokXAI = this._isGrokXAI(this.baseURL)
		const isO1Family = modelId.includes("o1") || modelId.includes("o3") || modelId.includes("o4")

		// 2. Cache async call results
		const cachedClientId = getClientId()
		const cachedWorkspacePath = getWorkspacePath()

		// 3. Pre-build headers to avoid repeated creation
		const _headers = this.buildHeaders(metadata, requestId, cachedClientId, cachedWorkspacePath, this.chatType)

		// 4. Handle O1 family models
		if (isO1Family) {
			yield* this.handleO3FamilyMessage(modelId, systemPrompt, messages, undefined, isNative, requestId)
			return
		}

		try {
			const tokens = await ZgsmAuthService.getInstance()?.getTokens()
			if (this.client) {
				this.client.apiKey = tokens?.access_token || "not-provided"
			}
		} catch (error) {
			this.logger.info(
				`[createMessage] getting new tokens failed \n\nuse old tokens: ${this.client?.apiKey} \n\n${error.message}`,
			)
		}

		try {
			// 5. Handle streaming and non-streaming requests
			if (this.options.openAiStreamingEnabled ?? true) {
				const convertedMessages = this.convertMessages(
					systemPrompt,
					messages,
					deepseekReasoner,
					isMiniMax,
					modelInfo,
					isNative,
				)
				const requestOptions = this.buildStreamingRequestOptions(
					convertedMessages,
					deepseekReasoner,
					isGrokXAI,
					isMiniMax,
					reasoning,
					modelInfo,
					metadata,
					isNative,
				)
				requestOptions.extra_body.prompt_mode = fromWorkflow ? (metadata?.zgsmCodeMode ?? "vibe") : "vibe"
				const isAuto = this.options.zgsmModelId === autoModeModelId
				let stream: any
				let selectedLLM: string | undefined = this.options.zgsmModelId
				let selectReason: string | undefined
				let requestIdTimestamp: number | undefined
				let responseIdTimestamp: number | undefined
				try {
					requestIdTimestamp = Date.now()
					this.logger.info(`[RequestID ${modelId}]:`, requestId)

					if (metadata?.onRequestHeadersReady && typeof metadata.onRequestHeadersReady === "function") {
						metadata.onRequestHeadersReady(_headers)
					}

					const { data, response } = await (this.client as OpenAI).chat.completions
						.create(
							requestOptions,
							Object.assign(isAzureAiInference ? { path: OPENAI_AZURE_AI_INFERENCE_PATH } : {}, {
								headers: _headers,
								signal: this.abortController.signal,
							}),
						)
						.withResponse()
					this.logger.info(`[ResponseID ${modelId}]:`, response.headers.get("x-request-id"))
					responseIdTimestamp = Date.now()
					if (isAuto) {
						selectedLLM = response.headers.get("x-select-llm") || ""
						selectReason = response.headers.get("x-select-reason") || ""

						const userInputHeader = isDev ? response.headers.get("x-user-input") : null
						if (userInputHeader) {
							const decodedUserInput = Buffer.from(userInputHeader, "base64").toString("utf-8")
							this.logger.info(`[x-user-input]: ${decodedUserInput}`)
						}
					}

					stream = data

					// // todo: use supportsNativeTools to check if the model supports native tools
					// if (isNative && modelId.toLowerCase().includes("qwen-2.5-vl")) {
					// 	throw new Error("qwen-2.5-vl does not support native protocol")
					// }
				} catch (error) {
					throw handleOpenAIError(error, this.providerName)
				}

				// eslint-disable-next-line @typescript-eslint/no-unused-expressions
				isDev && this.logger.info(`[ResponseID ${modelId} sse render start]:`, requestId)

				// 6. Optimize stream processing - use batch processing and buffer
				yield* this.handleOptimizedStream(
					stream,
					modelInfo,
					isAuto,
					selectedLLM,
					selectReason,
					requestId,
					isNative,
					responseIdTimestamp,
					requestIdTimestamp,
					metadata?.onPerformanceTiming,
				)
			} else {
				// Non-streaming processing
				const requestOptions = this.buildNonStreamingRequestOptions(
					modelId,
					systemPrompt,
					messages,
					deepseekReasoner,
					modelInfo,
					metadata,
				)
				let response
				requestOptions.extra_body.prompt_mode = fromWorkflow ? "strict" : "vibe"
				let requestIdTimestamp: number | undefined
				let responseIdTimestamp: number | undefined
				try {
					requestIdTimestamp = Date.now()
					this.logger.info(`[RequestID]:`, requestId)
					response = await (this.client as OpenAI).chat.completions.create(
						requestOptions,
						Object.assign(isAzureAiInference ? { path: OPENAI_AZURE_AI_INFERENCE_PATH } : {}, {
							headers: _headers,
							signal: this.abortController.signal,
						}),
					)
					this.logger.info(`[ResponseId]:`, response._request_id)
					responseIdTimestamp = Date.now()
				} catch (error) {
					throw handleOpenAIError(error, this.providerName)
				}

				const message = response.choices?.[0]?.message

				if (message?.tool_calls) {
					for (const toolCall of message.tool_calls) {
						if (toolCall.type === "function") {
							yield {
								type: "tool_call",
								id: toolCall.id,
								name: toolCall.function.name,
								arguments: toolCall.function.arguments,
							}
						}
					}
				}

				yield {
					type: "text",
					text: message.content || "",
				}

				yield this.processUsageMetrics(response.usage, modelInfo)

				// Emit performance timing data via callback (frontend will calculate metrics)
				const responseEndTimestamp = Date.now()
				if (responseIdTimestamp && requestIdTimestamp && response.usage?.completion_tokens) {
					// Emit timing data via callback
					if (metadata?.onPerformanceTiming) {
						metadata
							.onPerformanceTiming({
								requestIdTimestamp,
								responseIdTimestamp,
								responseEndTimestamp,
								completionTokens: response.usage.completion_tokens,
							})
							.catch(() => {})
					}
				}
			}
		} catch (err) {
			// eslint-disable-next-line @typescript-eslint/no-unused-expressions
			isDev && this.logger.error(`[createMessage] ${err}`)
			throw err
		} finally {
			this.logger.info(`[ResponseID ${modelId} sse createMessage end]:`, requestId)
		}
	}

	protected processUsageMetrics(usage: any, _modelInfo?: ModelInfo): ApiStreamUsageChunk {
		return {
			type: "usage",
			inputTokens: usage?.prompt_tokens || 0,
			outputTokens: usage?.completion_tokens || 0,
			cacheWriteTokens: usage?.cache_creation_input_tokens || undefined,
			cacheReadTokens: usage?.cache_read_input_tokens || undefined,
		}
	}

	/**
	 * Build request headers (optimize memory allocation)
	 */
	private buildHeaders(
		metadata: ApiHandlerCreateMessageMetadata | undefined,
		requestId: string,
		clientId: string,
		workspacePath: string,
		chatType?: "user" | "system",
	): Record<string, string> {
		return {
			"Accept-Language": metadata?.language || "en",
			...COSTRICT_DEFAULT_HEADERS,
			...(this.options.useZgsmCustomConfig && isDebug() ? (this.options.openAiHeaders ?? {}) : {}),
			"x-quota-identity": chatType || "system",
			"X-Request-ID": requestId,
			"x-user-id": metadata?.userId || "",
			"zgsm-task-id": metadata?.taskId || "",
			"zgsm-request-id": requestId,
			"zgsm-client-id": clientId,
			"zgsm-provider": metadata?.provider,
			"x-costrict-idea": getEditorType(),
			"zgsm-project-path": encodeURI(workspacePath),
			"x-caller": metadata?.mode === "review" ? "review-checker" : "chat",
		}
	}

	/**
	 * Unified message conversion logic (using strategy pattern)
	 */
	private convertMessages(
		systemPrompt: string,
		messages: Anthropic.Messages.MessageParam[],
		isDeepseekReasoner: boolean,
		isMiniMax: boolean,
		modelInfo: ModelInfo,
		isNative: boolean,
	): Array<OpenAI.Chat.ChatCompletionMessageParam | Anthropic.Messages.MessageParam> {
		let convertedMessages: Array<OpenAI.Chat.ChatCompletionMessageParam | Anthropic.Messages.MessageParam>
		const _mid = modelInfo.id?.toLowerCase()
		if (isDeepseekReasoner) {
			convertedMessages = convertToR1Format([{ role: "user", content: systemPrompt }, ...messages])
		} else {
			const systemMessage = modelInfo.supportsPromptCache
				? {
						role: "system" as const,
						content: [
							{
								type: "text" as const,
								text: systemPrompt,
								cache_control: { type: "ephemeral" },
							},
						],
					}
				: { role: "system" as const, content: systemPrompt }
			if (_mid?.includes("kimi") || _mid?.includes("glm") || isMiniMax || _mid?.includes("claude")) {
				convertedMessages = [
					{ role: "system", content: systemPrompt },
					...convertToZAiFormat(messages, { mergeToolResultText: true }),
				]
			} else {
				if (_mid?.includes("qwen")) {
					if (Array.isArray(systemMessage.content)) {
						systemMessage.content[0].text = systemMessage.content[0].text + "\n" + liteToolContractPrompt()
					} else {
						systemMessage.content = systemMessage.content + "\n" + liteToolContractPrompt()
					}
				}
				convertedMessages = [
					systemMessage,
					...convertToOpenAiMessages(messages, { mergeToolResultText: isNative }),
				]
			}
		}

		// Apply cache control logic
		this.applyCacheControlLogic(convertedMessages, modelInfo)

		return convertedMessages
	}

	/**
	 * Apply cache control logic (extracted as separate method)
	 */
	private applyCacheControlLogic(
		messages: Array<OpenAI.Chat.ChatCompletionMessageParam | Anthropic.Messages.MessageParam>,
		modelInfo: ModelInfo,
	): void {
		if (!modelInfo.supportsPromptCache) {
			return
		}

		const lastTwoUserMessages = messages.filter((msg) => msg.role === "user").slice(-2)

		for (const msg of lastTwoUserMessages) {
			if (typeof msg.content === "string") {
				msg.content = [{ type: "text", text: msg.content }]
			}

			if (Array.isArray(msg.content)) {
				let lastTextPart = msg.content.filter((part) => part.type === "text").pop()

				if (!lastTextPart) {
					lastTextPart = { type: "text", text: "..." }
					msg.content.push(lastTextPart)
				}

				// @ts-ignore-next-line
				lastTextPart["cache_control"] = { type: "ephemeral" }
			}
		}
	}

	/**
	 * Build streaming request options
	 */
	private buildStreamingRequestOptions(
		messages: Array<OpenAI.Chat.ChatCompletionMessageParam | Anthropic.Messages.MessageParam>,
		isDeepseekReasoner: boolean,
		isGrokXAI: boolean,
		isMiniMax: boolean,
		reasoning: any,
		modelInfo: ModelInfo,
		metadata?: ApiHandlerCreateMessageMetadata,
		isNative?: boolean,
	): OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming & { extra_body: any } {
		let requestOptions: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming & { extra_body: any } = {
			model: modelInfo.id,
			temperature:
				this.options.modelTemperature ?? (isDeepseekReasoner ? DEEP_SEEK_DEFAULT_TEMPERATURE : undefined),
			messages,
			stream: true as const,
			...(isGrokXAI ? {} : { stream_options: { include_usage: true } }),
			...(reasoning && reasoning),
		}

		if (isNative) {
			requestOptions = {
				...requestOptions,
				...(metadata?.tools && { tools: this.convertToolsForOpenAI(metadata.tools) }),
				...(metadata?.tool_choice && { tool_choice: metadata.tool_choice }),
				...{ parallel_tool_calls: metadata?.parallelToolCalls ?? true },
			}
		}

		requestOptions.extra_body = {
			mode: metadata?.mode,
		}

		this.addMaxTokensIfNeeded(requestOptions, modelInfo)
		return requestOptions as OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming & { extra_body: any }
	}

	/**
	 * Build non-streaming request options
	 */
	private buildNonStreamingRequestOptions(
		modelId: string,
		systemPrompt: string,
		messages: Anthropic.Messages.MessageParam[],
		isDeepseekReasoner: boolean,
		modelInfo: ModelInfo,
		metadata?: ApiHandlerCreateMessageMetadata,
		isNative?: boolean,
	): OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming & { extra_body: any } {
		const systemMessage: OpenAI.Chat.ChatCompletionUserMessageParam = {
			role: "user",
			content: systemPrompt,
		}
		const requestOptions: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming & { extra_body: any } = {
			model: modelId,
			messages: isDeepseekReasoner
				? convertToR1Format([{ role: "user", content: systemPrompt }, ...messages])
				: [systemMessage, ...convertToOpenAiMessages(messages)],
			...(isNative
				? {
						...(metadata?.tools && { tools: this.convertToolsForOpenAI(metadata.tools) }),
						...(metadata?.tool_choice && { tool_choice: metadata.tool_choice }),
						...{ parallel_tool_calls: metadata?.parallelToolCalls ?? true },
					}
				: undefined),
			extra_body: {
				prompt_mode: metadata?.mode,
			},
		}

		this.addMaxTokensIfNeeded(requestOptions, modelInfo)
		return requestOptions as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming & { extra_body: any }
	}

	/**
	 * Optimized stream processing method (improves memory usage and performance)
	 */
	private async *handleOptimizedStream(
		stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>,
		modelInfo: ModelInfo,
		isAuto?: boolean,
		selectedLLM?: string,
		selectReason?: string,
		requestId?: string,
		isNative?: boolean,
		responseIdTimestamp?: number,
		requestIdTimestamp?: number,
		onPerformanceTiming?: (timing: {
			requestIdTimestamp?: number
			responseIdTimestamp?: number
			responseEndTimestamp?: number
			completionTokens?: number
		}) => Promise<void>,
	): ApiStream {
		// Check if request was aborted
		if (this.abortController?.signal.aborted) {
			return
		}
		// For MiniMax models, allow matching <think> tags anywhere in the stream
		// because MiniMax may include newlines before the <think> tag
		const isMiniMax = modelInfo?.id?.toLowerCase().includes("minimax")
		const isQwen = modelInfo?.id?.toLowerCase().includes("qwen") // Qwen model understands <tool_call> tags
		let matcher: TagMatcher<{
			readonly type: "reasoning" | "text" | "fake_tool_call"
			readonly text: string
		}>
		// let mockToolId = ""
		if (isQwen) {
			// mockToolId = "fake_tool_call"
			matcher = new TagMatcher(
				"tool_call",
				(chunk) => {
					// eslint-disable-next-line @typescript-eslint/no-unused-expressions
					isDev &&
						this.logger.info(`[ResponseID ${this.options.zgsmModelId} fake tool call]:`, requestId, chunk)
					return {
						type: chunk.matched ? "fake_tool_call" : "text",
						text: chunk.data,
					}
				},
				Infinity,
			)
		} else {
			// hasReasoning = true
			matcher = new TagMatcher(
				"think",
				(chunk) => {
					if (chunk.matched) hasReasoning = true
					return {
						type: chunk.matched ? "reasoning" : "text",
						text: chunk.data,
					} as const
				},
				isMiniMax ? Infinity : 0, // Only use Infinity for MiniMax models
			)
		}

		let lastUsage
		const activeToolCallIds = new Set<string>()

		// Use content buffer to reduce matcher.update() calls
		const contentBuffer: string[] = []
		// Buffer for tool call events to control rendering speed
		const toolCallBuffer: Array<
			| { type: "tool_call_partial"; index: number; id?: string; name?: string; arguments?: string }
			| { type: "tool_call_end"; id: string }
		> = []
		let time = Date.now()
		let toolCallTime = Date.now()
		let isPrinted = false
		let shouldAbort = false
		let hasReasoning = false

		// Yield selected LLM info if available (for Auto model mode)
		if (isAuto) {
			yield {
				type: "automodel",
				text: selectReason ? ` (${selectReason})` : "",
				originModelId: this.options.zgsmModelId,
				selectedLLM,
			}
		}

		const lastDeltaInfo = {
			activeToolCallIds,
		} as {
			delta?: ChatCompletionChunk.Choice["delta"]
			finishReason?: ChatCompletionChunk.Choice["finish_reason"]
			activeToolCallIds?: Set<string>
		}

		// Helper function to flush buffer content
		const flushBuffer = () => {
			if (contentBuffer.length > 0) {
				const batchedContent = contentBuffer.join("")
				const chunks: any[] = []
				for (const processedChunk of matcher.update(batchedContent)) {
					chunks.push(processedChunk)
				}
				contentBuffer.length = 0 // Clear buffer
				return chunks
			}
			return []
		}

		// Helper function to flush tool call buffer
		const flushToolCallBuffer = () => {
			if (toolCallBuffer.length > 0) {
				const events = [...toolCallBuffer]
				toolCallBuffer.length = 0
				return events
			}
			return []
		}

		// Helper function to collect tool call events into buffer
		const bufferToolCalls = (
			delta: OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta | undefined,
			finishReason: string | null | undefined,
		) => {
			if (delta?.tool_calls) {
				for (const toolCall of delta.tool_calls) {
					if (toolCall.id) {
						activeToolCallIds.add(toolCall.id)
					}
					toolCallBuffer.push({
						type: "tool_call_partial",
						index: toolCall.index,
						id: toolCall.id,
						name: toolCall.function?.name,
						arguments: toolCall.function?.arguments,
					})
				}
			}

			if (finishReason === "tool_calls" && activeToolCallIds.size > 0) {
				for (const id of activeToolCallIds) {
					toolCallBuffer.push({ type: "tool_call_end", id })
				}
				activeToolCallIds.clear()
			}
		}

		try {
			// chunk
			for await (const chunk of stream) {
				const delta = chunk.choices?.[0]?.delta ?? {}
				const finishReason = chunk.choices?.[0]?.finish_reason
				lastDeltaInfo.finishReason = finishReason
				lastDeltaInfo.delta = delta

				// Cache content for batch processing
				if (delta.content) {
					contentBuffer.push(delta.content)
					if (isDev && !isPrinted && chunk.model && isAuto) {
						this.logger.info(`[Current Model]: ${chunk.model}`)
						isPrinted = true
					}
					const now = Date.now()
					// Process in batch when threshold is reached or buffer is too large
					const shouldFlush =
						time + this.apiResponseRenderModeInfo.interval <= now ||
						contentBuffer.length >= this.apiResponseRenderModeInfo.limit || // Prevent buffer from growing too large
						this.abortController?.signal.aborted // Flush immediately on abort signal

					if (shouldFlush) {
						const chunks = flushBuffer()
						for (const processedChunk of chunks) {
							// eslint-disable-next-line @typescript-eslint/no-unused-expressions
							isDev &&
								this.logger.info(
									`[ResponseID ${this.options.zgsmModelId} sse rendering]:`,
									requestId,
									processedChunk.text?.substring(0, 100),
								)
							yield processedChunk
						}
						time = now
					}
				}

				// Process reasoning content
				if (delta) {
					// eslint-disable-next-line @typescript-eslint/no-unused-expressions
					isDev &&
						this.logger.info(
							`[ResponseID ${this.options.zgsmModelId} sse rendering chunk]:`,
							requestId,
							JSON.stringify(chunk),
						)
					for (const key of ["reasoning_content", "reasoning"] as const) {
						if (key in delta) {
							const reasoning_content = ((delta as any)[key] as string | undefined) || ""
							if (reasoning_content) {
								// eslint-disable-next-line @typescript-eslint/no-unused-expressions
								isDev &&
									this.logger.warn(
										`[ResponseID ${this.options.zgsmModelId} sse "${key} -> reasoning_content":`,
										requestId,
										reasoning_content,
									)
								hasReasoning = true
								yield { type: "reasoning", text: reasoning_content }
							}
							break
						}
					}
				}

				// Buffer tool calls instead of yielding immediately (for native protocol)
				if (isNative) {
					bufferToolCalls(delta, finishReason)

					// Flush tool call buffer periodically based on time interval
					const now = Date.now()
					const shouldFlushToolCalls =
						toolCallTime + this.apiResponseRenderModeInfo.interval <= now ||
						toolCallBuffer.length >= this.apiResponseRenderModeInfo.limit || // Prevent buffer from growing too large
						this.abortController?.signal.aborted // Flush immediately on abort signal

					if (shouldFlushToolCalls && toolCallBuffer.length > 0) {
						const events = flushToolCallBuffer()
						for (const event of events) {
							yield event
						}
						toolCallTime = now
					}
				}

				// Cache usage information
				if (chunk.usage) {
					lastUsage = chunk.usage
				}

				// Check if request was aborted after processing current chunk
				if (this.abortController?.signal.aborted) {
					shouldAbort = true
					// eslint-disable-next-line @typescript-eslint/no-unused-expressions
					isDev &&
						this.logger.warn(
							`[Stream aborted with ${contentBuffer.length} chars in buffer, ${toolCallBuffer.length} tool calls]`,
							requestId,
						)
					break
				}
			}
		} finally {
			if (!hasReasoning) {
				yield { type: "reasoning", text: "[thinking (empty)]" }
			}
			// Always flush remaining content, even on abort
			// This ensures no content is lost in the buffer
			if (contentBuffer.length > 0) {
				// eslint-disable-next-line @typescript-eslint/no-unused-expressions
				isDev && this.logger.info(`[Flushing ${contentBuffer.length} remaining chars from buffer]`, requestId)
				const chunks = flushBuffer()
				for (const processedChunk of chunks) {
					yield processedChunk
				}
			}

			// Always flush remaining tool calls
			if (isNative) {
				// First, buffer any remaining tool calls from lastDeltaInfo
				if (lastDeltaInfo.delta || lastDeltaInfo.finishReason) {
					bufferToolCalls(lastDeltaInfo.delta, lastDeltaInfo.finishReason)
				}

				// Then flush all buffered tool calls
				if (toolCallBuffer.length > 0) {
					// eslint-disable-next-line @typescript-eslint/no-unused-expressions
					isDev && this.logger.info(`[Flushing ${toolCallBuffer.length} remaining tool calls]`, requestId)
					const events = flushToolCallBuffer()
					for (const event of events) {
						yield event
					}
				}
			}

			// Always call matcher.final() to ensure proper cleanup
			// This handles any incomplete XML tags or remaining state
			try {
				for (const chunk of matcher.final()) {
					yield chunk
				}
			} catch (error) {
				// eslint-disable-next-line @typescript-eslint/no-unused-expressions
				isDev && this.logger.error(`[Error in matcher.final()]:`, error)
			}

			// eslint-disable-next-line @typescript-eslint/no-unused-expressions
			isDev && this.logger.info(`[ResponseID ${this.options.zgsmModelId} sse render end]:`, requestId)

			// Process usage metrics
			if (lastUsage) {
				yield this.processUsageMetrics(lastUsage, modelInfo)

				// Emit performance timing data via callback (frontend will calculate metrics)
				const responseEndTimestamp = Date.now()
				if (onPerformanceTiming && responseIdTimestamp && requestIdTimestamp && lastUsage.completion_tokens) {
					// Emit timing data via callback
					onPerformanceTiming({
						requestIdTimestamp,
						responseIdTimestamp,
						responseEndTimestamp,
						completionTokens: lastUsage.completion_tokens,
					}).catch(() => {})
				}
			}
		}
	}

	/**
	 * Helper generator to process tool calls from a stream chunk.
	 * Tracks active tool call IDs and yields tool_call_partial and tool_call_end events.
	 * @param delta - The delta object from the stream chunk
	 * @param finishReason - The finish_reason from the stream chunk
	 * @param activeToolCallIds - Set to track active tool call IDs (mutated in place)
	 */
	private *processToolCalls(
		delta: OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta | undefined,
		finishReason: string | null | undefined,
		activeToolCallIds: Set<string>,
		requestId?: string,
	): Generator<
		| { type: "tool_call_partial"; index: number; id?: string; name?: string; arguments?: string }
		| { type: "tool_call_end"; id: string }
	> {
		if (delta?.tool_calls) {
			for (const toolCall of delta.tool_calls) {
				if (toolCall.id) {
					activeToolCallIds.add(toolCall.id)
				}
				// eslint-disable-next-line @typescript-eslint/no-unused-expressions
				isDev &&
					this.logger.warn(
						`[ResponseID ${this.options.zgsmModelId} sse "toolCall arguments":`,
						requestId,
						JSON.stringify(toolCall),
					)
				yield {
					type: "tool_call_partial",
					index: toolCall.index,
					id: toolCall.id,
					name: toolCall.function?.name,
					arguments: toolCall.function?.arguments,
				}
			}
		}

		// Emit tool_call_end events when finish_reason is "tool_calls"
		// This ensures tool calls are finalized even if the stream doesn't properly close
		if (finishReason === "tool_calls" && activeToolCallIds.size > 0) {
			for (const id of activeToolCallIds) {
				yield { type: "tool_call_end", id }
			}
			activeToolCallIds.clear()
		}
	}

	async updateModelInfo() {
		try {
			const id = this.options.zgsmModelId ?? zgsmDefaultModelId
			const info =
				(
					await getModels({
						provider: "zgsm",
						baseUrl: `${this.options.zgsmBaseUrl?.trim() || ZgsmAuthConfig.getInstance().getDefaultApiBaseUrl()}`,
						apiKey: this.options.zgsmAccessToken,
					})
				)[id] ?? zgsmModels.default

			this.modelInfo = info
		} catch (error) {
			this.logger.error(`[updateModelInfo] ${error.message}`)
			this.modelInfo = zgsmModels.default
		}
	}

	override getModel() {
		const id = this.options.zgsmModelId ?? zgsmDefaultModelId
		const defaultInfo = this.modelInfo
		const info =
			this.options.useZgsmCustomConfig && isDebug()
				? {
						...defaultInfo,
						...(this.options.zgsmAiCustomModelInfo ?? {}),
					}
				: defaultInfo
		const params = getModelParams({ format: "zgsm", modelId: id, model: info, settings: this.options })
		if (!info.id) {
			info.id = id
		}
		if (
			(id.toLowerCase().includes("kimi") ||
				id.toLowerCase().includes("minimax") ||
				id.toLowerCase().includes("glm")) &&
			info.preserveReasoning == null
		) {
			info.preserveReasoning = true
		}
		return { id, info, ...params }
	}

	async completePrompt(prompt: string, systemPrompt?: string, metadata?: any): Promise<string> {
		const isAzureAiInference = this._isAzureAiInference(this.baseURL)
		await this.updateModelInfo()
		const model = this.getModel()
		const modelInfo = model?.info
		const requestId = uuidv7()
		const cachedClientId = getClientId()
		const cachedWorkspacePath = getWorkspacePath()
		const messages = [{ role: "user", content: prompt }] as any[]
		if (systemPrompt) {
			messages.unshift({ role: "system", content: systemPrompt })
		}
		const _mid = (metadata?.modelId || model.id)?.toLowerCase()
		const requestOptions: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming & {
			extra_body: any
			thinking: any
		} = {
			model: metadata?.modelId || model.id,
			messages: messages,
			temperature: _mid.includes("kimi") ? 0.6 : 0.9,
			max_tokens: metadata?.maxLength ?? 300,
			max_completion_tokens: metadata?.maxLength ?? 300,
			thinking: {
				type: "disabled",
			},
			extra_body: {
				prompt_mode: "raw",
			},
		}

		// Add max_tokens if needed
		this.addMaxTokensIfNeeded(requestOptions, modelInfo)
		try {
			const response = await (this.client as OpenAI).chat.completions.create(
				requestOptions,
				Object.assign(isAzureAiInference ? { path: OPENAI_AZURE_AI_INFERENCE_PATH } : {}, {
					headers: {
						...this.buildHeaders(
							{ language: metadata?.language, taskId: requestId, provider: metadata?.provider },
							requestId,
							cachedClientId,
							cachedWorkspacePath,
							"user",
						),
					},
					timeout: 60_000,
					signal: metadata?.signal,
				}),
			)
			return response.choices?.[0]?.message?.content || ""
		} catch (error) {
			throw handleOpenAIError(error, this.providerName)
		}
	}

	private async *handleO3FamilyMessage(
		modelId: string,
		systemPrompt: string,
		messages: Anthropic.Messages.MessageParam[],
		metadata?: ApiHandlerCreateMessageMetadata,
		isNative?: boolean,
		requestId?: string,
	): ApiStream {
		await this.updateModelInfo()
		const modelInfo = this.getModel().info
		const methodIsAzureAiInference = this._isAzureAiInference(this.baseURL)

		if (this.options.openAiStreamingEnabled ?? true) {
			const isGrokXAI = this._isGrokXAI(this.baseURL)

			const requestOptions: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
				model: modelId,
				messages: [
					{
						role: "developer",
						content: `Formatting re-enabled\n${systemPrompt}`,
					},
					...convertToOpenAiMessages(messages),
				],
				stream: true,
				...(isGrokXAI ? {} : { stream_options: { include_usage: true } }),
				reasoning_effort: modelInfo.reasoningEffort as "low" | "medium" | "high" | undefined,
				temperature: undefined,
				...(isNative
					? {
							...(metadata?.tools && { tools: this.convertToolsForOpenAI(metadata.tools) }),
							...(metadata?.tool_choice && { tool_choice: metadata.tool_choice }),
							...{ parallel_tool_calls: metadata?.parallelToolCalls ?? true },
						}
					: undefined),
			}

			// O3 family models do not support the deprecated max_tokens parameter
			// but they do support max_completion_tokens (the modern OpenAI parameter)
			// This allows O3 models to limit response length when includeMaxTokens is enabled
			this.addMaxTokensIfNeeded(requestOptions, modelInfo)
			let stream
			try {
				stream = await (this.client as OpenAI).chat.completions.create(
					requestOptions,
					Object.assign(methodIsAzureAiInference ? { path: OPENAI_AZURE_AI_INFERENCE_PATH } : {}, {
						signal: this.abortController?.signal,
					}),
				)
			} catch (error) {
				throw handleOpenAIError(error, this.providerName)
			}

			yield* this.handleStreamResponse(stream, requestId)
		} else {
			const requestOptions: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
				model: modelId,
				messages: [
					{
						role: "developer",
						content: `Formatting re-enabled\n${systemPrompt}`,
					},
					...convertToOpenAiMessages(messages),
				],
				reasoning_effort: modelInfo.reasoningEffort as "low" | "medium" | "high" | undefined,
				temperature: undefined,
				...(isNative
					? {
							...(metadata?.tools && { tools: this.convertToolsForOpenAI(metadata.tools) }),
							...(metadata?.tool_choice && { tool_choice: metadata.tool_choice }),
							...{ parallel_tool_calls: metadata?.parallelToolCalls ?? true },
						}
					: undefined),
			}

			// O3 family models do not support the deprecated max_tokens parameter
			// but they do support max_completion_tokens (the modern OpenAI parameter)
			// This allows O3 models to limit response length when includeMaxTokens is enabled
			this.addMaxTokensIfNeeded(requestOptions, modelInfo)

			let response
			try {
				response = await (this.client as OpenAI).chat.completions.create(
					requestOptions,
					Object.assign(methodIsAzureAiInference ? { path: OPENAI_AZURE_AI_INFERENCE_PATH } : {}, {
						signal: this.abortController?.signal,
					}),
				)
			} catch (error) {
				throw handleOpenAIError(error, this.providerName)
			}

			const message = response.choices?.[0]?.message
			if (message?.tool_calls) {
				for (const toolCall of message.tool_calls) {
					if (toolCall.type === "function") {
						yield {
							type: "tool_call",
							id: toolCall.id,
							name: toolCall.function.name,
							arguments: toolCall.function.arguments,
						}
					}
				}
			}

			yield {
				type: "text",
				text: message?.content || "",
			}
			yield this.processUsageMetrics(response.usage)
		}
	}

	private async *handleStreamResponse(
		stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>,
		requestId?: string,
	): ApiStream {
		// Check if request was aborted
		if (this.abortController?.signal.aborted) {
			return
		}
		const activeToolCallIds = new Set<string>()

		for await (const chunk of stream) {
			// Check if request was aborted
			if (this.abortController?.signal.aborted) {
				break
			}
			const delta = chunk.choices?.[0]?.delta
			const finishReason = chunk.choices?.[0]?.finish_reason

			if (delta) {
				if (delta.content) {
					yield {
						type: "text",
						text: delta.content,
					}
				}

				yield* this.processToolCalls(delta, finishReason, activeToolCallIds, requestId)
			}

			if (chunk.usage) {
				yield {
					type: "usage",
					inputTokens: chunk.usage.prompt_tokens || 0,
					outputTokens: chunk.usage.completion_tokens || 0,
				}
			}
		}
	}

	private _getUrlHost(baseUrl?: string): string {
		try {
			return new URL(baseUrl ?? "").host
		} catch (error) {
			return ""
		}
	}

	private _isGrokXAI(baseUrl?: string): boolean {
		const urlHost = this._getUrlHost(baseUrl)
		return urlHost.includes("x.ai")
	}

	private _isAzureAiInference(baseUrl?: string): boolean {
		const urlHost = this._getUrlHost(baseUrl)
		return urlHost.endsWith(".services.ai.azure.com")
	}

	/**
	 * Adds max_completion_tokens to the request body if needed based on provider configuration
	 * Note: max_tokens is deprecated in favor of max_completion_tokens as per OpenAI documentation
	 * O3 family models handle max_tokens separately in handleO3FamilyMessage
	 */
	private addMaxTokensIfNeeded(
		requestOptions:
			| OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming
			| OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
		modelInfo: ModelInfo,
	): void {
		// Check if it's auto mode
		const isAutoMode = modelInfo.id === "Auto" || modelInfo.id === "auto"

		// Only add max_completion_tokens if includeMaxTokens is true
		if (this.options.useZgsmCustomConfig && isDebug()) {
			const maxTokens = this.options.modelMaxTokens || modelInfo.maxTokens
			// Use user-configured modelMaxTokens if available, otherwise fall back to model's default maxTokens
			// Using max_completion_tokens as max_tokens is deprecated
			if (this.options.includeMaxTokens) {
				Object.assign(requestOptions, {
					[modelInfo.maxTokensKey || "max_completion_tokens"]: maxTokens,
				})
			} else {
				Object.assign(requestOptions, {
					max_tokens: modelInfo.maxTokens,
					max_completion_tokens: modelInfo.maxTokens,
				})
			}
		} else {
			// If maxTokensKey exists, use it directly
			if (modelInfo.maxTokensKey) {
				Object.assign(requestOptions, {
					[modelInfo.maxTokensKey]: modelInfo.maxTokens,
				})
			} else if (!isAutoMode) {
				// Logic for non-auto mode
				// If maxTokensKey doesn't exist, use both max_tokens and max_completion_tokens
				Object.assign(requestOptions, {
					max_tokens: modelInfo.maxTokens,
					max_completion_tokens: modelInfo.maxTokens,
				})
			}
		}
	}

	setChatType(type: "user" | "system"): void {
		this.chatType = type
	}

	getChatType() {
		return this.chatType
	}

	cancelChat(reason?: ClineApiReqCancelReason): void {
		try {
			if (!this.abortController) return
			if (reason === "user_cancelled") {
				this.logger.info(`[cancelChat] User Cancelled chat request: ${reason}`)
			} else {
				this.logger.info(`[cancelChat] AI Cancelled chat request: ${reason}`)
			}
			this.abortController?.abort(reason)
			this.abortController = undefined
		} catch (error) {
			this.logger.info(`Error while cancelling message ${error}`)
		}
	}
}
