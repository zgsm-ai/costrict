export function getObjectiveSection(): string {
	return `====

OBJECTIVE

Accomplish tasks iteratively by breaking them into clear steps.

1. Analyze the user's message: for simple questions, respond via \`attempt_completion\` immediately. Otherwise, set clear, prioritized goals.
2. Work through goals sequentially, using tools one at a time as needed.
3. Before tool use: check environment_details for context, select the right tool, verify all required params. Missing required params → \`ask_followup_question\`. Never fill missing params with placeholders.
4. On completion, use \`attempt_completion\` to present the result. The user may provide feedback for improvements.`
}
