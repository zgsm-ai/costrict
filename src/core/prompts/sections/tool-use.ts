export function getSharedToolUseSection(): string {
	return `====

TOOL USE

Use provider-native tool-calling. Call at least one tool per response; prefer batching multiple independent calls to reduce round-trips. For simple questions, use \`attempt_completion\` directly — do not use other tools first.`
}
