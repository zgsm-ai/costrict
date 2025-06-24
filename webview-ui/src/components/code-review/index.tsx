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
		data: { issues, progress, error = "", message = "" },
	} = reviewTask
	if (status === TaskStatus.INITIAL && issues.length === 0) {
		return <WelcomePage />
	}

	return (
		<div className="fixed top-[28px] left-0 right-0 bottom-0 flex flex-col overflow-hidden">
			<CodeReviewPanel
				issues={issues} // To be sourced from context
				taskStatus={status}
				progress={progress} // To be sourced from context
				message={message}
				errorMessage={error}
				onIssueClick={onIssueClick}
				onTaskCancel={onTaskCancel}
			/>
		</div>
	)
}

export default CodeReviewPage
