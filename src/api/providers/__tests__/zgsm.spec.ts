// npx vitest run src/api/providers/__tests__/zgsm.spec.ts

import type { ApiHandlerOptions } from "../../../shared/api"

const mockOpenAI = vitest.fn().mockImplementation(() => ({}))
const mockAzureOpenAI = vitest.fn().mockImplementation(() => ({}))
const mockGetModels = vitest.fn().mockResolvedValue({
	Auto: { id: "Auto", maxTokens: 4096, contextWindow: 8192 },
	default: { id: "Auto", maxTokens: 4096, contextWindow: 8192 },
})

vitest.mock("openai", () => ({
	__esModule: true,
	default: mockOpenAI,
	AzureOpenAI: mockAzureOpenAI,
}))

vitest.mock("../fetchers/modelCache", () => ({
	getModels: mockGetModels,
}))

vitest.mock("../../../utils/logger", () => ({
	createLogger: vitest.fn().mockReturnValue({
		info: vitest.fn(),
		warn: vitest.fn(),
		error: vitest.fn(),
		debug: vitest.fn(),
	}),
}))

vitest.mock("../utils/timeout-config", () => ({
	getApiRequestTimeout: vitest.fn().mockReturnValue(30_000),
}))

vitest.mock("../utils/response-render-config", () => ({
	renderModes: {
		fast: { stream: true },
	},
	getApiResponseRenderMode: vitest.fn().mockReturnValue({ stream: true }),
}))

vitest.mock("../../../utils/getEditorType", () => ({
	getEditorType: vitest.fn().mockReturnValue("cli"),
}))

const { ZgsmAiHandler } = await import("../zgsm")

describe("ZgsmAiHandler", () => {
	const baseOptions: ApiHandlerOptions = {
		zgsmAccessToken: "test-token",
		zgsmModelId: "Auto",
		zgsmBaseUrl: "https://example.com",
	}

	beforeEach(() => {
		vitest.clearAllMocks()
	})

	describe("buildHeaders", () => {
		it("adds x-opencode-directory in cli mode", () => {
			const handler = new ZgsmAiHandler({
				...baseOptions,
				isCostrictCli: true,
			})

			const workspacePath = "/tmp/workspace with spaces"
			const headers = (handler as any).buildHeaders(
				{ language: "zh-CN", provider: "zgsm", mode: "code" },
				"request-1",
				"client-1",
				workspacePath,
				"user",
			)

			expect(headers["x-opencode-directory"]).toBe(encodeURIComponent(workspacePath))
			expect(headers["zgsm-project-path"]).toBe(encodeURI(workspacePath))
		})

		it("omits x-opencode-directory outside cli mode", () => {
			const handler = new ZgsmAiHandler(baseOptions)

			const headers = (handler as any).buildHeaders(
				{ language: "zh-CN", provider: "zgsm", mode: "code" },
				"request-2",
				"client-2",
				"/tmp/workspace",
				"user",
			)

			expect(headers).not.toHaveProperty("x-opencode-directory")
		})
	})

	describe("CLI tool name normalization", () => {
		it("rewrites raw OpenCode tools to costrict-cli MCP names in cli mode", () => {
			const handler = new ZgsmAiHandler({
				...baseOptions,
				isCostrictCli: true,
			})

			expect((handler as any).normalizeIncomingToolCallName("write")).toBe("mcp--costrict-cli--write")
			expect((handler as any).normalizeIncomingToolCallName("question")).toBe("question")
			expect((handler as any).normalizeIncomingToolCallName("new_task")).toBe("new_task")
			expect((handler as any).normalizeIncomingToolCallName("mcp--costrict-cli--write")).toBe(
				"mcp--costrict-cli--write",
			)
		})

		it("emits normalized tool_call_partial chunks for cli tool calls", () => {
			const handler = new ZgsmAiHandler({
				...baseOptions,
				isCostrictCli: true,
			})
			const activeToolCallIds = new Set<string>()
			const argumentsJson = JSON.stringify({
				filePath: "/tmp/test.ts",
				content: "export {}\n",
			})

			const chunks = [
				...(handler as any).processToolCalls(
					{
						tool_calls: [
							{
								index: 0,
								id: "call_1",
								function: {
									name: "write",
									arguments: argumentsJson,
								},
							},
						],
					},
					"tool_calls",
					activeToolCallIds,
					"request-3",
				),
			]

			expect(chunks).toEqual([
				{
					type: "tool_call_partial",
					index: 0,
					id: "call_1",
					name: "mcp--costrict-cli--write",
					arguments: argumentsJson,
				},
				{ type: "tool_call_end", id: "call_1" },
			])
		})

		it("keeps question tool_call_partial chunks raw in cli mode", () => {
			const handler = new ZgsmAiHandler({
				...baseOptions,
				isCostrictCli: true,
			})
			const activeToolCallIds = new Set<string>()
			const argumentsJson = JSON.stringify({
				questions: [
					{
						header: "Calculator type",
						multiple: false,
						options: [
							{ label: "CLI", description: "Run in terminal" },
							{ label: "GUI", description: "Desktop app" },
						],
						question: "What calculator type do you want?",
					},
				],
			})

			const chunks = [
				...(handler as any).processToolCalls(
					{
						tool_calls: [
							{
								index: 0,
								id: "call_q1",
								function: {
									name: "question",
									arguments: argumentsJson,
								},
							},
						],
					},
					"tool_calls",
					activeToolCallIds,
					"request-4",
				),
			]

			expect(chunks).toEqual([
				{
					type: "tool_call_partial",
					index: 0,
					id: "call_q1",
					name: "question",
					arguments: argumentsJson,
				},
				{ type: "tool_call_end", id: "call_q1" },
			])
		})
		it("does not rewrite raw tool names outside cli mode", () => {
			const handler = new ZgsmAiHandler(baseOptions)

			expect((handler as any).normalizeIncomingToolCallName("write")).toBe("write")
		})
	})
})
