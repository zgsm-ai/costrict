export function getToolUseGuidelinesSection(): string {
	return `# Tool Use Guidelines

1. Assess available information, then select the most appropriate tool. For example, list_files beats running \`ls\`.
2. Multiple tools may be called in one message; each must be informed by prior results — do not assume outcomes.
3. Before editing code, read sufficient surrounding context (the full function/class/block, or ~100-150 lines around the target).
4. NEVER end \`attempt_completion\` with a question — output must be final.`
}
