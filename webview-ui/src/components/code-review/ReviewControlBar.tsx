import { useAppTranslation } from "@/i18n/TranslationContext"

interface ReviewControlBarProps {
	onStartReview: () => void
	hasFiles: boolean
	isLoading: boolean
}

/**
 * Component for review initiation
 */
const ReviewControlBar = ({ onStartReview, hasFiles, isLoading }: ReviewControlBarProps) => {
	const { t } = useAppTranslation()

	const isButtonDisabled = !hasFiles || isLoading

	return (
		<div className="flex items-center">
			<button
				className={`w-full px-4 py-2 rounded text-sm font-medium transition-colors ${
					isButtonDisabled
						? "bg-vscode-button-secondaryBackground text-vscode-button-secondaryForeground cursor-not-allowed opacity-50"
						: "bg-vscode-button-background text-vscode-button-foreground hover:bg-vscode-button-hoverBackground cursor-pointer"
				}`}
				onClick={onStartReview}
				disabled={isButtonDisabled}>
				{t("codereview:welcomePage.reviewCurrentChanges")}
			</button>
		</div>
	)
}

export default ReviewControlBar
