/**
 * Truncates file content to prevent performance issues from large files
 * @param content - The original file content to be processed
 * @param maxReadFileLine - Optional maximum line limit (if <= 0 uses default 500)
 * @returns The processed content (potentially truncated)
 */
export function truncateContent(content: string, maxReadFileLine: number = 500): [string, number] {
	if (maxReadFileLine === -1) {
		return [content, maxReadFileLine]
	}
	// Maximum number of lines allowed
	const MAX_LINES = maxReadFileLine > 0 ? maxReadFileLine : 500
	// Maximum number of characters allowed
	const MAX_CHARS = 20000

	// First check if the content exceeds the line limit
	// Split content into array by newlines to count lines
	const lines = content.split("\n")
	const lineTotal = lines.length
	if (lineTotal > MAX_LINES) {
		// If exceeds line limit, keep only first 500 lines
		// Use join('\n') to recombine content and add newline at end to maintain format
		return [lines.slice(0, MAX_LINES).join("\n") + "\n", lineTotal]
	}

	// Then check if total character count exceeds limit
	if (content.length > MAX_CHARS) {
		// If exceeds character limit, keep only first 20000 characters
		return [content.substring(0, MAX_CHARS), lineTotal]
	}

	// If content doesn't exceed any limits, return original
	return [content, lineTotal]
}
