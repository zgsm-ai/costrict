import type OpenAI from "openai"

const SKILL_DESCRIPTION = `Load and execute a skill by name. Skills provide structured expert knowledge, battle-tested workflows, and specialized methodologies for common and advanced tasks — from code reviews and testing strategies to architecture planning and debugging processes.

Use this tool when you need to apply domain-specific expertise or follow proven procedures documented in a skill. Available skills are listed in the AVAILABLE SKILLS section of the system prompt.`

const SKILL_PARAMETER_DESCRIPTION = `Name of the skill to load (e.g., code-review, test-strategy). Must match a skill name from the available skills list.`

const ARGS_PARAMETER_DESCRIPTION = `Optional context or arguments to pass to the skill`

export default {
	type: "function",
	function: {
		name: "skill",
		description: SKILL_DESCRIPTION,
		strict: true,
		parameters: {
			type: "object",
			properties: {
				skill: {
					type: "string",
					description: SKILL_PARAMETER_DESCRIPTION,
				},
				args: {
					type: ["string", "null"],
					description: ARGS_PARAMETER_DESCRIPTION,
				},
			},
			required: ["skill", "args"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
