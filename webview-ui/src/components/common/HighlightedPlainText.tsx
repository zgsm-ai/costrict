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

	// 首先以换行符号分割
	const lines = originText.split("\n")
	const result: string[] = []
	let i = 0

	while (i < lines.length) {
		const line = lines[i]

		// 检查是否是代码块开始（精确匹配```开头，可能包含语言标识）
		if (line.trim().startsWith("```")) {
			// 找到代码块结束
			let codeBlockEnd = -1
			for (let j = i + 1; j < lines.length; j++) {
				if (lines[j].trim() === "```") {
					codeBlockEnd = j
					break
				}
			}

			if (codeBlockEnd !== -1) {
				// 提取完整的代码块
				const codeBlockLines = lines.slice(i, codeBlockEnd + 1)
				const codeBlockContent = codeBlockLines.join("\n")

				// 检查代码块是否包含查询字符串
				if (codeBlockContent.toLowerCase().includes(lowerQuery)) {
					result.push(
						`<mark>⬇️${flag ? `${flag}: ` : ""}${query.length > 20 ? `${query.substring(0, 19)}...` : query}⬇️</mark>`,
					)
				}
				result.push(codeBlockContent)

				i = codeBlockEnd + 1
				continue
			}
		}

		// 处理普通文本行
		if (line.toLowerCase().includes(lowerQuery)) {
			result.push(
				`${line} <mark>⬅️${flag ? `${flag}: ` : ""}${query.length > 20 ? `${query.substring(0, 19)}...` : query}⬅️</mark>`,
			)
		} else {
			result.push(line)
		}

		i++
	}

	return result.join("\n")
}

export default HighlightedPlainText
