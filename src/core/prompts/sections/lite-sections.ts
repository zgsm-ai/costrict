import { experiments, EXPERIMENT_IDS } from "../../../shared/experiments"
import { McpHub } from "../../../services/mcp/McpHub"

/**
 * Lite version of tool use guidelines - simplified and concise
 */
export function getLiteToolUseGuidelinesSection(experimentFlags?: Record<string, boolean>): string {
	const isMultipleNativeToolCallsEnabled = experiments.isEnabled(
		experimentFlags ?? {},
		EXPERIMENT_IDS.MULTIPLE_NATIVE_TOOL_CALLS,
	)

	const toolUsageNote = isMultipleNativeToolCallsEnabled
		? "Use tools as needed - you may use multiple tools in one message or iteratively across messages."
		: "Use one tool at a time, waiting for results before proceeding."

	return `# Tool Use Guidelines

1. Assess what information you have and what you need
2. Choose the most appropriate tool for the task
3. ${toolUsageNote}
4. Verify required parameters before calling tools`
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
