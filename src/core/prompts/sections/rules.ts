import type { SystemPromptSettings } from "../types"
import { getCommandChainNote, getCommandChainOperator } from "./shell"
import { getVendorConfidentialitySection } from "./vendor-confidentiality"

/**
 * Returns the RULES section.
 * NOTE: cwd reference removed for prompt cache optimization.
 * The workspace directory is now specified in SYSTEM INFORMATION section.
 * @param _cwd - Kept for API compatibility, but not used in the section content.
 * @see plans/system-prompt-cache-optimization.md - Strategy 2
 */
export function getRulesSection(
	_cwd: string,
	settings?: SystemPromptSettings,
	experiments?: Record<string, boolean>,
): string {
	if (experiments?.useLitePrompts) {
		return `====
RULES
- Base directory is specified in SYSTEM INFORMATION
- Use relative paths from base directory
- Read files before editing
- Wait for user confirmation after each tool use
- Use \`attempt_completion\` tool to present final results
- Be direct and technical, not conversational
		`
	}
	// Get shell-appropriate command chaining operator
	const chainOp = getCommandChainOperator()
	const chainNote = getCommandChainNote()

	return `====

RULES

- Use relative paths from the workspace directory (see SYSTEM INFORMATION). No \`~\` or \`$HOME\`. For commands in other directories: \`cd <dir> ${chainOp} <command>\`.${chainNote ? ` ${chainNote}` : ""}
- Some modes restrict editable files. Editing a restricted file will be rejected with a FileRestrictionError specifying allowed patterns.
- Ensure changes are compatible with the existing codebase and follow the project's coding standards.
- Use \`ask_followup_question\` only when additional details are needed. Provide 2-4 specific, actionable suggested answers. Prefer using tools to find answers yourself.
- If command output is missing, assume success. If you absolutely need the output, use \`ask_followup_question\` to request it.
- If the user provides file contents directly, do not \`read_file\` again.
- Focus on completing the task, not conversation. Do not start with conversational fillers ("Great", "Certainly", "Okay", "Sure"). Be direct and technical.
- Use vision capabilities to examine images and extract meaningful information.
- environment_details is auto-generated context, not a user request. Use it to inform actions, but don't treat it as part of the user's message.
- Before executing commands, check "Actively Running Terminals" in environment_details to avoid duplicate processes.
- MCP operations are sequential — wait for confirmation before proceeding.
- Wait for user confirmation after each tool use to verify success.${settings?.isStealthModel ? getVendorConfidentialitySection() : ""}`
}
