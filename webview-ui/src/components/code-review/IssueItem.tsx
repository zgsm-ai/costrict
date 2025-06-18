import React from "react"
import { ReviewIssue, IssueStatus } from "@roo/shared/codeReview"
import { severityColor } from "./contants"

interface IssueItemProps {
	issue: ReviewIssue
	onIssueClick: (issueId: string) => void
}

const IssueItem: React.FC<IssueItemProps> = ({ issue, onIssueClick }) => {
	const colors = severityColor()
	const isNotInitial = ![IssueStatus.INITIAL, IssueStatus.IGNORE].includes(issue.status)
	const badges = (issue.issue_types ?? []).map((type) => {
		return (
			<div className="h-4 text-[#E6C000] truncate flex justify-center items-center px-4 py-3 rounded-[20px] bg-[rgba(230,192,0,0.1)]">
				{type}
			</div>
		)
	})
	return (
		<div
			className="w-full flex hover:bg-vscode-list-hoverBackground cursor-pointer mt-[2px] pr-5"
			style={{ opacity: isNotInitial ? 0.6 : 1 }}
			onClick={() => onIssueClick(issue.id)}>
			<div className="w-[2px]" style={{ backgroundColor: colors[issue.severity] }}></div>
			<div className="pl-3 py-[5px] flex-1" style={{ width: "calc(100% - 2px)" }}>
				<div className="w-full h-4 text-vscode-foreground truncate">{issue.title || issue.message}</div>
				<div className="flex flex-wrap gap-1 mt-2">{badges}</div>
			</div>
		</div>
	)
}

export default IssueItem
