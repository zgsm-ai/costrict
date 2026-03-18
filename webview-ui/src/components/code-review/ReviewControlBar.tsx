import { useEffect, useRef, useState } from "react"
import { useAppTranslation } from "@/i18n/TranslationContext"
import { RefreshCw, Loader2, ChevronDown } from "lucide-react"

interface ReviewControlBarProps {
	onStartReview: (mode?: string) => void
	onRefresh: () => void
	hasFiles: boolean
	isLoading: boolean
}

type ReviewMode = "review" | "security-review"

const reviewModeOptions: ReadonlyArray<{ mode: ReviewMode; labelKey: string }> = [
	{ mode: "review", labelKey: "codereview:welcomePage.reviewCurrentChanges" },
	{ mode: "security-review", labelKey: "codereview:welcomePage.securityScan" },
]

/**
 * Component for review initiation
 */
const ReviewControlBar = ({ onStartReview, onRefresh, hasFiles, isLoading }: ReviewControlBarProps) => {
	const { t } = useAppTranslation()
	const [selectedMode, setSelectedMode] = useState<ReviewMode>("review")
	const [isModeMenuOpen, setIsModeMenuOpen] = useState(false)
	const modeMenuRef = useRef<HTMLDivElement>(null)

	const isButtonDisabled = !hasFiles || isLoading
	const selectedModeOption = reviewModeOptions.find((option) => option.mode === selectedMode) ?? reviewModeOptions[0]

	const enabledStyle =
		"bg-vscode-button-background text-vscode-button-foreground hover:bg-vscode-button-hoverBackground cursor-pointer"
	const disabledStyle =
		"bg-vscode-button-secondaryBackground text-vscode-button-secondaryForeground cursor-not-allowed opacity-50"
	const buttonStyle = isButtonDisabled ? disabledStyle : enabledStyle

	useEffect(() => {
		if (!isModeMenuOpen) {
			return
		}

		const handlePointerDownOutside = (event: MouseEvent) => {
			if (!modeMenuRef.current?.contains(event.target as Node)) {
				setIsModeMenuOpen(false)
			}
		}

		const handleEscape = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				setIsModeMenuOpen(false)
			}
		}

		document.addEventListener("mousedown", handlePointerDownOutside)
		document.addEventListener("keydown", handleEscape)

		return () => {
			document.removeEventListener("mousedown", handlePointerDownOutside)
			document.removeEventListener("keydown", handleEscape)
		}
	}, [isModeMenuOpen])

	return (
		<div className="flex items-center gap-2">
			<div ref={modeMenuRef} className="relative flex flex-1">
				<button
					type="button"
					data-testid="start-review-button"
					className={`flex-1 px-4 py-2 rounded-l text-sm font-medium transition-colors ${buttonStyle}`}
					onClick={() => onStartReview(selectedMode)}
					disabled={isButtonDisabled}>
					{t(selectedModeOption.labelKey)}
				</button>
				<button
					type="button"
					data-testid="review-mode-trigger"
					aria-haspopup="menu"
					aria-expanded={isModeMenuOpen}
					className={`px-2 py-2 rounded-r border-l border-white/20 text-sm transition-colors ${buttonStyle}`}
					onClick={() => setIsModeMenuOpen((open) => !open)}
					disabled={isButtonDisabled}>
					<ChevronDown className="w-4 h-4" />
				</button>
				{isModeMenuOpen && (
					<div
						data-testid="review-mode-menu"
						role="menu"
						className="absolute right-0 top-full z-50 mt-1 min-w-48 overflow-hidden rounded-xs border border-vscode-focusBorder bg-vscode-dropdown-background p-1 shadow-xs">
						{reviewModeOptions.map((option) => {
							return (
								<button
									key={option.mode}
									type="button"
									role="menuitem"
									data-testid={`review-mode-item-${option.mode}`}
									onClick={() => {
										setSelectedMode(option.mode)
										setIsModeMenuOpen(false)
									}}
									className="flex w-full items-center px-3 py-1.5 text-left text-sm rounded-xs transition-colors text-vscode-dropdown-foreground hover:bg-vscode-list-activeSelectionBackground hover:text-vscode-list-activeSelectionForeground">
									<span className="truncate">{t(option.labelKey)}</span>
								</button>
							)
						})}
					</div>
				)}
			</div>
			<button
				type="button"
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
