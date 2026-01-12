import React, { useEffect, useState, useCallback } from "react"
import { useTranslation } from "react-i18next"
import { vscode } from "@src/utils/vscode"
import ReviewHistoryItem from "./ReviewHistoryItem"
import { Button } from "@/components/ui"

interface CodeReviewHistoryViewProps {
	onDone?: () => void
}

interface ReviewHistoryItemData {
	review_task_id: string
	title: string
	timestamp: string
	conclusion?: string
}

const CodeReviewHistoryView: React.FC<CodeReviewHistoryViewProps> = ({ onDone }) => {
	const { t } = useTranslation()
	const [historyData, setHistoryData] = useState<ReviewHistoryItemData[]>([])
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)

	const loadHistoryData = useCallback(() => {
		setLoading(true)
		setError(null)
		vscode.postMessage({ type: "getReviewHistory" })
	}, [])
	useEffect(() => {
		loadHistoryData()

		const handleMessage = (event: MessageEvent) => {
			const message = event.data
			if (message.type === "reviewHistoryResponse") {
				if (message.error) {
					setError(message.error)
					setLoading(false)
				} else {
					setHistoryData(message.values.history)
					setLoading(false)
				}
			} else if (message.type === "reviewHistoryEntryDeleted") {
				const { reviewTaskId } = message.values
				setHistoryData((prev) => prev.filter((item) => item.review_task_id !== reviewTaskId))
			}
		}

		window.addEventListener("message", handleMessage)
		return () => {
			window.removeEventListener("message", handleMessage)
		}
	}, [loadHistoryData])

	const handleDeleteHistory = useCallback((reviewTaskId: string, e: React.MouseEvent) => {
		e.stopPropagation()
		vscode.postMessage({
			type: "deleteReviewHistoryItem",
			values: { reviewTaskId },
		})
	}, [])

	return (
		<div className="h-full flex flex-col">
			<div className="mx-5 border-b border-vscode-panel-border flex flex-col gap-2">
				<div className="flex items-center justify-between gap-2">
					<h2 className="text-lg font-semibold">{t("codereview:history.title")}</h2>
					<Button onClick={onDone}>{t("codereview:history.done")}</Button>
				</div>
			</div>
			{loading ? (
				<div className="flex items-center justify-center flex-1">
					<div className="flex items-center gap-2 text-gray-500">
						<i className="codicon codicon-loading codicon-modifier-spin"></i>
						<span>{t("codereview:history.loading")}</span>
					</div>
				</div>
			) : error ? (
				<div className="flex flex-col items-center justify-center flex-1 gap-4">
					<i className="codicon codicon-error text-4xl text-red-500"></i>
					<div className="text-gray-600">{error}</div>
					<button
						onClick={loadHistoryData}
						className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
						{t("common:retry")}
					</button>
				</div>
			) : historyData.length === 0 ? (
				<div className="flex flex-col items-center justify-center flex-1 gap-4 pt-5">
					<i className="codicon codicon-history text-4xl text-gray-400"></i>
					<div className="text-gray-500">{t("codereview:history.noData")}</div>
				</div>
			) : (
				<div className="flex-1 overflow-y-auto p-5 px-2 py-0">
					{historyData.map((item) => (
						<ReviewHistoryItem
							key={item.review_task_id}
							reviewTaskId={item.review_task_id}
							title={item.title}
							timestamp={item.timestamp}
							conclusion={item.conclusion}
							onDelete={(e) => handleDeleteHistory(item.review_task_id, e)}
						/>
					))}
				</div>
			)}
		</div>
	)
}

export default CodeReviewHistoryView
