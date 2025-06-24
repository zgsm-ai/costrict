import React from "react"
import TaskStatusBar from "./TaskStatusBar"
import CodeReviewContent from "./CodeReviewContent"
import { ReviewIssue, TaskStatus } from "@roo/shared/codeReview"
interface CodeReviewPanelProps {
	issues: ReviewIssue[]
	taskStatus: TaskStatus
	progress: number | null
	errorMessage: string
	message: string
	onIssueClick: (issueId: string) => void
	onTaskCancel: () => void
}
const CodeReviewPanel: React.FC<CodeReviewPanelProps> = ({
	issues,
	taskStatus,
	progress,
	message,
	errorMessage,
	onIssueClick,
	onTaskCancel,
}) => {
	return (
		<div className="flex flex-col h-full">
			<div className="flex-shrink-0 px-5">
				<TaskStatusBar
					taskStatus={taskStatus}
					progress={progress}
					issues={issues}
					message={message}
					errorMessage={errorMessage}
					onTaskCancel={onTaskCancel}
				/>
			</div>
			<div className="flex-1 overflow-hidden">
				<CodeReviewContent issues={issues} taskStatus={taskStatus} onIssueClick={onIssueClick} />
			</div>
		</div>
	)
}

export default CodeReviewPanel
