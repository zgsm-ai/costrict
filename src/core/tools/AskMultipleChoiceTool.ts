import { Task } from "../task/Task"
import { formatResponse } from "../prompts/responses"
import { BaseTool, ToolCallbacks } from "./BaseTool"
import type { ToolUse } from "../../shared/tools"
import type { MultipleChoiceData, MultipleChoiceQuestion, MultipleChoiceOption } from "@roo-code/types"
import { t } from "../../i18n"

interface AskMultipleChoiceParams {
	title?: string
	questions: MultipleChoiceQuestion[]
}

interface ParsedOption {
	id: string
	label: string
}

interface ParsedQuestion {
	id: string
	prompt: string
	options: { option: ParsedOption | ParsedOption[] }
	allow_multiple?: string | boolean
}

export class AskMultipleChoiceTool extends BaseTool<"ask_multiple_choice"> {
	readonly name = "ask_multiple_choice" as const

	async execute(params: AskMultipleChoiceParams, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { title, questions } = params
		const { handleError, pushToolResult } = callbacks

		try {
			const multipleChoiceData: MultipleChoiceData = {
				title,
				questions,
			}

			task.consecutiveMistakeCount = 0
			const { text, images } = await task.ask("multiple_choice", JSON.stringify(multipleChoiceData), false)

			// Parse user response
			let userResponse: Record<string, string[]> | { __skipped: boolean } = {}
			try {
				userResponse = JSON.parse(text || "{}")
			} catch (error) {
				// If parsing fails, treat as empty response
				await task.say("error", `Failed to parse user response: ${(error as Error).message}`)
			}

			// Check if user skipped the questionnaire
			if ("__skipped" in userResponse && userResponse.__skipped) {
				await task.say("user_feedback", t("tools:multipleChoice.userSkippedMessage"), images)
				pushToolResult(
					formatResponse.toolResult("<answer>User chose to skip this questionnaire</answer>", images),
				)
				return
			}

			// Format response for LLM
			const responseLines: string[] = ["<answers>"]
			for (const question of questions) {
				const selectedOptions = (userResponse as Record<string, string[]>)[question.id] || []
				const selectedLabels = selectedOptions
					.map((optId) => {
						const option = question.options.find((o) => o.id === optId)
						return option ? option.label : optId
					})
					.join(", ")

				responseLines.push(
					`<answer><question_id>${question.id}</question_id><selected_options>${selectedLabels || "No selection"}</selected_options></answer>`,
				)
			}
			responseLines.push("</answers>")

			await task.say("user_feedback", text ?? "", images)
			pushToolResult(formatResponse.toolResult(responseLines.join("\n"), images))
		} catch (error) {
			await handleError("asking multiple choice question", error as Error)
		}
	}

	override async handlePartial(task: Task, block: ToolUse<"ask_multiple_choice">): Promise<void> {
		// Get questions from params (for XML protocol)
		const questions: string | undefined = block.params.questions

		// During partial streaming, show partial progress
		await task.ask("multiple_choice", questions ?? "", block.partial).catch(() => {})
	}
}

export const askMultipleChoiceTool = new AskMultipleChoiceTool()
