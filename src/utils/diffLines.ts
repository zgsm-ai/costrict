import { diffLines } from "diff"

export function getDiffLines(originalContent: string, newContent: string) {
	const diff = diffLines(originalContent, newContent)
	let changedLineCount = 0

	diff.forEach((part) => {
		if (part.added || part.removed) {
			// 使用 part.count 如果存在，否则手动计算
			if (part.count !== undefined) {
				changedLineCount += part.count
			} else {
				// 手动计算行数
				const lines = part.value.split("\n")
				// 如果最后一个元素是空字符串（由于末尾换行符），则不计算
				const actualLineCount = part.value.endsWith("\n") ? lines.length - 1 : lines.length
				changedLineCount += actualLineCount
			}
		}
	})

	return changedLineCount
}
