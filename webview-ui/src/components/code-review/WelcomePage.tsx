import { useState, useEffect, useCallback } from "react"
import { useAppTranslation } from "@/i18n/TranslationContext"
import { useEvent } from "react-use"
import { vscode } from "@/utils/vscode"
import { useExtensionState } from "@/context/ExtensionStateContext"
import ReviewControlBar from "./ReviewControlBar"
import FileListPreview from "./FileListPreview"

interface FileChangeItem {
	path: string
	status: string
	oldPath?: string
}

interface WelcomePageProps {
	onStartReview: () => void
}

const WelcomePage: React.FC<WelcomePageProps> = ({ onStartReview }) => {
	const { t } = useAppTranslation()
	const { hasClosedCodeReviewWelcomeTips } = useExtensionState()
	const [files, setFiles] = useState<FileChangeItem[]>([])
	const [isLoading, setIsLoading] = useState(false)

	// Request file list when component mounts
	useEffect(() => {
		setIsLoading(true)
		vscode.postMessage({
			type: "getReviewFiles",
		})
	}, [])

	// Handle messages from extension
	const handleMessage = useCallback((event: MessageEvent) => {
		const message = event.data
		if (message.type === "reviewFilesResponse") {
			const { files: responseFiles } = message.payload || {}
			setFiles(responseFiles || [])
			setIsLoading(false)
		}
	}, [])

	useEvent("message", handleMessage)

	const handleStartReview = () => {
		vscode.postMessage({
			type: "createReviewTask",
			payload: { files },
		})
		onStartReview() // Immediately switch to Review page
	}

	const handleRefresh = () => {
		setIsLoading(true)
		vscode.postMessage({
			type: "getReviewFiles",
		})
	}
	const Tips = () => {
		const handleDismiss = () => {
			vscode.postMessage({
				type: "setCodeReviewWelcomeTips",
				payload: { value: true },
			})
		}

		return (
			<div className="flex justify-between bg-[#2D2D30] text-white p-4 px-5 rounded-lg text-base ml-4 mr-4 mt-4">
				<div className="flex items-center">
					<i className="codicon codicon-lightbulb" style={{ color: "rgba(255, 252, 196, 0.7)" }} />
					<span className="ml-1">{t("codereview:welcomePage.tips")}</span>
				</div>
				<span className="text-[#85858D] cursor-pointer" onClick={handleDismiss}>
					{t("codereview:welcomePage.dismiss")}
				</span>
			</div>
		)
	}
	return (
		<div className="welcome-page-container flex flex-col h-full w-full bg-vscode-sideBar-background text-vscode-foreground">
			<div className="welcome-page flex flex-col w-full max-w-[800px] mx-auto">
				{!hasClosedCodeReviewWelcomeTips && <Tips />}
				<div className="px-5 mt-4">
					<FileListPreview files={files} isLoading={isLoading} />
					<ReviewControlBar
						onStartReview={handleStartReview}
						onRefresh={handleRefresh}
						hasFiles={files.length > 0}
						isLoading={isLoading}
					/>
				</div>
			</div>
		</div>
	)
}

export default WelcomePage
