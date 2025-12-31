import React, { useState } from "react"
import { ReviewHistoryEntry, IssueStatus, ReviewIssue } from "@roo/codeReview"
import { Button } from "@/components/ui"
import IssueItem from "./IssueItem"
import { vscode } from "@src/utils/vscode"

interface ReviewHistoryItemProps {
	reviewTaskId: string
	issues: ReviewHistoryEntry["issues"]
	timestamp: string
	onDelete: (e: React.MouseEvent) => void
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

const ReviewHistoryItem: React.FC<ReviewHistoryItemProps> = ({ reviewTaskId, issues, onDelete }) => {
	const [isExpanded, setIsExpanded] = useState(false)
	const onIssueClick = (issueId: string) => {
		const issue = issues.find((i) => i.id === issueId)
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
							onClick={() => setIsExpanded(!isExpanded)}></span>
						<span>{reviewTaskId}</span>
					</div>

					{isExpanded && (
						<div className="max-h-[240px] overflow-y-auto mt-2">
							{issues && issues.length > 0 ? (
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
						<div className="flex gap-1 items-center text-vscode-descriptionForeground/60">2025/12/23</div>
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
