import React, { useEffect, useState } from "react"
import { useExtensionState } from "@src/context/ExtensionStateContext"
import { ReviewTaskStatus } from "@roo/codeReview"
import CodeReviewPanel from "./CodeReviewPanel"
import WelcomePage from "./WelcomePage"

interface CodeReviewPageProps {
	isHidden?: boolean
	onIssueClick: (issueId: string) => void
	onTaskCancel: () => void
}

enum Page {
	Welcome = "welcome",
	CodebaseSync = "codebaseSync",
	Review = "review",
}

const CodeReviewPage: React.FC<CodeReviewPageProps> = ({ isHidden, onIssueClick, onTaskCancel }) => {
	const { reviewTask } = useExtensionState()
	const {
		status,
		data: { issues, progress, error = "", message = "" },
	} = reviewTask
	const [page, setPage] = useState<Page>(() => {
		if (status === ReviewTaskStatus.INITIAL && issues.length === 0) {
			return Page.Welcome
		}
		return Page.Review
	})

	useEffect(() => {
		if (status === ReviewTaskStatus.INITIAL && issues.length === 0) {
			setPage(Page.Welcome)
		} else {
			setPage(Page.Review)
		}
	}, [status, issues.length])
	switch (page) {
		case Page.Welcome:
			return <WelcomePage />
		case Page.Review:
			return (
				<div
					className={`fixed top-[28px] left-0 right-0 bottom-0 flex flex-col overflow-hidden ${isHidden ? "hidden" : ""}`}>
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
}

export default CodeReviewPage
