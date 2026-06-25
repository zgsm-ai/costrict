import type OpenAI from "openai"

const ATTEMPT_COMPLETION_DESCRIPTION = `Use this tool to present the final result to the user. The user may respond with feedback if they are not satisfied with the result, which you can use to make improvements and try again.

This tool is MANDATORY for ALL responses. You MUST call this tool:
1. For simple questions, greetings, jokes, or any conversational messages that don't require file operations or command execution — call this tool IMMEDIATELY with your response.
2. After completing multi-step tasks using other tools — call this tool to present the final result.

IMPORTANT NOTE: For multi-step tasks, this tool CANNOT be used until you've confirmed from the user that any previous tool uses were successful. Failure to do so will result in code corruption and system failure. Before using this tool for multi-step tasks, you must confirm that you've received successful results from the user for any previous tool uses. If not, then DO NOT use this tool.

Parameters:
- result: (required) The result of the task. Formulate this result in a way that is final and does not require further input from the user. Don't end your result with questions or offers for further assistance.

Example: Completing after updating CSS
{ "result": "I've updated the CSS to use flexbox layout for better responsiveness" }`

const RESULT_PARAMETER_DESCRIPTION = `Final result message to deliver to the user once the task is complete`

export default {
	type: "function",
	function: {
		name: "attempt_completion",
		description: ATTEMPT_COMPLETION_DESCRIPTION,
		strict: true,
		parameters: {
			type: "object",
			properties: {
				result: {
					type: "string",
					description: RESULT_PARAMETER_DESCRIPTION,
				},
			},
			required: ["result"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
