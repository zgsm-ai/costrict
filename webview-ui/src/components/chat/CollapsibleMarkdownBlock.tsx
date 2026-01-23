import { memo, useState, useRef, useEffect } from "react"
import { useTranslation } from "react-i18next"
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react"

import { StandardTooltip } from "@src/components/ui"

import MarkdownBlock from "../common/MarkdownBlock"

const MAX_COLLAPSED_HEIGHT = 400

interface CollapsibleMarkdownBlockProps {
	markdown?: string
	collapseWithoutScroll?: boolean
}

export const CollapsibleMarkdownBlock = memo(({ markdown, collapseWithoutScroll }: CollapsibleMarkdownBlockProps) => {
	const { t } = useTranslation()
	const [isHovering, setIsHovering] = useState(false)
	const [isExpanded, setIsExpanded] = useState(false)
	const [showExpandButton, setShowExpandButton] = useState(collapseWithoutScroll)
	const contentRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		if (contentRef.current) {
			const contentHeight = contentRef.current.scrollHeight
			setShowExpandButton(contentHeight > MAX_COLLAPSED_HEIGHT)
		}
	}, [markdown])

	if (!markdown || markdown.length === 0) {
		return null
	}

	return (
		<div
			onMouseEnter={() => setIsHovering(true)}
			onMouseLeave={() => setIsHovering(false)}
			style={{ position: "relative" }}>
			{isHovering && showExpandButton && (
				<div
					style={{
						position: "absolute",
						top: "4px",
						right: "8px",
						display: "flex",
						alignItems: "center",
						gap: "4px",
						opacity: 0,
						animation: "fadeIn 0.2s ease-in-out forwards",
						zIndex: 10,
					}}>
					<style>{`@keyframes fadeIn { from { opacity: 0; } to { opacity: 1.0; } }`}</style>

					<StandardTooltip
						content={isExpanded ? t("chat:task.collapseContent") : t("chat:task.expandAllContent")}>
						<VSCodeButton
							appearance="icon"
							style={{
								height: "24px",
								border: "none",
								background: "var(--vscode-editor-background)",
								transition: "background 0.2s ease-in-out",
							}}
							onClick={() => setIsExpanded(!isExpanded)}>
							<span className={`codicon codicon-chevron-${isExpanded ? "up" : "down"}`} />
						</VSCodeButton>
					</StandardTooltip>
				</div>
			)}

			<div
				ref={contentRef}
				style={
					collapseWithoutScroll
						? {
								wordBreak: "break-word",
								overflowWrap: "anywhere",
								maxHeight: !isExpanded && showExpandButton ? `${MAX_COLLAPSED_HEIGHT}px` : "none",
								overflow: !isExpanded && showExpandButton && collapseWithoutScroll ? "hidden" : "auto",
								position: "relative",
							}
						: { position: "relative" }
				}>
				<MarkdownBlock markdown={markdown} />
			</div>
			{collapseWithoutScroll && showExpandButton && !isExpanded && (
				<div
					style={{
						position: "absolute",
						bottom: 0,
						left: 0,
						right: 0,
						height: "80px",
						background: "linear-gradient(to top, var(--vscode-editor-background), transparent)",
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
					}}>
					<VSCodeButton
						appearance="secondary"
						style={{
							borderRadius: "100px",
							opacity: isHovering ? 1 : 0,
							transition: "opacity 0.2s ease-in-out",
							pointerEvents: isHovering ? "auto" : "none",
						}}
						onClick={() => {
							setIsExpanded(true)
						}}>
						{t("chat:markdown.expandPrompt")}
					</VSCodeButton>
				</div>
			)}
		</div>
	)
})
