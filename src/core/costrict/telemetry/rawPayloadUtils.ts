import { getDiffLines } from "../../../utils/diffLines"

const DEFAULT_MAX_CONTENT_LENGTH = 20_000
const DEFAULT_MAX_DIFF_LENGTH = 50_000

export function truncateRawText(
	value: string | undefined,
	maxLength: number = DEFAULT_MAX_CONTENT_LENGTH,
): string | undefined {
	if (!value) {
		return value
	}

	return value.length > maxLength ? `${value.slice(0, maxLength)}\n...[truncated]` : value
}

export function buildRawDiffPayload(
	entries: Array<{ label: string; before: string; after: string }>,
	maxLength: number = DEFAULT_MAX_DIFF_LENGTH,
): { text?: string; lines?: number } {
	if (!entries.length) {
		return {}
	}

	const text = truncateRawText(
		entries
			.map(
				(entry) => `--- ${entry.label}
<<< BEFORE
${entry.before}
>>> AFTER
${entry.after}`,
			)
			.join("\n\n"),
		maxLength,
	)
	const lines = entries.reduce((sum, entry) => sum + getDiffLines(entry.before, entry.after), 0)

	return text ? { text, lines } : {}
}

export function countPatchDiffLines(diffText: string): number {
	const beforeLines: string[] = []
	const afterLines: string[] = []

	for (const line of diffText.split("\n")) {
		if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("@@")) {
			continue
		}
		if (line.startsWith("+")) {
			afterLines.push(line.slice(1))
		} else if (line.startsWith("-")) {
			beforeLines.push(line.slice(1))
		} else {
			const normalized = line.startsWith(" ") ? line.slice(1) : line
			beforeLines.push(normalized)
			afterLines.push(normalized)
		}
	}

	return getDiffLines(
		`${beforeLines.join("\n")}
`,
		`${afterLines.join("\n")}
`,
	)
}
