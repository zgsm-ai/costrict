/**
 * Sanitization utilities for audit logging.
 * Redacts sensitive data (API keys, tokens, passwords, private keys) from
 * audit events before they are written to persistent storage.
 */

/**
 * Patterns that match sensitive data in strings. Each entry is [regex, replacement].
 * Applied first to all string values.
 */
const SENSITIVE_PATTERNS: [RegExp, string][] = [
	// Bearer tokens (Bearer followed by a token-like string of 5+ chars)
	[/(Bearer\s+)([A-Za-z0-9_\-\.]{5,})/gi, "$1[REDACTED]"],
	// Generic API keys: api_key=<value>, api-key:<value>
	[/(api[_-]?key\s*[=:]\s*['"]?)([A-Za-z0-9_\-]{5,})/gi, "$1[REDACTED]"],
	// AWS Access Key ID (AKIA... format, 20 chars)
	[/(AKIA[A-Z0-9]{16})/gi, "[REDACTED_AWS_KEY]"],
	// AWS Secret Access Key
	[/(aws[_-]?secret[_-]?access[_-]?key\s*[=:]\s*)([A-Za-z0-9/+=]{40})/gi, "$1[REDACTED]"],
	// GitHub personal access tokens (ghp_, gho_, ghs_, ghr_ with 36+ char tokens)
	[/(gh[pors]_[A-Za-z0-9_]{36,})/gi, "[REDACTED_GITHUB_TOKEN]"],
	// OpenAI API keys (sk-...)
	[/(sk-[A-Za-z0-9]{15,})/gi, "[REDACTED_OPENAI_KEY]"],
	// Anthropic API keys
	[/(sk-ant-[A-Za-z0-9_-]{15,})/gi, "[REDACTED_ANTHROPIC_KEY]"],
	// Private key PEM blocks
	[/(-----BEGIN[^-]+PRIVATE[^-]+-----)([\s\S]*?)(-----END[^-]+PRIVATE[^-]+-----)/gi, "$1\n[REDACTED]\n$3"],
	// Certificates
	[/(-----BEGIN CERTIFICATE-----)([\s\S]*?)(-----END CERTIFICATE-----)/gi, "$1\n[REDACTED_CERT]\n$3"],
	// Passwords in URLs: user:password@host
	[/:\/\/[^:]+:([^@]+)@/gi, "://[REDACTED_USER]:[REDACTED_PASS]@"],
]

/**
 * Patterns for JSON field values. Applied after general patterns.
 * These target specific JSON key names where the value looks like a secret.
 * The pattern must match the "key": "value" structure to avoid matching keys themselves.
 * The [REDACTED] marker is used as a sentinel — these patterns won't match
 * strings that have already been redacted.
 */
const JSON_FIELD_PATTERNS: [RegExp, string][] = [
	// "password": "value" — use word boundary before the colon to avoid matching in other contexts
	[/"password"\s*:\s*"([^"]+)"/g, '"password": "[REDACTED]"'],
	[/"token"\s*:\s*"([^"]+)"/g, '"token": "[REDACTED]"'],
	[/"secret"\s*:\s*"([^"]+)"/g, '"secret": "[REDACTED]"'],
	[/"api[_-]?key"\s*:\s*"([^"]+)"/g, '"api_key": "[REDACTED]"'],
	[/"access[_-]?key[_-]?id"\s*:\s*"([^"]+)"/g, '"access_key_id": "[REDACTED]"'],
	[/"auth[_-]?token"\s*:\s*"([^"]+)"/g, '"auth_token": "[REDACTED]"'],
]

/**
 * Check if a string has already been redacted (contains only [REDACTED*] markers).
 */
function isAlreadyRedacted(value: string): boolean {
	return /^\[REDACTED([_\s]*[A-Z]*)?\]$/.test(value.trim())
}

/**
 * Apply general sanitization patterns to a string.
 */
function applyGeneralPatterns(value: string): string {
	// Skip already-redacted sentinel values
	if (isAlreadyRedacted(value)) return value
	let result = value
	for (const [pattern, replacement] of SENSITIVE_PATTERNS) {
		pattern.lastIndex = 0
		result = result.replace(pattern, replacement)
	}
	return result
}

/**
 * Sanitize a single string value for audit logging.
 */
export function sanitizeString(value: unknown): string {
	if (value === null || value === undefined) return ""
	const str = String(value)
	let result = applyGeneralPatterns(str)
	// Apply JSON field patterns as a second pass
	for (const [pattern, replacement] of JSON_FIELD_PATTERNS) {
		pattern.lastIndex = 0
		result = result.replace(pattern, replacement)
	}
	return result
}

/**
 * Sanitize a command string for audit logging.
 */
export function sanitizeCommand(command: string): string {
	return sanitizeString(command)
}

/**
 * Sanitize tool arguments object for audit logging.
 * Recursively processes objects and arrays, sanitizing string values.
 */
export function sanitizeArguments(args: unknown): Record<string, unknown> {
	if (args === null || args === undefined) return {}
	if (typeof args === "string") return { value: sanitizeString(args) }
	if (typeof args === "number" || typeof args === "boolean") return args as unknown as Record<string, unknown>

	if (Array.isArray(args)) {
		return args.map((item) => sanitizeArguments(item)) as unknown as Record<string, unknown>
	}

	if (typeof args === "object") {
		const result: Record<string, unknown> = {}
		for (const [key, value] of Object.entries(args as Record<string, unknown>)) {
			if (typeof value === "string") {
				result[key] = sanitizeString(value)
			} else if (typeof value === "object" && value !== null) {
				result[key] = sanitizeArguments(value)
			} else {
				result[key] = value
			}
		}
		return result
	}

	return {}
}

/**
 * Truncate a string for audit logging with an omission marker.
 */
export function truncateForAudit(value: string, maxLength: number = 500): string {
	if (!value || value.length <= maxLength) return value
	return value.substring(0, maxLength) + "... [truncated]"
}

/**
 * Compute a summary description of a tool result for audit logging.
 */
export function summarizeResult(result: unknown, maxLength: number = 200): string {
	if (result === null || result === undefined) return "(empty)"
	const str = typeof result === "string" ? result : JSON.stringify(result)
	return truncateForAudit(str, maxLength)
}
