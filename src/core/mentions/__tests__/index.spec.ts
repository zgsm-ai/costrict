// npx vitest core/mentions/__tests__/index.spec.ts

import * as fs from "fs/promises"
import * as vscode from "vscode"

import { extractTextFromFileWithMetadata } from "../../../integrations/misc/extract-text"
import { parseMentions, MAX_MENTION_CONTEXT_CHARS } from "../index"

// Mock vscode
vi.mock("vscode", async (importOriginal) => ({
	...(await importOriginal()),
	window: {
		showErrorMessage: vi.fn(),
		createTextEditorDecorationType: vi.fn(),
		createOutputChannel: () => ({
			appendLine: vi.fn(),
			show: vi.fn(),
		}),
	},
	extensions: {
		getExtension: vi.fn().mockReturnValue({
			extensionUri: { fsPath: "/test/extension/path" },
		}),
		all: [],
	},
}))

// Mock i18n
vi.mock("../../../i18n", () => ({
	t: vi.fn((key: string) => key),
}))

vi.mock("fs/promises", async (importOriginal) => {
	const actual = await importOriginal<typeof import("fs/promises")>()
	return {
		...actual,
		stat: vi.fn(),
	}
})

vi.mock("../../../integrations/misc/extract-text", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../../../integrations/misc/extract-text")>()
	return {
		...actual,
		extractTextFromFileWithMetadata: vi.fn(),
	}
})

describe("parseMentions - URL mention handling", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("should replace URL mentions with quoted URL reference", async () => {
		const result = await parseMentions("Check @https://example.com", "/test")

		// URL mentions are now replaced with a quoted reference (no fetching)
		expect(result.text).toContain("'https://example.com'")
	})
})

describe("parseMentions - mention context budget", () => {
	const tempCwd = "/tmp/parse-mentions-budget-tests"

	beforeEach(async () => {
		vi.clearAllMocks()
		await fs.rm(tempCwd, { recursive: true, force: true })
		await fs.mkdir(`${tempCwd}/src`, { recursive: true })
		await fs.writeFile(`${tempCwd}/src/a.ts`, "export const a = 1")
		await fs.writeFile(`${tempCwd}/src/b.ts`, "export const b = 2")
		await fs.writeFile(`${tempCwd}/src/first.ts`, "export const first = true")
		await fs.writeFile(`${tempCwd}/src/second.ts`, "export const second = true")
	})

	afterEach(async () => {
		await fs.rm(tempCwd, { recursive: true, force: true })
	})

	it("should append a budget notice when later file mentions exceed the total mention budget", async () => {
		const largeContent = "x".repeat(Math.floor(MAX_MENTION_CONTEXT_CHARS * 0.75))
		vi.mocked(extractTextFromFileWithMetadata)
			.mockResolvedValueOnce({
				content: largeContent,
				totalLines: 10,
				returnedLines: 10,
				wasTruncated: false,
			})
			.mockResolvedValueOnce({
				content: largeContent,
				totalLines: 10,
				returnedLines: 10,
				wasTruncated: false,
			})

		const result = await parseMentions("Review @/src/a.ts and @/src/b.ts", tempCwd)

		expect(result.contentBlocks).toHaveLength(2)
		expect(result.contentBlocks[0]).toMatchObject({
			type: "file",
			path: "src/a.ts",
		})
		expect(result.contentBlocks[1].content).toContain("[mention_budget_notice]")
		expect(result.contentBlocks[1].content).toContain("Included within budget:\n- @src/a.ts")
		expect(result.contentBlocks[1].content).toContain("Omitted due to budget:\n- @src/b.ts")
	})

	it("should keep included file mentions in user mention order while applying the budget", async () => {
		vi.mocked(extractTextFromFileWithMetadata)
			.mockResolvedValueOnce({
				content: "alpha",
				totalLines: 1,
				returnedLines: 1,
				wasTruncated: false,
			})
			.mockResolvedValueOnce({
				content: "beta",
				totalLines: 1,
				returnedLines: 1,
				wasTruncated: false,
			})

		const result = await parseMentions("Inspect @/src/first.ts then @/src/second.ts", tempCwd)

		expect(result.contentBlocks.map((block) => block.path)).toEqual(["src/first.ts", "src/second.ts"])
	})
})
