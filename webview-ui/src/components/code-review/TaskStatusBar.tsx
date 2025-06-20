import React from "react"
import { ReviewIssue, TaskStatus } from "@roo/shared/codeReview"
import { CheckIcon, InfoCircledIcon } from "@radix-ui/react-icons"
import { useAppTranslation } from "@/i18n/TranslationContext"

interface TaskStatusBarProps {
	taskStatus: TaskStatus
	progress: number
	errorMessage: string
	issues: ReviewIssue[]
	onTaskCancel: () => void
}

const TaskStatusBar: React.FC<TaskStatusBarProps> = ({ taskStatus, progress, issues, errorMessage, onTaskCancel }) => {
	const { t } = useAppTranslation()

	return (
		<div className="flex items-center mt-5">
			{taskStatus === TaskStatus.RUNNING && (
				<div className="mb-4">
					<div className="flex items-center">
						<div
							className="w-4 h-4 rounded-full border-2 border-transparent animate-spin"
							style={{ borderTopColor: "rgba(23, 112, 230, 0.7)" }}
						/>
						<span className="ml-2">
							{t("codereview:taskStatusBar.running", { progress: Math.round(progress * 100) })}
						</span>
						<span className="ml-2 text-[#1876F2] cursor-pointer" onClick={() => onTaskCancel()}>
							{t("codereview:taskStatusBar.cancel")}
						</span>
					</div>
				</div>
			)}
			{taskStatus === TaskStatus.COMPLETED && issues.length === 0 && (
				<div className="flex items-center mb-4">
					<CheckIcon color="#50B371" width={20} height={20} />
					<span className="ml-2">{t("codereview:taskStatusBar.completed")}</span>
				</div>
			)}
			{taskStatus === TaskStatus.ERROR && (
				<div className="mb-4">
					<div className="flex items-center">
						<InfoCircledIcon className="text-[#E64545] leading-[17px]" width={20} height={20} />
						<span className="ml-2 text-[#E64545] leading-[17px]">{errorMessage ?? ""}</span>
					</div>
				</div>
			)}
		</div>
	)
}

export default TaskStatusBar
