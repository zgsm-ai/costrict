import React from "react"

interface HighlightedPlainTextProps {
	text: string
	matches?: { start: number; end: number; text: string }[]
}

const HighlightedPlainText = ({ text, matches }: HighlightedPlainTextProps) => {
	if (!matches || matches.length === 0) {
		return text
	}

	// Sort matches by start position
	const sortedMatches = [...matches].sort((a, b) => a.start - b.start)

	let lastIndex = 0
	const parts: React.ReactNode[] = []

	for (const match of sortedMatches) {
		// Add text before the match
		if (match.start > lastIndex) {
			parts.push(text.substring(lastIndex, match.start))
		}
		console.log(match.text)

		// Add highlighted match
		parts.push(`<mark>${match.text}</mark>`)

		lastIndex = match.end
	}

	// Add remaining text
	if (lastIndex < text.length) {
		parts.push(text.substring(lastIndex))
	}

	return parts.join("")
}

export default HighlightedPlainText
