import React from "react"
import { useExtensionState } from "@src/context/ExtensionStateContext"
import { TaskStatus } from "@roo/shared/codeReview"
import CodeReviewPanel from "./CodeReviewPanel"
import WelcomePage from "./WelcomePage"

interface CodeReviewPageProps {
	onIssueClick: (issueId: string) => void
	onTaskCancel: () => void
}

const CodeReviewPage: React.FC<CodeReviewPageProps> = ({ onIssueClick, onTaskCancel }) => {
	const { reviewTask } = useExtensionState()
	const {
		status,
		data: { issues, progress, error = "" },
	} = reviewTask
	if (status === TaskStatus.INITIAL && issues.length === 0) {
		return <WelcomePage />
	}

	return (
		<>
			<CodeReviewPanel
				issues={issues} // To be sourced from context
				taskStatus={status}
				progress={progress} // To be sourced from context
				errorMessage={error}
				onIssueClick={onIssueClick}
				onTaskCancel={onTaskCancel}
			/>
		</>
	)
}

export default CodeReviewPage
