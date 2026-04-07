import { McpHub } from "../../../services/mcp/McpHub"

/**
 * Returns the CAPABILITIES section.
 * NOTE: cwd reference removed for prompt cache optimization.
 * The workspace directory is now specified in SYSTEM INFORMATION section.
 * @see plans/system-prompt-cache-optimization.md - Strategy 2
 */
export function getCapabilitiesSection(_cwd: string, mcpHub?: McpHub): string {
	return `====

CAPABILITIES

- Execute CLI commands, list/read/write files, regex search, and ask follow-up questions. Prefer CLI commands over executable scripts. Commands run in the user's VSCode terminal (each in a new instance) and must be compatible with the Current Shell shown in SYSTEM INFORMATION.${
		mcpHub
			? `
- Access to MCP servers that may provide additional tools and resources.
`
			: ""
	}`
}
