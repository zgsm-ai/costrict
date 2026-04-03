import { getToolUseGuidelinesSection } from "../tool-use-guidelines"

describe("getToolUseGuidelinesSection", () => {
	it("should include proper numbered guidelines", () => {
		const guidelines = getToolUseGuidelinesSection()

		expect(guidelines).toContain("1. Assess available information")
		expect(guidelines).toContain("2. Multiple tools may be called")
		expect(guidelines).toContain("3. Before editing code")
	})

	it("should include multiple-tools-per-message guidance", () => {
		const guidelines = getToolUseGuidelinesSection()

		expect(guidelines).toContain("Multiple tools may be called in one message")
		expect(guidelines).not.toContain("use one tool at a time per message")
	})

	it("should include read-before-edit guidance", () => {
		const guidelines = getToolUseGuidelinesSection()

		expect(guidelines).toContain("read sufficient surrounding context")
	})

	it("should include attempt_completion finality rule", () => {
		const guidelines = getToolUseGuidelinesSection()

		expect(guidelines).toContain("attempt_completion")
		expect(guidelines).toContain("output must be final")
	})

	it("should not include XML formatting instructions", () => {
		const guidelines = getToolUseGuidelinesSection()

		expect(guidelines).not.toContain("<actual_tool_name>")
	})

	it("should not include per-tool confirmation guidelines", () => {
		const guidelines = getToolUseGuidelinesSection()

		expect(guidelines).not.toContain("After each tool use, the user will respond with the result")
	})
})
