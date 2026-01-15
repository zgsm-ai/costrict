import { memo, useState, useRef, useEffect } from "react"
import { useTranslation } from "react-i18next"
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react"

import { StandardTooltip } from "@src/components/ui"

import MarkdownBlock from "../common/MarkdownBlock"

const MAX_COLLAPSED_HEIGHT = 300

interface CollapsibleMarkdownBlockProps {
	markdown?: string
	collapseWithoutScroll?: boolean
}

export const CollapsibleMarkdownBlock = memo(({ markdown, collapseWithoutScroll }: CollapsibleMarkdownBlockProps) => {
	const { t } = useTranslation()
	const [isHovering, setIsHovering] = useState(false)
	const [isExpanded, setIsExpanded] = useState(false)
	const [showExpandButton, setShowExpandButton] = useState(false)
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

					<StandardTooltip content={isExpanded ? "收起内容" : "展开全部内容"}>
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
				style={{
					maxHeight: !isExpanded && showExpandButton ? `${MAX_COLLAPSED_HEIGHT}px` : "none",
					overflow: !isExpanded && showExpandButton && collapseWithoutScroll ? "hidden" : "auto",
					position: "relative",
				}}>
				<MarkdownBlock markdown={markdown} />
			</div>
			{collapseWithoutScroll && showExpandButton && !isExpanded && (
				<div
					role="button"
					tabIndex={0}
					onClick={() => setIsExpanded(true)}
					onKeyDown={(event) => {
						if (event.key === "Enter" || event.key === " ") {
							event.preventDefault()
							setIsExpanded(true)
						}
					}}
					style={{
						marginTop: "6px",
						height: "40px",
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						cursor: "pointer",
						background: "linear-gradient(to bottom, rgba(0, 0, 0, 0), var(--vscode-editor-background))",
						color: "var(--vscode-descriptionForeground)",
					}}>
					{t("chat:markdown.expandPrompt")}
				</div>
			)}
		</div>
	)
})
