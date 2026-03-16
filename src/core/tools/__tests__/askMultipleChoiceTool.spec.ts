import { askMultipleChoiceTool } from "../AskMultipleChoiceTool"
import type { ToolUse } from "../../../shared/tools"

describe("askMultipleChoiceTool", () => {
	let mockTask: any

	beforeEach(() => {
		vi.clearAllMocks()
		mockTask = {
			ask: vi.fn().mockResolvedValue({ text: "{}", images: [] }),
			say: vi.fn().mockResolvedValue(undefined),
			consecutiveMistakeCount: 0,
		}
	})

	it("sends the full questionnaire payload during partial streaming", async () => {
		const block: ToolUse<"ask_multiple_choice"> = {
			type: "tool_use",
			name: "ask_multiple_choice",
			params: {},
			partial: true,
			nativeArgs: {
				title: "Questionnaire",
				questions: [
					{
						id: "question_1",
						prompt: "What calculator type do you want?",
						options: [
							{ id: "opt_1", label: "CLI" },
							{ id: "opt_2", label: "GUI" },
						],
						allow_multiple: false,
					},
				],
			},
		}

		await askMultipleChoiceTool.handle(mockTask, block, {
			askApproval: vi.fn(),
			handleError: vi.fn(),
			pushToolResult: vi.fn(),
		})

		expect(mockTask.ask).toHaveBeenCalledWith(
			"multiple_choice",
			JSON.stringify({
				title: "Questionnaire",
				questions: [
					{
						id: "question_1",
						prompt: "What calculator type do you want?",
						options: [
							{ id: "opt_1", label: "CLI" },
							{ id: "opt_2", label: "GUI" },
						],
						allow_multiple: false,
					},
				],
			}),
			true,
		)
	})
})
