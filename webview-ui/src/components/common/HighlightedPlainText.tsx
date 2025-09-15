import { ClineMessage } from "@roo-code/types"

interface HighlightedPlainTextProps {
	message: ClineMessage
	query?: string
	flag?: string
}

const HighlightedPlainText = ({ message, query = "", flag = "" }: HighlightedPlainTextProps) => {
	if (!query?.trim() || !message?.text) return message.text

	const originText = message.text || ""
	const lowerQuery = query.toLowerCase()
	const blockSplit = originText.split("```")

	return blockSplit
		.map((itemText, index) => {
			if (index % 2 === 1) {
				if (!itemText.toLowerCase().includes(lowerQuery)) return `\`\`\`${itemText}\`\`\``
				return `<mark>⬇️${flag ? `${flag}: ` : ""}${query.length > 20 ? `${query.substring(0, 19)}...` : query}⬇️</mark>\n\`\`\`${itemText}\`\`\``
			}

			return itemText
				.split(/\n/)
				.map((item) => {
					if (item.includes(lowerQuery)) {
						return `${item} <mark>⬅️${flag ? `${flag}: ` : ""}${query.length > 20 ? `${query.substring(0, 19)}...` : query}⬅️</mark>`
					} else {
						return item
					}
				})
				.join("\n")
		})
		.join("")
}

export default HighlightedPlainText
