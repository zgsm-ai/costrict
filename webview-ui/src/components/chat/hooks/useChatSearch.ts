import { useMemo, useState, useCallback } from "react"
import type { ClineMessage } from "@roo-code/types"
// import { debounce } from "lodash-es"
import { useDebounceEffect } from "@/utils/useDebounceEffect"

export interface SearchResult {
	index: number
	ts: number
	matches: Match[]
}

export interface Match {
	start: number
	end: number
	text: string
}

export function useChatSearch(messages: ClineMessage[]) {
	const [searchQuery, setSearchQuery] = useState("")
	const [currentResultIndex, setCurrentResultIndex] = useState(0)
	const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("")

	useDebounceEffect(
		() => {
			setDebouncedSearchQuery(searchQuery || "")
		},
		300,
		[searchQuery],
	)

	const searchResults = useMemo(() => {
		if (!debouncedSearchQuery.trim()) {
			return []
		}

		const results: SearchResult[] = []

		const textMessages = messages.filter((msg) => msg.text)

		textMessages.forEach((message) => {
			const plainText = message.text || ""
			const matches = searchInText(plainText, debouncedSearchQuery)

			if (matches.length > 0) {
				results.push({
					index: messages.findIndex((msg) => msg.ts === message.ts),
					ts: message.ts,
					matches,
				})
			}
		})

		return results
	}, [messages, debouncedSearchQuery])

	const { totalResults, hasResults, currentResult } = useMemo(() => {
		const total = searchResults.length
		const hasResults = total > 0
		const currentResult = hasResults ? searchResults[currentResultIndex] : null
		return {
			totalResults: total,
			hasResults,
			currentResult,
		}
	}, [currentResultIndex, searchResults])

	const goToNextResult = useCallback(() => {
		if (hasResults) {
			setCurrentResultIndex((prev) => (prev + 1) % totalResults)
		}
	}, [hasResults, totalResults])

	const goToPreviousResult = useCallback(() => {
		if (hasResults) {
			setCurrentResultIndex((prev) => (prev - 1 + totalResults) % totalResults)
		}
	}, [hasResults, totalResults])

	const resetSearch = useCallback(() => {
		setSearchQuery("")
		setCurrentResultIndex(0)
	}, [])

	return {
		searchQuery,
		setSearchQuery,
		searchResults,
		currentResultIndex,
		setCurrentResultIndex,
		currentResult,
		totalResults,
		hasResults,
		goToNextResult,
		goToPreviousResult,
		resetSearch,
	}
}

function searchInText(text: string, query: string): Match[] {
	const matches: Match[] = []

	if (!query.trim()) return matches

	try {
		// 优化策略：根据文本长度和查询复杂度选择最优方法
		const textLength = text.length
		const queryLength = query.length

		// 对于短文本或简单查询，使用优化的字符串方法
		if (textLength < 500 || queryLength < 3) {
			return searchInTextOptimized(text, query)
		}

		// 对于长文本，使用改进的正则表达式方法
		return searchInTextRegexOptimized(text, query)
	} catch (error) {
		console.error("Search error:", error)
	}

	return matches
}

// 优化的字符串搜索方法（适合短文本）
function searchInTextOptimized(text: string, query: string): Match[] {
	const matches: Match[] = []
	const lowerText = text.toLowerCase()
	const lowerQuery = query.toLowerCase()
	const queryLength = lowerQuery.length

	let searchIndex = 0
	while (searchIndex < lowerText.length) {
		const foundIndex = lowerText.indexOf(lowerQuery, searchIndex)
		if (foundIndex === -1) break

		matches.push({
			start: foundIndex,
			end: foundIndex + queryLength,
			text: text.substring(foundIndex, foundIndex + queryLength),
		})

		searchIndex = foundIndex + 1
	}

	return matches
}

// 优化的正则表达式搜索方法（适合长文本）
function searchInTextRegexOptimized(text: string, query: string): Match[] {
	const matches: Match[] = []

	// 预编译正则表达式，避免重复编译
	const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
	const searchPattern = new RegExp(escapedQuery, "gi")

	let match
	while ((match = searchPattern.exec(text)) !== null) {
		matches.push({
			start: match.index,
			end: match.index + match[0].length,
			text: match[0],
		})

		// 防止零长度匹配的无限循环
		if (match.index === searchPattern.lastIndex) {
			searchPattern.lastIndex++
		}
	}

	return matches
}
