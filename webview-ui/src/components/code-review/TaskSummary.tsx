import React, { useMemo } from "react"
import { ReviewIssue, IssueStatus } from "@roo/shared/codeReview"

interface TaskSummaryProps {
	issues: ReviewIssue[]
}

const TaskSummary: React.FC<TaskSummaryProps> = ({ issues }) => {
	const statistics = useMemo(() => {
		const filesCount = new Set(issues.map((issue) => issue.file_path)).size

		const bugsCount = issues.length

		const acceptCount = issues.filter((issue) => issue.status === IssueStatus.ACCEPT).length

		const rejectCount = issues.filter((issue) => issue.status === IssueStatus.REJECT).length

		return {
			filesCount,
			bugsCount,
			acceptCount,
			rejectCount,
		}
	}, [issues])

	return (
		<div className="flex items-center gap-4 text-vscode-editor-foreground">
			<span>Files: {statistics.filesCount}</span>
			<span>Bugs: {statistics.bugsCount}</span>
			<span>Accept: {statistics.acceptCount}</span>
			<span>Reject: {statistics.rejectCount}</span>
		</div>
	)
}

export default TaskSummary
