import { useMemo, useState, useCallback } from "react"
import type { ClineMessage } from "@roo-code/types"
// import { debounce } from "lodash-es"
import { useDebounceEffect } from "@/utils/useDebounceEffect"

export interface SearchResult {
	index: number
	ts: number
}

export function useChatSearch(messages: ClineMessage[]) {
	const [searchQuery, setSearchQuery] = useState("")
	const [currentResultIndex, setCurrentResultIndex] = useState(0)
	const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("")

	useDebounceEffect(
		() => {
			setDebouncedSearchQuery(searchQuery?.trim() || "")
		},
		300,
		[searchQuery],
	)

	const searchResults = useMemo(() => {
		if (!debouncedSearchQuery?.trim()) {
			return []
		}

		const results: SearchResult[] = []

		const textMessages = messages.filter((msg) => msg.ask !== "tool" && msg.say !== "api_req_started" && msg.text)

		textMessages.forEach((message) => {
			const plainText = message.text || ""
			const matched = plainText.includes(debouncedSearchQuery)

			if (matched) {
				results.push({
					index: messages.findIndex((msg) => msg.ts === message.ts),
					ts: message.ts,
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
