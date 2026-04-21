import { describe, expect, it } from "vitest"

import {
	buildPromptRequestBody,
	extractModelEntries,
	normalizeAgentsResponse,
	normalizeModelsResponse,
} from "../costrict-cloud/cloudAppAdapters"

describe("CloudApp response normalizers", () => {
	it("only exposes visible primary session modes as agent options", () => {
		const result = normalizeAgentsResponse({
			data: {
				modes: [
					{
						id: "code",
						label: "Code",
						description: "Primary coding mode",
						provider: "cs-cloud",
						available: true,
						mode: "primary",
						hidden: false,
					},
					{
						slug: "review",
						title: "Review",
						source: "builtin",
						available: false,
						mode: "secondary",
					},
					{
						id: "hidden-mode",
						label: "Hidden",
						mode: "primary",
						hidden: true,
					},
				],
			},
		})

		expect(result).toEqual([
			{
				id: "code",
				label: "Code",
				description: "Primary coding mode · cs-cloud",
				available: true,
			},
		])
	})

	it("supports payload array envelopes for agents", () => {
		const result = normalizeAgentsResponse({
			payload: [
				{
					slug: "planner",
					title: "Planner",
					source: "builtin",
					mode: "primary",
				},
			],
		})

		expect(result).toEqual([
			{
				id: "planner",
				label: "Planner",
				description: "builtin",
				available: true,
			},
		])
	})

	it("parses provider model maps into rich searchable model options", () => {
		const payload = {
			connected: [
				{
					id: "openai",
					name: "OpenAI",
					models: {
						"gpt-4o-2024-11-20": {
							id: "gpt-4o-2024-11-20",
							name: "GPT-4o (2024-11-20)",
							family: "gpt",
							status: "active",
							limit: { context: 128000 },
							capabilities: {
								input: { text: true, image: true, pdf: false },
								reasoning: false,
								toolcall: true,
							},
						},
					},
				},
			],
		}

		expect(extractModelEntries(payload)).toEqual([
			{
				id: "gpt-4o-2024-11-20",
				label: "GPT-4o (2024-11-20)",
				provider: "openai",
				providerLabel: "OpenAI",
				description: "OpenAI · active · gpt",
				family: "gpt",
				contextWindow: 128000,
				capabilities: ["文本", "图像", "不支持推理", "工具调用"],
			},
		])

		expect(normalizeModelsResponse(payload)).toEqual([
			{
				id: "gpt-4o-2024-11-20",
				label: "GPT-4o (2024-11-20)",
				provider: "openai",
				providerLabel: "OpenAI",
				description: "OpenAI · active · gpt",
				family: "gpt",
				contextWindow: 128000,
				capabilities: ["文本", "图像", "不支持推理", "工具调用"],
			},
		])
	})

	it("supports availableModels arrays and current model fallback entries", () => {
		const availableModelsResult = normalizeModelsResponse({
			availableModels: [
				{
					modelId: "claude-3-7-sonnet",
					label: "Claude 3.7 Sonnet",
					providerId: "anthropic",
					providerName: "Anthropic",
					context_window: 200000,
					capabilities: {
						input: { text: true, image: false, pdf: true },
						reasoning: true,
						toolcall: false,
					},
				},
			],
		})

		expect(availableModelsResult).toEqual([
			expect.objectContaining({
				id: "claude-3-7-sonnet",
				label: "Claude 3.7 Sonnet",
				provider: "anthropic",
				providerLabel: "Anthropic",
				contextWindow: 200000,
				capabilities: ["文本", "PDF", "支持推理", "不支持工具调用"],
			}),
		])

		const currentModelFallback = normalizeModelsResponse({
			current_model_id: "gpt-4.1",
			current_model_label: "GPT-4.1",
			can_switch: false,
		})

		expect(currentModelFallback).toEqual([
			{
				id: "gpt-4.1",
				label: "GPT-4.1",
				description: "当前模型",
			},
		])
	})

	it("builds prompt request bodies using parts and provider/model fields", () => {
		expect(
			buildPromptRequestBody({
				prompt: "你好",
				modelId: "gpt-4o-mini",
				providerId: "openai",
			}),
		).toEqual({
			parts: [{ type: "text", text: "你好" }],
			modelID: "gpt-4o-mini",
			providerID: "openai",
		})
	})

	it("keeps prompt requests minimal when provider/model are not supplied", () => {
		expect(buildPromptRequestBody({ prompt: "  hello world  " })).toEqual({
			parts: [{ type: "text", text: "hello world" }],
		})
	})
})
