import { useAppTranslation } from "@/i18n/TranslationContext"
import { RefreshCw, Loader2 } from "lucide-react"

interface ReviewControlBarProps {
	onStartReview: () => void
	onRefresh: () => void
	hasFiles: boolean
	isLoading: boolean
}

/**
 * Component for review initiation
 */
const ReviewControlBar = ({ onStartReview, onRefresh, hasFiles, isLoading }: ReviewControlBarProps) => {
	const { t } = useAppTranslation()

	const isButtonDisabled = !hasFiles || isLoading

	return (
		<div className="flex items-center gap-2">
			<button
				className={`flex-1 px-4 py-2 rounded text-sm font-medium transition-colors ${
					isButtonDisabled
						? "bg-vscode-button-secondaryBackground text-vscode-button-secondaryForeground cursor-not-allowed opacity-50"
						: "bg-vscode-button-background text-vscode-button-foreground hover:bg-vscode-button-hoverBackground cursor-pointer"
				}`}
				onClick={onStartReview}
				disabled={isButtonDisabled}>
				{t("codereview:welcomePage.reviewCurrentChanges")}
			</button>
			<button
				className={`p-2 rounded transition-colors ${
					isLoading
						? "text-vscode-button-secondaryForeground cursor-not-allowed opacity-50"
						: "text-vscode-button-foreground hover:bg-vscode-button-hoverBackground cursor-pointer"
				}`}
				onClick={onRefresh}
				disabled={isLoading}
				title="Refresh">
				{isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
			</button>
		</div>
	)
}

export default ReviewControlBar
