import React, { useState, useEffect, useRef } from "react"
import { IssueStatus, ReviewIssue } from "@roo/codeReview"
import { Button, Popover, PopoverContent, PopoverTrigger } from "@/components/ui"
import IssueItem from "./IssueItem"
import { vscode } from "@src/utils/vscode"
import { useReviewIssuesLoader } from "@/hooks/useReviewIssuesLoader"
import MarkdownBlock from "../common/MarkdownBlock"

interface ReviewHistoryItemProps {
	reviewTaskId: string
	title: string
	timestamp: string
	conclusion?: string
	onDelete: (e: React.MouseEvent) => void
}

const formatTimestamp = (timestamp: string): string => {
	try {
		const date = new Date(timestamp)
		const year = date.getFullYear()
		const month = String(date.getMonth() + 1).padStart(2, "0")
		const day = String(date.getDate()).padStart(2, "0")
		const hours = String(date.getHours()).padStart(2, "0")
		const minutes = String(date.getMinutes()).padStart(2, "0")
		return `${year}-${month}-${day} ${hours}:${minutes}`
	} catch {
		return timestamp
	}
}

const renderIssueAction = (issue: ReviewIssue) => {
	if (issue.status === IssueStatus.ACCEPT) {
		return <i className="codicon codicon-check"></i>
	}
	if (issue.status === IssueStatus.REJECT) {
		return <i className="codicon codicon-circle-slash"></i>
	}
	return null
}

const ReviewHistoryItem: React.FC<ReviewHistoryItemProps> = ({
	reviewTaskId,
	title,
	timestamp,
	conclusion,
	onDelete,
}) => {
	const [isExpanded, setIsExpanded] = useState(false)
	const [issues, setIssues] = useState<ReviewIssue[] | undefined>(undefined)
	const [isLoading, setIsLoading] = useState(false)
	const hasLoadedRef = useRef(false)
	const [isTitlePopoverOpen, setIsTitlePopoverOpen] = useState(false)
	const hoverTimeoutRef = useRef<number | null>(null)
	const isMouseOverRef = useRef(false)
	const { loadIssues, getIssues, subscribe } = useReviewIssuesLoader()

	useEffect(() => {
		const cached = getIssues(reviewTaskId)
		if (cached) {
			setIssues(cached)
			setIsLoading(false)
			return
		}
		return subscribe(reviewTaskId, (newIssues) => {
			setIssues(newIssues)
			setIsLoading(false)
		})
	}, [reviewTaskId, getIssues, subscribe])

	const toggleExpand = () => {
		if (!isExpanded && !hasLoadedRef.current) {
			setIsLoading(true)
			loadIssues(reviewTaskId)
			hasLoadedRef.current = true
		}
		setIsExpanded(!isExpanded)
	}

	const clearHoverTimeout = () => {
		if (hoverTimeoutRef.current !== null) {
			window.clearTimeout(hoverTimeoutRef.current)
			hoverTimeoutRef.current = null
		}
	}

	useEffect(() => {
		return () => {
			if (hoverTimeoutRef.current !== null) {
				window.clearTimeout(hoverTimeoutRef.current)
			}
		}
	}, [])

	const handleTitleMouseEnter = () => {
		clearHoverTimeout()
		isMouseOverRef.current = true
		setIsTitlePopoverOpen(true)
	}

	const handleTitleMouseLeave = () => {
		clearHoverTimeout()
		isMouseOverRef.current = false
		hoverTimeoutRef.current = window.setTimeout(() => {
			if (!isMouseOverRef.current) {
				setIsTitlePopoverOpen(false)
			}
			hoverTimeoutRef.current = null
		}, 200)
	}

	const onIssueClick = (issueId: string) => {
		const issue = issues?.find((i) => i.id === issueId)
		if (issue) {
			vscode.postMessage({
				type: "showReviewComment",
				values: {
					issue,
					reviewTaskId,
				},
			})
		}
	}

	return (
		<div className="cursor-pointer group bg-vscode-editor-background rounded-xl relative overflow-hidden border hover:bg-vscode-editor-foreground/10 transition-colors border-transparent m-2">
			<div className="pl-4 flex gap-3 px-3 pt-3 pb-1">
				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-2 whitespace-pre-wrap font-light text-vscode-foreground text-ellipsis line-clamp-3 text-base">
						<span
							className={`codicon ${isExpanded ? "codicon-chevron-down" : "codicon-chevron-right"} text-vscode-descriptionForeground cursor-pointer`}
							onClick={toggleExpand}></span>
						<Popover open={isTitlePopoverOpen} onOpenChange={setIsTitlePopoverOpen}>
							<PopoverTrigger asChild>
								<span onMouseEnter={handleTitleMouseEnter} onMouseLeave={handleTitleMouseLeave}>
									{title}
								</span>
							</PopoverTrigger>
							<PopoverContent
								align="start"
								side="top"
								sideOffset={8}
								className="max-w-xl border-transparent py-2 px-3"
								onMouseEnter={handleTitleMouseEnter}
								onMouseLeave={handleTitleMouseLeave}>
								<div className="max-h-[400px] overflow-y-auto">
									<MarkdownBlock markdown={conclusion || title} />
								</div>
							</PopoverContent>
						</Popover>
					</div>

					{isExpanded && (
						<div className="max-h-[240px] overflow-y-auto mt-2">
							{isLoading ? (
								<div className="flex items-center justify-center gap-2 h-full min-h-[100px] py-2 px-4 text-sm text-vscode-descriptionForeground">
									<i className="codicon codicon-loading codicon-modifier-spin"></i>
									<span>Loading...</span>
								</div>
							) : issues && issues.length > 0 ? (
								issues.map((issue) => (
									<IssueItem
										key={issue.id}
										issue={issue}
										onIssueClick={onIssueClick}
										renderAction={renderIssueAction}
									/>
								))
							) : (
								<div className="text-vscode-descriptionForeground text-sm py-2 px-4">No issues</div>
							)}
						</div>
					)}

					<div className="text-xs text-vscode-descriptionForeground flex justify-between items-center">
						<div className="flex gap-1 items-center text-vscode-descriptionForeground/60">
							{formatTimestamp(timestamp)}
						</div>
						<div className="flex flex-row gap-0 -mx-2 items-center text-vscode-descriptionForeground/60 hover:text-vscode-descriptionForeground">
							<Button
								variant="ghost"
								size="icon"
								data-testid="delete-task-button"
								onClick={onDelete}
								className="opacity-70">
								<span className="codicon codicon-trash size-4 align-middle text-vscode-descriptionForeground" />
							</Button>
						</div>
					</div>
				</div>
			</div>
		</div>
	)
}

export default ReviewHistoryItem
