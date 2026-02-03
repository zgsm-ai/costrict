import { experiments, EXPERIMENT_IDS } from "../../../shared/experiments"
import { McpHub } from "../../../services/mcp/McpHub"

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
