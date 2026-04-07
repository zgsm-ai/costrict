import { Task } from "../task/Task"
import { formatResponse } from "../prompts/responses"
import { BaseTool, ToolCallbacks } from "./BaseTool"
import type { ToolUse } from "../../shared/tools"
import {
	multipleChoiceDataSchema,
	type MultipleChoiceData,
	type MultipleChoiceQuestion,
	type MultipleChoiceOption,
	type MultipleChoiceQuestionResponse,
	type MultipleChoiceResponse,
} from "@roo-code/types"
import { t } from "../../i18n"

function normalizeQuestionResponse(response: MultipleChoiceResponse[string]): MultipleChoiceQuestionResponse {
	if (Array.isArray(response)) {
		return {
			selectedOptionIds: response,
		}
	}

	return {
		selectedOptionIds: Array.isArray(response?.selectedOptionIds) ? response.selectedOptionIds : [],
		customAnswer: typeof response?.customAnswer === "string" ? response.customAnswer.trim() : undefined,
	}
}

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

		const recordInvalidParamError = async (paramName: string, guidance: string): Promise<void> => {
			task.consecutiveMistakeCount++
			task.recordToolError("ask_multiple_choice")
			task.didToolFailInCurrentTurn = true
			await task.say("error", guidance)
			pushToolResult(formatResponse.toolError(guidance))
		}

		try {
			const validationResult = multipleChoiceDataSchema.safeParse({ title, questions })

			if (!validationResult.success) {
				const issuePaths = validationResult.error.issues.map((issue) => issue.path.join("."))

				if (issuePaths.includes("questions")) {
					await recordInvalidParamError(
						"questions",
						"Invalid 'questions' for ask_multiple_choice: it must be a non-empty array with at least one question. Retry with questions: [{ id, prompt, options }].",
					)
					return
				}

				if (issuePaths.some((path) => /questions\.\d+\.options(?:\.\d+)?$/.test(path))) {
					await recordInvalidParamError(
						"questions.options",
						"Invalid 'questions[].options' for ask_multiple_choice: each question must include at least two options. Retry with options: [{ id, label }, { id, label }].",
					)
					return
				}

				if (issuePaths.some((path) => /questions\.\d+\.id$/.test(path))) {
					await recordInvalidParamError(
						"questions.id",
						"Invalid 'questions[].id' for ask_multiple_choice: every question must include a unique string id. Retry with questions: [{ id: 'question_id', prompt, options }].",
					)
					return
				}

				if (issuePaths.some((path) => /questions\.\d+\.prompt$/.test(path))) {
					await recordInvalidParamError(
						"questions.prompt",
						"Invalid 'questions[].prompt' for ask_multiple_choice: every question must include prompt text. Retry with questions: [{ id, prompt: 'Your question', options }].",
					)
					return
				}

				if (issuePaths.some((path) => /questions\.\d+\.options\.\d+\.id$/.test(path))) {
					await recordInvalidParamError(
						"questions.options.id",
						"Invalid 'questions[].options[].id' for ask_multiple_choice: every option must include a unique string id. Retry with options: [{ id: 'option_id', label: 'Option label' }].",
					)
					return
				}

				if (issuePaths.some((path) => /questions\.\d+\.options\.\d+\.label$/.test(path))) {
					await recordInvalidParamError(
						"questions.options.label",
						"Invalid 'questions[].options[].label' for ask_multiple_choice: every option must include display text in label. Retry with options: [{ id, label: 'Option label' }].",
					)
					return
				}

				throw new Error(validationResult.error.issues.map((issue) => issue.message).join("; "))
			}

			const multipleChoiceData: MultipleChoiceData = {
				title: validationResult.data.title,
				questions: validationResult.data.questions,
			}

			task.consecutiveMistakeCount = 0
			const { response, text, images } = await task.ask(
				"multiple_choice",
				JSON.stringify(multipleChoiceData),
				false,
			)

			//costrict: free-form chat input, including image-only messages, should pass through as normal user feedback
			if (response === "messageResponse") {
				const responseImages = images ?? []
				if (text || responseImages.length > 0) {
					if (text) {
						task.userMessageContent.push({ type: "text", text })
					}
					task.userMessageContent.push(...formatResponse.imageBlocks(responseImages))
					await task.say("user_feedback", text ?? "", responseImages)
				}
				return
			}

			// Parse user response
			let userResponse: MultipleChoiceResponse | { __skipped: boolean } = {}
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
				const normalizedResponse = normalizeQuestionResponse(
					(userResponse as MultipleChoiceResponse)[question.id],
				)
				const selectedLabels = normalizedResponse.selectedOptionIds.map((optId) => {
					const option = question.options.find((o) => o.id === optId)
					return option ? option.label : optId
				})

				const responseParts = [...selectedLabels]
				if (normalizedResponse.customAnswer) {
					responseParts.push(normalizedResponse.customAnswer)
				}

				responseLines.push(
					`<answer><question_id>${question.id}</question_id><selected_options>${responseParts.join(", ") || "No selection"}</selected_options></answer>`,
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
