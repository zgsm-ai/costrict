import { Task } from "../../task/Task"
import { ToolUse, AskApproval, HandleError, PushToolResult, RemoveClosingTag } from "../../../shared/tools"
import { formatResponse } from "../../prompts/responses"
import { parseXml } from "../../../utils/xml"
import type { MultipleChoiceData, MultipleChoiceQuestion, MultipleChoiceOption } from "@roo-code/types"

export async function askMultipleChoiceTool(
	cline: Task,
	block: ToolUse,
	askApproval: AskApproval,
	handleError: HandleError,
	pushToolResult: PushToolResult,
	removeClosingTag: RemoveClosingTag,
) {
	const title: string | undefined = block.params.title
	const questionsXml: string | undefined = block.params.questions

	try {
		if (block.partial) {
			// During streaming, show partial progress
			await cline.ask("multiple_choice", removeClosingTag("questions", questionsXml), block.partial).catch(() => {})
			return
		} else {
			if (!questionsXml) {
				cline.consecutiveMistakeCount++
				cline.recordToolError("ask_multiple_choice")
				pushToolResult(await cline.sayAndCreateMissingParamError("ask_multiple_choice", "questions"))
				return
			}

			// Parse XML to extract questions
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

			let parsedData: {
				question?: ParsedQuestion | ParsedQuestion[]
			}

			try {
				// Don't use stopNodes - we need full parsing to get all fields including IDs
				parsedData = parseXml(questionsXml, []) as {
					question?: ParsedQuestion | ParsedQuestion[]
				}
			} catch (error) {
				cline.consecutiveMistakeCount++
				cline.recordToolError("ask_multiple_choice")
				await cline.say("error", `Failed to parse questions XML: ${error.message}`)
				pushToolResult(formatResponse.toolError("Invalid questions XML format"))
				return
			}

			// Normalize to array
			const rawQuestions = Array.isArray(parsedData?.question)
				? parsedData.question
				: parsedData?.question
					? [parsedData.question]
					: []

			if (rawQuestions.length === 0) {
				cline.consecutiveMistakeCount++
				cline.recordToolError("ask_multiple_choice")
				await cline.say("error", "No questions found in the XML")
				pushToolResult(formatResponse.toolError("At least one question is required"))
				return
			}

			// Transform parsed XML to MultipleChoiceData format
			const questions: MultipleChoiceQuestion[] = []
			
			for (let i = 0; i < rawQuestions.length; i++) {
				const q = rawQuestions[i]
				const questionIndex = i + 1
				
				// Validate required fields: id and prompt
				if (!q.id) {
					cline.consecutiveMistakeCount++
					cline.recordToolError("ask_multiple_choice")
					await cline.say("error", `Question #${questionIndex} is missing required field: id`)
					pushToolResult(formatResponse.toolError(`Question #${questionIndex} must have an id`))
					return
				}
				
				if (!q.prompt) {
					cline.consecutiveMistakeCount++
					cline.recordToolError("ask_multiple_choice")
					await cline.say("error", `Question "${q.id}" is missing required field: prompt`)
					pushToolResult(formatResponse.toolError(`Question "${q.id}" must have a prompt`))
					return
				}
				
				// Normalize options to array
				const rawOptions = Array.isArray(q.options?.option)
					? q.options.option
					: q.options?.option
						? [q.options.option]
						: []

				if (rawOptions.length < 2) {
					cline.consecutiveMistakeCount++
					cline.recordToolError("ask_multiple_choice")
					await cline.say("error", `Question "${q.id}" must have at least 2 options (found ${rawOptions.length})`)
					pushToolResult(formatResponse.toolError(`Question "${q.id}" must have at least 2 options`))
					return
				}

				// Parse options - validate id and label
				const options: MultipleChoiceOption[] = []
				for (let j = 0; j < rawOptions.length; j++) {
					const opt = rawOptions[j]
					const optionIndex = j + 1
					
					if (!opt.id) {
						cline.consecutiveMistakeCount++
						cline.recordToolError("ask_multiple_choice")
						await cline.say("error", `Question "${q.id}", option #${optionIndex} is missing required field: id`)
						pushToolResult(formatResponse.toolError(`Question "${q.id}" - all options must have an id`))
						return
					}
					
					if (!opt.label) {
						cline.consecutiveMistakeCount++
						cline.recordToolError("ask_multiple_choice")
						await cline.say("error", `Question "${q.id}", option "${opt.id}" is missing required field: label`)
						pushToolResult(formatResponse.toolError(`Question "${q.id}" - all options must have a label`))
						return
					}
					
					options.push({
						id: opt.id,
						label: opt.label,
					})
				}

				questions.push({
					id: q.id,
					prompt: q.prompt,
					options,
					allow_multiple:
						typeof q.allow_multiple === "string" ? q.allow_multiple === "true" : q.allow_multiple || false,
				})
			}

			const multipleChoiceData: MultipleChoiceData = {
				title,
				questions,
			}

			cline.consecutiveMistakeCount = 0
			const { text, images } = await cline.ask("multiple_choice", JSON.stringify(multipleChoiceData), false)

			// Parse user response
			let userResponse: Record<string, string[]> | { __skipped: boolean } = {}
			try {
				userResponse = JSON.parse(text || "{}")
			} catch (error) {
				// If parsing fails, treat as empty response
				await cline.say("error", `Failed to parse user response: ${error.message}`)
			}

			// Check if user skipped the questionnaire
			if ("__skipped" in userResponse && userResponse.__skipped) {
				await cline.say("user_feedback", "User chose to skip this questionnaire", images)
				pushToolResult(formatResponse.toolResult("<answer>User chose to skip and will provide requirements directly</answer>", images))
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

				responseLines.push(`<answer>`)
				responseLines.push(`<question_id>${question.id}</question_id>`)
				responseLines.push(`<selected_options>${selectedLabels || "No selection"}</selected_options>`)
				responseLines.push(`</answer>`)
			}
			responseLines.push("</answers>")

			await cline.say("user_feedback", text ?? "", images)
			pushToolResult(formatResponse.toolResult(responseLines.join("\n"), images))

			return
		}
	} catch (error) {
		await handleError("asking multiple choice question", error)
		return
	}
}

