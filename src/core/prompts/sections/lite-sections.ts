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

Use provider-native tool-calling. Call at least one tool per response. For simple questions, use \`attempt_completion\` directly.`
}

/**
 * Lite version of tool use guidelines - simplified and concise
 */
export function getLiteToolUseGuidelinesSection(): string {
	return `# Tool Use Guidelines

1. Assess available information, then select the most appropriate tool
2. Multiple tools may be called in one message; each informed by prior results
3. Before editing code, read sufficient surrounding context
4. NEVER end \`attempt_completion\` with a question — output must be final`
}

/**
 * Lite version of capabilities section - core capabilities only
 * NOTE: cwd reference removed for prompt cache optimization.
 * The workspace directory is now specified in SYSTEM INFORMATION section.
 * @param _cwd - Kept for API compatibility, but not used in the section content.
 * @see plans/system-prompt-cache-optimization.md - Strategy 2
 */
export function getLiteCapabilitiesSection(_cwd: string, mcpHub?: McpHub): string {
	const mcpNote = mcpHub ? "\n- Access to MCP servers for additional tools" : ""

	return `====

CAPABILITIES

- Execute CLI commands, list/read/write files, regex search, ask follow-up questions
- Commands run in VSCode terminal, each in a new instance${mcpNote}`
}

/**
 * Lite version of objective section - simplified workflow
 */
export function getLiteObjectiveSection(): string {
	return `====

OBJECTIVE

1. Simple questions → \`attempt_completion\` directly
2. Tasks → set prioritized goals, work through them sequentially
3. On completion → \`attempt_completion\`. Incorporate feedback but avoid pointless back-and-forth`
}

/**
 * Lite version of rules section - simplified and concise
 * NOTE: cwd reference removed for prompt cache optimization.
 * The workspace directory is now specified in SYSTEM INFORMATION section.
 * @param _cwd - Kept for API compatibility, but not used in the section content.
 * @see plans/system-prompt-cache-optimization.md - Strategy 2
 */
export function getLiteRulesSection(
	_cwd: string,
	settings?: SystemPromptSettings,
	experiments?: Record<string, boolean>,
): string {
	if (experiments?.useLitePrompts) {
		return `====

RULES
- Use relative paths from workspace (see SYSTEM INFORMATION)
- Read before edit
- Wait for confirmation after each tool use
- \`attempt_completion\` for final results
- Be direct, not conversational
`
	}

	const chainOp = getCommandChainOperator()
	const chainNote = getCommandChainNote()

	return `====

RULES

- Use relative paths from workspace (see SYSTEM INFORMATION). For other directories: \`cd <dir> ${chainOp} <command>\`${chainNote ? ` (${chainNote})` : ""}
- Read before edit; wait for confirmation after each tool use
- Prefer tools over questions; provide 2-4 options when using \`ask_followup_question\`
- Skip \`read_file\` if content already provided
- Be direct; no conversational fillers. \`attempt_completion\` output must be final
- Check "Actively Running Terminals" before running commands
- environment_details is auto-generated context, not user input${settings?.isStealthModel ? getVendorConfidentialitySection() : ""}`
}
