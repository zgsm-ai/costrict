import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../../../utils/getClientId", () => ({
	getClientId: vi.fn(() => "client-id"),
}))

vi.mock("../../../../../shared/headers", () => ({
	COSTRICT_DEFAULT_HEADERS: { "User-Agent": "test-agent" },
}))

vi.mock("../../runtime-config", () => ({
	readCostrictWellKnownConfig: vi.fn(() => ({ services: [] })),
	waitForCompletionAgentConfig: vi.fn().mockResolvedValue(null),
	ensureCompletionRuntimeReady: vi.fn().mockResolvedValue(undefined),
	ensureCostrictRuntimeInstalled: vi.fn().mockResolvedValue("noUpdate"),
	getRuntimeBinaryPath: vi.fn(() => "/tmp/home/.costrict/bin/costrict"),
	getRuntimeProcessName: vi.fn(() => "costrict"),
}))

import { CompletionProvider } from "./completionProvider"
import * as runtimeConfig from "../../runtime-config"

describe("CompletionProvider", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		vi.mocked(runtimeConfig.readCostrictWellKnownConfig).mockReturnValue({ services: [] })
		vi.mocked(runtimeConfig.waitForCompletionAgentConfig).mockResolvedValue(null)
		vi.mocked(runtimeConfig.ensureCompletionRuntimeReady).mockResolvedValue(undefined)
		vi.stubGlobal("fetch", vi.fn())
	})

	it("does not fetch localhost:undefined when completion-agent is missing", async () => {
		const onError = vi.fn()
		const provider = new CompletionProvider({} as any, onError)

		const result = await provider.provideInlineCompletionItems(
			{
				completionId: "completion-1",
				languageId: "typescript",
				previousCompletionId: "",
				filepath: "src/test.ts",
				calculateHideScore: {
					is_whitespace_after_cursor: true,
					document_length: 1,
					prompt_end_pos: 1,
					previous_label: 0,
					previous_label_timestamp: 0,
				},
				promptOptions: {
					prefix: "const a = ",
					suffix: "",
					project_path: "/tmp/project",
					file_project_path: "src/test.ts",
					import_content: "",
					recently_edited_ranges: [],
					recently_visited_ranges: [],
					clipboard_content: [],
					recently_opened_files: [],
				},
			},
			AbortSignal.timeout(5000),
		)

		expect(result).toBeUndefined()
		expect(runtimeConfig.ensureCompletionRuntimeReady).toHaveBeenCalledTimes(1)
		expect(runtimeConfig.waitForCompletionAgentConfig).toHaveBeenCalledWith(2000)
		expect(fetch).not.toHaveBeenCalled()
		expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "Completion agent is not ready" }))
	})

	it("waits for delayed completion-agent config before fetching", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: vi.fn().mockResolvedValue({
				id: "cmpl-1",
				choices: [{ text: "completion text" }],
			}),
		})
		vi.stubGlobal("fetch", fetchMock)
		vi.mocked(runtimeConfig.waitForCompletionAgentConfig).mockResolvedValue({
			name: "completion-agent",
			protocol: "http",
			port: 43111,
			status: "running",
		})

		const provider = new CompletionProvider({} as any, vi.fn())
		const result = await provider.provideInlineCompletionItems(
			{
				completionId: "completion-2",
				languageId: "typescript",
				previousCompletionId: "",
				filepath: "src/test.ts",
				calculateHideScore: {
					is_whitespace_after_cursor: true,
					document_length: 1,
					prompt_end_pos: 1,
					previous_label: 0,
					previous_label_timestamp: 0,
				},
				promptOptions: {
					prefix: "const a = ",
					suffix: "",
					project_path: "/tmp/project",
					file_project_path: "src/test.ts",
					import_content: "",
					recently_edited_ranges: [],
					recently_visited_ranges: [],
					clipboard_content: [],
					recently_opened_files: [],
				},
			},
			AbortSignal.timeout(5000),
		)

		expect(runtimeConfig.ensureCompletionRuntimeReady).toHaveBeenCalledTimes(1)
		expect(runtimeConfig.waitForCompletionAgentConfig).toHaveBeenCalledWith(2000)
		expect(fetchMock).toHaveBeenCalledWith(
			expect.stringContaining("http://localhost:43111/completion-agent/api/v1/completions"),
			expect.objectContaining({ method: "post" }),
		)
		expect(result).toEqual(
			expect.objectContaining({
				completion: "completion text",
				completionId: "cmpl-1",
			}),
		)
	})
})
