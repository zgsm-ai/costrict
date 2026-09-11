// npx vitest run src/api/providers/__tests__/orcarouter.spec.ts

// Mock vscode first to avoid import errors
vitest.mock("vscode", () => ({}))

import { Anthropic } from "@anthropic-ai/sdk"
import OpenAI from "openai"

import { OrcaRouterHandler } from "../orcarouter"
import { ApiHandlerOptions } from "../../../shared/api"
import { orcaRouterDefaultModelId, ORCAROUTER_DEFAULT_TEMPERATURE } from "@roo-code/types"

// Mock dependencies
vitest.mock("openai")
vitest.mock("delay", () => ({ default: vitest.fn(() => Promise.resolve()) }))
vitest.mock("../fetchers/modelCache", () => ({
	getModels: vitest.fn().mockImplementation(() => {
		return Promise.resolve({
			"orcarouter/auto": {
				maxTokens: 64000,
				contextWindow: 200000,
				supportsImages: true,
				supportsPromptCache: true,
				inputPrice: 3,
				outputPrice: 15,
				cacheWritesPrice: 3.75,
				cacheReadsPrice: 0.3,
				description: "OrcaRouter auto",
			},
			"anthropic/claude-sonnet-4": {
				maxTokens: 64000,
				contextWindow: 200000,
				supportsImages: true,
				supportsPromptCache: true,
				inputPrice: 3,
				outputPrice: 15,
				cacheWritesPrice: 3.75,
				cacheReadsPrice: 0.3,
				description: "Claude Sonnet 4",
			},
			"openai/gpt-4o": {
				maxTokens: 16000,
				contextWindow: 128000,
				supportsImages: true,
				supportsPromptCache: true,
				inputPrice: 2.5,
				outputPrice: 10,
				cacheWritesPrice: 3.125,
				cacheReadsPrice: 0.25,
				description: "GPT-4o",
			},
		})
	}),
	getModelsFromCache: vitest.fn().mockReturnValue(undefined),
}))

const mockCreate = vitest.fn()
const mockConstructor = vitest.fn()

;(OpenAI as any).mockImplementation(() => ({
	chat: {
		completions: {
			create: mockCreate,
		},
	},
}))
;(OpenAI as any).mockImplementation = mockConstructor.mockReturnValue({
	chat: {
		completions: {
			create: mockCreate,
		},
	},
})

describe("OrcaRouterHandler", () => {
	const mockOptions: ApiHandlerOptions = {
		orcaRouterApiKey: "test-key",
		orcaRouterModelId: "orcarouter/auto",
	}

	beforeEach(() => {
		vitest.clearAllMocks()
		mockCreate.mockClear()
		mockConstructor.mockClear()
	})

	it("initializes with correct options", () => {
		const handler = new OrcaRouterHandler(mockOptions)
		expect(handler).toBeInstanceOf(OrcaRouterHandler)

		expect(OpenAI).toHaveBeenCalledWith({
			baseURL: "https://api.orcarouter.ai/v1",
			apiKey: mockOptions.orcaRouterApiKey,
			defaultHeaders: {
				"HTTP-Referer": "https://github.com/RooVetGit/Roo-Cline",
				"X-Title": "Roo Code",
				"User-Agent": expect.any(String),
				"X-Costrict-Version": expect.any(String),
			},
		})
	})

	describe("fetchModel", () => {
		it("returns correct model info when options are provided", async () => {
			const handler = new OrcaRouterHandler(mockOptions)
			const result = await handler.fetchModel()

			expect(result.id).toBe(mockOptions.orcaRouterModelId)
			expect(result.info.maxTokens).toBe(64000)
			expect(result.info.contextWindow).toBe(200000)
			expect(result.info.supportsImages).toBe(true)
			expect(result.info.supportsPromptCache).toBe(true)
		})

		it("returns default model info when options are not provided", async () => {
			const handler = new OrcaRouterHandler({})
			const result = await handler.fetchModel()
			expect(result.id).toBe(orcaRouterDefaultModelId)
			expect(result.info.supportsPromptCache).toBe(true)
		})
	})

	describe("createMessage", () => {
		beforeEach(() => {
			mockCreate.mockImplementation(async () => ({
				[Symbol.asyncIterator]: async function* () {
					yield {
						choices: [
							{
								delta: { content: "Test response" },
								index: 0,
							},
						],
						usage: null,
					}
					yield {
						choices: [
							{
								delta: {},
								index: 0,
							},
						],
						usage: {
							prompt_tokens: 10,
							completion_tokens: 5,
							total_tokens: 15,
							prompt_tokens_details: {
								cached_tokens: 3,
							},
						},
					}
				},
			}))
		})

		it("streams text content correctly", async () => {
			const handler = new OrcaRouterHandler(mockOptions)
			const systemPrompt = "You are a helpful assistant."
			const messages: Anthropic.Messages.MessageParam[] = [{ role: "user", content: "Hello" }]

			const stream = handler.createMessage(systemPrompt, messages)
			const chunks = []
			for await (const chunk of stream) {
				chunks.push(chunk)
			}

			expect(chunks).toHaveLength(2)
			expect(chunks[0]).toEqual({
				type: "text",
				text: "Test response",
			})
			expect(chunks[1]).toEqual({
				type: "usage",
				inputTokens: 10,
				outputTokens: 5,
				cacheReadTokens: 3,
				totalCost: 0,
			})
		})

		it("uses correct temperature from options", async () => {
			const customTemp = 0.5
			const handler = new OrcaRouterHandler({
				...mockOptions,
				modelTemperature: customTemp,
			})

			const systemPrompt = "You are a helpful assistant."
			const messages: Anthropic.Messages.MessageParam[] = [{ role: "user", content: "Hello" }]

			await handler.createMessage(systemPrompt, messages).next()

			expect(mockCreate).toHaveBeenCalledWith(
				expect.objectContaining({
					temperature: customTemp,
				}),
			)
		})

		it("uses default temperature when none provided", async () => {
			const handler = new OrcaRouterHandler(mockOptions)

			const systemPrompt = "You are a helpful assistant."
			const messages: Anthropic.Messages.MessageParam[] = [{ role: "user", content: "Hello" }]

			await handler.createMessage(systemPrompt, messages).next()

			expect(mockCreate).toHaveBeenCalledWith(
				expect.objectContaining({
					temperature: ORCAROUTER_DEFAULT_TEMPERATURE,
				}),
			)
		})

		it("sets correct max_completion_tokens", async () => {
			const handler = new OrcaRouterHandler(mockOptions)

			const systemPrompt = "You are a helpful assistant."
			const messages: Anthropic.Messages.MessageParam[] = [{ role: "user", content: "Hello" }]

			await handler.createMessage(systemPrompt, messages).next()

			expect(mockCreate).toHaveBeenCalledWith(
				expect.objectContaining({
					max_completion_tokens: 64000,
				}),
			)
		})

		it("should include stream_options with include_usage", async () => {
			const handler = new OrcaRouterHandler(mockOptions)

			const messageGenerator = handler.createMessage("test prompt", [], {
				taskId: "test-task-id",
			})
			await messageGenerator.next()

			expect(mockCreate).toHaveBeenCalledWith(
				expect.objectContaining({
					stream_options: { include_usage: true },
				}),
			)
		})
	})

	describe("completePrompt", () => {
		beforeEach(() => {
			mockCreate.mockImplementation(async () => ({
				choices: [
					{
						message: { role: "assistant", content: "Test completion response" },
						finish_reason: "stop",
						index: 0,
					},
				],
				usage: {
					prompt_tokens: 8,
					completion_tokens: 4,
					total_tokens: 12,
				},
			}))
		})

		it("completes prompt correctly", async () => {
			const handler = new OrcaRouterHandler(mockOptions)
			const prompt = "Complete this: Hello"

			const result = await handler.completePrompt(prompt)

			expect(result).toBe("Test completion response")
			expect(mockCreate).toHaveBeenCalledWith(
				expect.objectContaining({
					model: "orcarouter/auto",
					messages: [{ role: "user", content: prompt }],
					stream: false,
					temperature: ORCAROUTER_DEFAULT_TEMPERATURE,
					max_completion_tokens: 64000,
				}),
				expect.objectContaining({
					signal: undefined,
				}),
			)
		})

		it("handles completion errors correctly", async () => {
			const handler = new OrcaRouterHandler(mockOptions)
			const errorMessage = "API error"

			mockCreate.mockImplementation(() => {
				throw new Error(errorMessage)
			})

			await expect(handler.completePrompt("Test")).rejects.toThrow(`OrcaRouter completion error: ${errorMessage}`)
		})
	})
})
