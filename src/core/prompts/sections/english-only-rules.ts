/**
 * English-Only Output Rule Section
 *
 * This section is moved out of custom-instructions.ts to enable prompt caching.
 * It's a completely static ~2000 token block that can form part of a stable
 * prompt prefix when language !== 'zh-CN'.
 *
 * @see plans/system-prompt-cache-optimization.md - Strategy 3
 */

/**
 * Returns the English-only output rule section.
 * This rule is only added when the language is NOT Chinese.
 */
export function getEnglishOnlySection(): string {
	return `====

OUTPUT LANGUAGE

All output must be in English. This applies to responses, code comments, documentation, tables, and analysis results. Proper nouns and brand names in non-English languages may remain unchanged. Internal reasoning may use any language.`
}
