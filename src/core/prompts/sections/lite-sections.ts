import { McpHub } from "../../../services/mcp/McpHub"
import { getCommandChainNote, getCommandChainOperator } from "./shell"
import { SystemPromptSettings } from "../types"
import { getVendorConfidentialitySection } from "./vendor-confidentiality"

/**
 * Lite version of shared tool use section.
 * For XML-based tool calling providers. Does not forbid XML.
 */
export function getLiteSharedToolUseSection(): string {
	return `====

TOOL USE

You have access to tools. You must call at least one tool per response. Use multiple tools when needed to complete tasks faster.`
}

/**
 * Lite version of tool use guidelines - simplified and concise
 */
export function getLiteToolUseGuidelinesSection(): string {
	return `# Tool Use Guidelines

1. Assess what information you have and what you need to proceed
2. Choose the most appropriate tool based on the task
3. Use tools as needed - you may use multiple tools in one message or iteratively across messages
4. Each tool use should be informed by previous results - do not assume outcomes`
}

/**
 * Lite version of capabilities section - core capabilities only
 */
export function getLiteCapabilitiesSection(cwd: string, mcpHub?: McpHub): string {
	const mcpNote = mcpHub ? "\n- Access to MCP servers for additional tools and resources" : ""

	return `====

CAPABILITIES

- Execute CLI commands, list/read/write files, regex search, and ask follow-up questions
- Workspace directory: '${cwd}' - file structure provided in environment_details
- Commands run in VSCode terminal, can be interactive or long-running${mcpNote}`
}

/**
 * Lite version of objective section - simplified workflow
 */
export function getLiteObjectiveSection(): string {
	return `====

OBJECTIVE

Work through tasks iteratively and methodically:

1. Analyze the task and set clear, prioritized goals
2. Use tools sequentially to accomplish each goal
3. Use attempt_completion to present final results
4. Incorporate feedback if provided, but avoid pointless back-and-forth`
}

export function getLiteRulesSection(
	cwd: string,
	settings?: SystemPromptSettings,
	experiments?: Record<string, boolean>,
): string {
	if (experiments?.useLitePrompts) {
		return `====
RULES
- Base directory: ${cwd.toPosix()}
- Use relative paths from base directory
- Read before edit
- Tools are sequential; confirm after each use
- Use attempt_completion for final results
- Be direct and technical, not conversational
`
	}

	const chainOp = getCommandChainOperator()
	const chainNote = getCommandChainNote()

	return `====

RULES

## Paths & Execution
- Base directory: ${cwd.toPosix()} (fixed; cannot cd out)
- All paths must be relative; no ~ or $HOME
- External execution: \`cd <dir> ${chainOp} <command>\`${chainNote ? ` (${chainNote})` : ""}
- Before execute_command, review SYSTEM INFORMATION and environment_details
- Check "Actively Running Terminals" to avoid duplicate processes

## Tool Discipline
- Read before edit
- All tools (including MCP) are sequential; wait for user confirmation after each use
- Assume success if terminal output is missing
- Skip read_file if file content is already provided
- Use ask_followup_question only when necessary; provide 2–4 concrete options and prefer tools over questions

## Code & Project Context
- Respect mode-based file restrictions (e.g. architect: "\\.md$" only)
- Match project type, structure, and existing coding style
- Review manifest files to understand dependencies

## Responses & Output
- Be direct and technical; avoid conversational fillers ("Great", "Sure", etc.)
- Focus on completing the task, not discussion
- Use attempt_completion for final output; NEVER end with a question

## Non-user Inputs
- Analyze images using vision capabilities when present
- environment_details is contextual metadata, not a user request; use it to inform actions and explain decisions clearly

${settings?.isStealthModel ? getVendorConfidentialitySection() : ""}`
}
