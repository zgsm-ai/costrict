import React, { useCallback, useEffect, useState } from "react"
import { useExtensionState } from "@src/context/ExtensionStateContext"
import { ReviewTaskStatus } from "@roo/codeReview"
import CodeReviewPanel from "./CodeReviewPanel"
import WelcomePage from "./WelcomePage"

interface CodeReviewPageProps {
	isHidden?: boolean
	onIssueClick: (issueId: string) => void
	onTaskCancel: () => void
	onNavigateToWelcome?: (navigateFn: () => void) => void
}

enum Page {
	Welcome = "welcome",
	Review = "review",
}

const CodeReviewPage: React.FC<CodeReviewPageProps> = ({
	isHidden,
	onIssueClick,
	onTaskCancel,
	onNavigateToWelcome,
}) => {
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

	const navigateToWelcome = useCallback(() => setPage(Page.Welcome), [])
	const navigateToReview = useCallback(() => setPage(Page.Review), [])

	// Sync page state with reviewTask status
	useEffect(() => {
		// When review task starts running, auto-navigate to review page
		if (status === ReviewTaskStatus.RUNNING && page === Page.Welcome) {
			setPage(Page.Review)
		}
	}, [status, page])

	// Expose navigateToWelcome to parent component
	useEffect(() => {
		onNavigateToWelcome?.(navigateToWelcome)
	}, [navigateToWelcome, onNavigateToWelcome])

	switch (page) {
		case Page.Welcome:
			return <WelcomePage onStartReview={navigateToReview} />
		case Page.Review:
			return (
				<div
					className={`fixed top-[28px] left-0 right-0 bottom-0 flex flex-col overflow-hidden px-5 ${isHidden ? "hidden" : ""}`}>
					<CodeReviewPanel
						issues={issues}
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
