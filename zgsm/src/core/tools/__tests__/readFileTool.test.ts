// npx jest zgsm/src/core/tools/__tests__/readFileTool.test.ts

import { truncateContent } from "../readFileTool"

describe("truncateContent", () => {
	const maxLines = 5 // Use smaller line limit for testing

	// Tests for default limits
	describe("default limits", () => {
		it("should return original content when under both limits", () => {
			const content = "line1\nline2\nline3"
			const [result] = truncateContent(content)
			expect(result).toBe(content)
		})

		it("should truncate by lines when exceeding line limit", () => {
			const lines = Array.from({ length: 600 }, (_, i) => `line${i + 1}`)
			const content = lines.join("\n")
			const [context] = truncateContent(content)

			const resultLines = context.split("\n")
			expect(resultLines.length).toBe(501)
			expect(resultLines[0]).toBe("line1")
			expect(resultLines[499]).toBe("line500")
			expect(context.endsWith("\n")).toBeTruthy()
		})

		it("should truncate by chars when exceeding character limit", () => {
			const longContent = "a".repeat(25000)
			const [result] = truncateContent(longContent)

			expect(result.length).toBe(20000)
			expect(result).toBe(longContent.substring(0, 20000))
		})
	})

	// Tests for custom line limits
	describe("custom line limit", () => {
		it("should respect custom line limit", () => {
			const lines = Array.from({ length: 10 }, (_, i) => `line${i + 1}`)
			const content = lines.join("\n")
			const [context] = truncateContent(content, maxLines)
			const resultLines = context.split("\n")
			expect(resultLines.length).toBe(maxLines + 1)
			expect(resultLines[0]).toBe("line1")
			expect(resultLines[maxLines - 1]).toBe(`line${maxLines}`)
		})

		it("should use default when custom line limit is 0 or negative", () => {
			const lines = Array.from({ length: 600 }, (_, i) => `line${i + 1}`)
			const content = lines.join("\n")

			const [result1] = truncateContent(content, 0)

			expect(result1.split("\n").length).toBe(501)

			const [result2] = truncateContent(content, -10)

			expect(result2.split("\n").length).toBe(501)
		})
	})

	// Tests for edge cases
	describe("edge cases", () => {
		it("should handle empty string", () => {
			expect(truncateContent("")[0]).toBe("")
		})

		it("should handle content exactly at limits", () => {
			const exactLines = Array.from({ length: 500 }, (_, i) => `line${i + 1}`)
			const exactLineContent = exactLines.join("\n")
			expect(truncateContent(exactLineContent)[0].split("\n").length).toBe(500)

			const exactCharsContent = "a".repeat(20000)
			expect(truncateContent(exactCharsContent)[0].length).toBe(20000)
		})
	})
})
