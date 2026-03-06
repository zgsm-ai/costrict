import type OpenAI from "openai"
import fileOutline from "../file_outline"

// Helper type to access function tools
type FunctionTool = OpenAI.Chat.ChatCompletionTool & { type: "function" }

// Helper to get function definition from tool
const getFunctionDef = (tool: OpenAI.Chat.ChatCompletionTool) => (tool as FunctionTool).function

describe("file_outline", () => {
	describe("tool type and name", () => {
		it("should have correct tool type", () => {
			expect(fileOutline.type).toBe("function")
		})

		it("should have correct tool name", () => {
			expect(getFunctionDef(fileOutline).name).toBe("file_outline")
		})
	})

	describe("description", () => {
		it("should contain outline-related keywords", () => {
			const description = getFunctionDef(fileOutline).description
			expect(description).toContain("结构信息")
			expect(description).toContain("函数")
			expect(description).toContain("类")
			expect(description).toContain("文档字符串")
		})
	})

	describe("parameters", () => {
		it("should contain file_path parameter", () => {
			const schema = getFunctionDef(fileOutline).parameters as any
			expect(schema.properties).toHaveProperty("file_path")
			expect(schema.properties.file_path.type).toBe("string")
		})

		it("should contain include_docstrings parameter", () => {
			const schema = getFunctionDef(fileOutline).parameters as any
			expect(schema.properties).toHaveProperty("include_docstrings")
			expect(schema.properties.include_docstrings.type).toBe("boolean")
		})

		it("should require file_path parameter", () => {
			const schema = getFunctionDef(fileOutline).parameters as any
			expect(schema.required).toContain("file_path")
		})
	})

	describe("schema validation", () => {
		it("should have strict mode enabled", () => {
			expect(getFunctionDef(fileOutline).strict).toBe(true)
		})

		it("should have additionalProperties set to false", () => {
			const schema = getFunctionDef(fileOutline).parameters as any
			expect(schema.additionalProperties).toBe(false)
		})
	})
})
