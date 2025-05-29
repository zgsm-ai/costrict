import React from "react"
import TaskStatusBar from "./TaskStatusBar"
import CodeReviewContent from "./CodeReviewContent"
import { ReviewIssue, TaskStatus } from "@roo/shared/codeReview"
interface CodeReviewPanelProps {
	issues: ReviewIssue[]
	taskStatus: TaskStatus
	progress: number
	errorMessage: string
	onIssueClick: (issueId: string) => void
	onTaskCancel: () => void
}
const CodeReviewPanel: React.FC<CodeReviewPanelProps> = ({
	issues,
	taskStatus,
	progress,
	errorMessage,
	onIssueClick,
	onTaskCancel,
}) => {
	return (
		<div>
			<TaskStatusBar
				taskStatus={taskStatus}
				progress={progress}
				issues={issues}
				errorMessage={errorMessage}
				onTaskCancel={onTaskCancel}
			/>
			<CodeReviewContent issues={issues} taskStatus={taskStatus} onIssueClick={onIssueClick} />
		</div>
	)
}

export default CodeReviewPanel
