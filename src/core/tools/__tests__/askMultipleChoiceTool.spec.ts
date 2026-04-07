import { askMultipleChoiceTool } from "../AskMultipleChoiceTool"
import type { ToolUse } from "../../../shared/tools"

describe("askMultipleChoiceTool", () => {
	let mockCline: any
	let mockPushToolResult: any
	let toolResult: any

	beforeEach(() => {
		vi.clearAllMocks()

		mockCline = {
			ask: vi.fn().mockResolvedValue({ response: "multipleChoiceResponse", text: '{"q1":["a"]}', images: [] }),
			say: vi.fn().mockResolvedValue(undefined),
			sayAndCreateMissingParamError: vi.fn().mockResolvedValue("Missing parameter error"),
			consecutiveMistakeCount: 0,
			recordToolError: vi.fn(),
			didToolFailInCurrentTurn: false,
			userMessageContent: [],
		}

		mockPushToolResult = vi.fn((result) => {
			toolResult = result
		})
	})

	it("should ask normally for valid multiple choice payload", async () => {
		const block: ToolUse<"ask_multiple_choice"> = {
			type: "tool_use",
			name: "ask_multiple_choice",
			params: {
				title: "Choose one",
			},
			nativeArgs: {
				title: "Choose one",
				questions: [
					{
						id: "q1",
						prompt: "Select an option",
						options: [
							{ id: "a", label: "A" },
							{ id: "b", label: "B" },
						],
					},
				],
			},
			partial: false,
		}

		await askMultipleChoiceTool.handle(mockCline, block, {
			askApproval: vi.fn(),
			handleError: vi.fn(),
			pushToolResult: mockPushToolResult,
		})

		expect(mockCline.ask).toHaveBeenCalledWith(
			"multiple_choice",
			expect.stringContaining('"questions":[{"id":"q1"'),
			false,
		)
		expect(toolResult).toContain("<question_id>q1</question_id>")
	})

	it("should include custom answer text in selected_options", async () => {
		mockCline.ask.mockResolvedValue({
			response: "multipleChoiceResponse",
			text: '{"q1":{"selectedOptionIds":["a"],"customAnswer":"Use SQLite for local dev"}}',
			images: [],
		})

		const block: ToolUse<"ask_multiple_choice"> = {
			type: "tool_use",
			name: "ask_multiple_choice",
			params: {
				title: "Choose one",
			},
			nativeArgs: {
				title: "Choose one",
				questions: [
					{
						id: "q1",
						prompt: "Select an option",
						options: [
							{ id: "a", label: "A", recommended: true },
							{ id: "b", label: "B" },
						],
					},
				],
			} as any,
			partial: false,
		}

		await askMultipleChoiceTool.handle(mockCline, block, {
			askApproval: vi.fn(),
			handleError: vi.fn(),
			pushToolResult: mockPushToolResult,
		})

		expect(toolResult).toContain("A, Use SQLite for local dev")
	})

	it("should pass through free-form chat input instead of parsing it as multiple choice JSON", async () => {
		mockCline.ask.mockResolvedValue({
			response: "messageResponse",
			text: "继续",
			images: [],
		})

		const block: ToolUse<"ask_multiple_choice"> = {
			type: "tool_use",
			name: "ask_multiple_choice",
			params: {
				title: "Choose one",
			},
			nativeArgs: {
				title: "Choose one",
				questions: [
					{
						id: "q1",
						prompt: "Select an option",
						options: [
							{ id: "a", label: "A" },
							{ id: "b", label: "B" },
						],
					},
				],
			},
			partial: false,
		}

		await askMultipleChoiceTool.handle(mockCline, block, {
			askApproval: vi.fn(),
			handleError: vi.fn(),
			pushToolResult: mockPushToolResult,
		})

		expect(mockCline.say).toHaveBeenCalledWith("user_feedback", "继续", [])
		expect(mockCline.userMessageContent).toEqual([{ type: "text", text: "继续" }])
		expect(mockPushToolResult).not.toHaveBeenCalled()
	})

	it("should preserve image-only free-form chat input while multiple_choice is pending", async () => {
		mockCline.ask.mockResolvedValue({
			response: "messageResponse",
			text: "",
			images: ["data:image/png;base64,abc"],
		})

		const block: ToolUse<"ask_multiple_choice"> = {
			type: "tool_use",
			name: "ask_multiple_choice",
			params: { title: "Choose one" },
			nativeArgs: {
				title: "Choose one",
				questions: [
					{
						id: "q1",
						prompt: "Select an option",
						options: [
							{ id: "a", label: "A" },
							{ id: "b", label: "B" },
						],
					},
				],
			},
			partial: false,
		}

		await askMultipleChoiceTool.handle(mockCline, block, {
			askApproval: vi.fn(),
			handleError: vi.fn(),
			pushToolResult: mockPushToolResult,
		})

		expect(mockCline.say).toHaveBeenCalledWith("user_feedback", "", ["data:image/png;base64,abc"])
		expect(mockCline.userMessageContent).toEqual([
			{ type: "image", source: { type: "base64", media_type: "image/png", data: "abc" } },
		])
		expect(mockPushToolResult).not.toHaveBeenCalled()
	})

	describe("parameter validation", () => {
		it("should reject empty questions", async () => {
			const block: ToolUse<"ask_multiple_choice"> = {
				type: "tool_use",
				name: "ask_multiple_choice",
				params: {},
				nativeArgs: {
					questions: [],
				},
				partial: false,
			}

			await askMultipleChoiceTool.handle(mockCline, block, {
				askApproval: vi.fn(),
				handleError: vi.fn(),
				pushToolResult: mockPushToolResult,
			})

			expect(mockCline.sayAndCreateMissingParamError).not.toHaveBeenCalled()
			expect(mockCline.recordToolError).toHaveBeenCalledWith("ask_multiple_choice")
			expect(mockCline.say).toHaveBeenCalledWith(
				"error",
				expect.stringContaining("it must be a non-empty array with at least one question"),
			)
			expect(toolResult).toContain("Retry with questions")
			expect(mockCline.didToolFailInCurrentTurn).toBe(true)
			expect(mockCline.consecutiveMistakeCount).toBe(1)
			expect(mockCline.ask).not.toHaveBeenCalled()
		})

		it("should reject questions with fewer than two options", async () => {
			const block: ToolUse<"ask_multiple_choice"> = {
				type: "tool_use",
				name: "ask_multiple_choice",
				params: {},
				nativeArgs: {
					questions: [
						{
							id: "q1",
							prompt: "Select an option",
							options: [{ id: "a", label: "A" }],
						},
					],
				},
				partial: false,
			}

			await askMultipleChoiceTool.handle(mockCline, block, {
				askApproval: vi.fn(),
				handleError: vi.fn(),
				pushToolResult: mockPushToolResult,
			})

			expect(mockCline.say).toHaveBeenCalledWith(
				"error",
				expect.stringContaining("each question must include at least two options"),
			)
			expect(toolResult).toContain("options: [{ id, label }, { id, label }]")
			expect(mockCline.recordToolError).toHaveBeenCalledWith("ask_multiple_choice")
			expect(mockCline.didToolFailInCurrentTurn).toBe(true)
			expect(mockCline.consecutiveMistakeCount).toBe(1)
			expect(mockCline.ask).not.toHaveBeenCalled()
		})

		it("should reject missing question id as similar invalid payload", async () => {
			const block: ToolUse<"ask_multiple_choice"> = {
				type: "tool_use",
				name: "ask_multiple_choice",
				params: {},
				nativeArgs: {
					questions: [
						{
							id: undefined as unknown as string,
							prompt: "Select an option",
							options: [
								{ id: "a", label: "A" },
								{ id: "b", label: "B" },
							],
						},
					],
				} as any,
				partial: false,
			}

			await askMultipleChoiceTool.handle(mockCline, block, {
				askApproval: vi.fn(),
				handleError: vi.fn(),
				pushToolResult: mockPushToolResult,
			})

			expect(mockCline.say).toHaveBeenCalledWith(
				"error",
				expect.stringContaining("every question must include a unique string id"),
			)
			expect(toolResult).toContain("question_id")
			expect(mockCline.recordToolError).toHaveBeenCalledWith("ask_multiple_choice")
			expect(mockCline.didToolFailInCurrentTurn).toBe(true)
			expect(mockCline.consecutiveMistakeCount).toBe(1)
			expect(mockCline.ask).not.toHaveBeenCalled()
		})
	})
})
