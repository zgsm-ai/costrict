import { useEffect } from "react"
import { ReviewIssue } from "@roo/codeReview"
import { vscode } from "@src/utils/vscode"

interface IssuesLoadedData {
	taskId: string
	issues: ReviewIssue[]
}

type SubscriptionCallback = (data: IssuesLoadedData) => void

const issuesCache = new Map<string, ReviewIssue[]>()
const subscribers = new Set<SubscriptionCallback>()

const dispatchToSubscribers = (data: IssuesLoadedData) => {
	subscribers.forEach((callback) => callback(data))
}

export const useReviewIssuesLoader = () => {
	useEffect(() => {
		const handleMessage = (event: MessageEvent) => {
			if (event.data.type === "reviewIssueByIdLoaded") {
				const { reviewTaskId, issues } = event.data.values
				issuesCache.set(reviewTaskId, issues)
				dispatchToSubscribers({ taskId: reviewTaskId, issues })
			}
		}
		window.addEventListener("message", handleMessage)
		return () => window.removeEventListener("message", handleMessage)
	}, [])

	const loadIssues = (taskId: string) => {
		vscode.postMessage({ type: "getReviewIssueById", values: { reviewTaskId: taskId } })
	}

	const getIssues = (taskId: string): ReviewIssue[] | undefined => {
		return issuesCache.get(taskId)
	}

	const subscribe = (taskId: string, callback: (issues: ReviewIssue[]) => void) => {
		const wrappedCallback: SubscriptionCallback = (data) => {
			if (data.taskId === taskId) {
				callback(data.issues)
			}
		}
		subscribers.add(wrappedCallback)
		return () => {
			subscribers.delete(wrappedCallback)
		}
	}

	return { loadIssues, getIssues, subscribe }
}
