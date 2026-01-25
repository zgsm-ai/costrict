import React, { useMemo, useState, useCallback } from "react"
import { ReviewIssue, ReviewTaskStatus, SeverityLevel } from "@roo/codeReview"
import TaskSummary from "./TaskSummary"
import FileIssueList from "./FileIssueList"
import {
	Popover,
	PopoverTrigger,
	PopoverContent,
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui"
import { severityColor } from "./contants"
import { useAppTranslation } from "@/i18n/TranslationContext"

interface FilterState {
	selectedSeverities: SeverityLevel[]
	selectedIssueTypes: string[]
}

interface CodeReviewContentProps {
	issues: ReviewIssue[]
	taskStatus: ReviewTaskStatus
	onIssueClick: (issueId: string) => void
}

const CodeReviewContent: React.FC<CodeReviewContentProps> = ({ issues, taskStatus, onIssueClick }) => {
	const { t } = useAppTranslation()

	// Filter state
	const [filterState, setFilterState] = useState<FilterState>({
		selectedSeverities: [],
		selectedIssueTypes: [],
	})

	// Toggle severity filter
	const toggleSeverity = (severity: SeverityLevel) => {
		setFilterState((prev) => ({
			...prev,
			selectedSeverities: prev.selectedSeverities.includes(severity)
				? prev.selectedSeverities.filter((s) => s !== severity)
				: [...prev.selectedSeverities, severity],
		}))
	}

	// Toggle issue type filter
	const toggleIssueType = (issueType: string) => {
		setFilterState((prev) => ({
			...prev,
			selectedIssueTypes: prev.selectedIssueTypes.includes(issueType)
				? prev.selectedIssueTypes.filter((t) => t !== issueType)
				: [...prev.selectedIssueTypes, issueType],
		}))
	}

	// Apply filters to issues
	const filteredIssues = useMemo(() => {
		return issues.filter((issue) => {
			// Severity filter
			const severityMatch =
				filterState.selectedSeverities.length === 0 || filterState.selectedSeverities.includes(issue.severity)

			// Issue type filter
			const typeMatch =
				filterState.selectedIssueTypes.length === 0 ||
				issue.issue_types.some((type) => filterState.selectedIssueTypes.includes(type))

			return severityMatch && typeMatch
		})
	}, [issues, filterState])

	// Show notification dot if there are active filter conditions
	const showNotificationDot = filterState.selectedIssueTypes.length > 0

	// Group filtered issues by file_path
	const groupedIssues = useMemo(() => {
		const groups: { [filePath: string]: ReviewIssue[] } = {}
		filteredIssues.forEach((issue) => {
			if (!groups[issue.file_path]) {
				groups[issue.file_path] = []
			}
			groups[issue.file_path].push(issue)
		})
		return groups
	}, [filteredIssues])

	const normalColor = severityColor(0.1)
	const activeColor = severityColor()
	const severity = useMemo(
		() => ({
			[SeverityLevel.HIGH]: {
				label: t("codereview:codeReviewContent.severity.high"),
			},
			[SeverityLevel.MIDDLE]: {
				label: t("codereview:codeReviewContent.severity.middle"),
			},
			[SeverityLevel.LOW]: {
				label: t("codereview:codeReviewContent.severity.low"),
			},
		}),
		[t],
	)

	// Get unique issue types from all issues (not filtered ones for filter options)
	const uniqueIssueTypes = useMemo(() => {
		const allIssueTypes = issues.flatMap((issue) => issue.issue_types)
		return Array.from(new Set(allIssueTypes))
	}, [issues])

	// Check if severity is selected
	const isSeveritySelected = useCallback(
		(severityLevel: SeverityLevel) => filterState.selectedSeverities.includes(severityLevel),
		[filterState.selectedSeverities],
	)

	// Check if issue type is selected
	const isIssueTypeSelected = useCallback(
		(issueType: string) => filterState.selectedIssueTypes.includes(issueType),
		[filterState.selectedIssueTypes],
	)

	return (
		<div className="flex flex-col h-full">
			{taskStatus === ReviewTaskStatus.COMPLETED && (
				<div className="mb-4">
					<div className="flex justify-between items-start flex-shrink-0">
						<div className="flex flex-col space-y-2">
							{/* Severity filter - shown left, above TaskSummary */}
							<div className="flex flex-row items-center gap-4">
								<div className="flex items-center">
									<span>{t("codereview:codeReviewContent.severityLabel")}</span>
								</div>
								<div className="flex items-center gap-2">
									{Object.entries(severity).map(([key, { label }]) => {
										const severityLevel = parseInt(key) as SeverityLevel
										const isSelected = isSeveritySelected(severityLevel)
										return (
											<div
												key={key}
												className={`flex justify-center items-center rounded-[20px] py-[3px] px-4 cursor-pointer transition-all duration-200`}
												style={{
													backgroundColor: isSelected
														? activeColor[severityLevel]
														: normalColor[severityLevel],
													color: isSelected
														? "var(--vscode-list-activeSelectionForeground)"
														: activeColor[severityLevel],
												}}
												onClick={() => toggleSeverity(severityLevel)}>
												{label}
											</div>
										)
									})}
								</div>
							</div>
							<TaskSummary issues={filteredIssues} />
						</div>
						<Popover>
							<PopoverTrigger>
								<div className="relative">
									<TooltipProvider>
										<Tooltip>
											<TooltipTrigger>
												<div
													className={`w-6 h-6 flex items-center justify-center rounded-[1px] transition-all duration-200 hover:bg-white/10 active:bg-white/10 cursor-pointer ${showNotificationDot ? "bg-white/10" : ""}`}>
													<i className="codicon codicon-filter"></i>
												</div>
											</TooltipTrigger>
											<TooltipContent side="top" className="text-base">
												{t("codereview:codeReviewContent.filterTooltip")}
											</TooltipContent>
										</Tooltip>
									</TooltipProvider>
									{showNotificationDot && (
										<div
											className="absolute top-[6px] right-[6px] w-[5px] h-[5px] bg-red-500 rounded-full"
											style={{ transform: "translate(50%, -50%)" }}></div>
									)}
								</div>
							</PopoverTrigger>
							<PopoverContent
								className="!border-transparent bg-popover mr-2 rounded-[5px]"
								style={{
									boxShadow: "0 2px 8px var(--color-vscode-widget-shadow)",
									outline: "1px solid var(--color-vscode-menu-border)",
								}}>
								<div>
									<div className="flex items-center mb-2">
										{t("codereview:codeReviewContent.issueLabel")}
									</div>
									<div className="flex items-center gap-2 flex-wrap">
										{uniqueIssueTypes.map((type) => {
											const isSelected = isIssueTypeSelected(type)
											return (
												<div
													key={type}
													className={`h-4 truncate flex justify-center items-center px-4 py-3 rounded-[20px] cursor-pointer transition-all duration-200`}
													style={{
														backgroundColor: isSelected ? "#E6C000" : "rgba(230,192,0,0.1)",
														color: isSelected
															? "var(--vscode-list-activeSelectionForeground)"
															: "#E6C000",
													}}
													onClick={() => toggleIssueType(type)}>
													{type}
												</div>
											)
										})}
									</div>
								</div>
							</PopoverContent>
						</Popover>
					</div>
				</div>
			)}
			<div className="flex-1 overflow-y-auto">
				<div className="flex flex-col space-y-4">
					{Object.entries(groupedIssues).map(([filePath, fileIssues]) => (
						<FileIssueList
							key={filePath}
							fileName={filePath}
							issues={fileIssues}
							onIssueClick={onIssueClick}
						/>
					))}
				</div>
			</div>
		</div>
	)
}

// Export the component
export default CodeReviewContent
