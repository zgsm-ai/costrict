import { memo, useState, useRef, useEffect } from "react"
import { useTranslation } from "react-i18next"
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react"

import { useCopyToClipboard } from "@src/utils/clipboard"
import { StandardTooltip } from "@src/components/ui"

import MarkdownBlock from "../common/MarkdownBlock"

const MAX_COLLAPSED_HEIGHT = 400

// Global flag to prevent auto-scrolling when expanding markdown content
// This is set to true when user clicks expand button and cleared after content settles
export const markdownExpandingRef = { current: false }

export const Markdown = memo(
	({
		markdown,
		partial,
		collapseWithoutScroll,
	}: {
		markdown?: string
		partial?: boolean
		collapseWithoutScroll?: boolean
	}) => {
		const { t } = useTranslation()
		const [isHovering, setIsHovering] = useState(false)
		const [isExpanded, setIsExpanded] = useState(false)
		const [showExpandButton, setShowExpandButton] = useState(false)
		const contentRef = useRef<HTMLDivElement>(null)
		// Shorter feedback duration for copy button flash.
		const { copyWithFeedback } = useCopyToClipboard(200)

		useEffect(() => {
			if (contentRef.current && !partial) {
				const contentHeight = contentRef.current.scrollHeight
				setShowExpandButton(contentHeight > MAX_COLLAPSED_HEIGHT)
			}
		}, [markdown, partial])

		if (!markdown || markdown.length === 0) {
			return null
		}

		return (
			<div
				onMouseEnter={() => setIsHovering(true)}
				onMouseLeave={() => setIsHovering(false)}
				style={{ position: "relative" }}>
				{isHovering && (
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

						{showExpandButton && !partial && (
							<StandardTooltip content={isExpanded ? "收起内容" : "展开全部内容"}>
								<VSCodeButton
									appearance="icon"
									style={{
										height: "24px",
										border: "none",
										background: "var(--vscode-editor-background)",
										transition: "background 0.2s ease-in-out",
									}}
									onClick={() => {
										// Set global flag to prevent auto-scrolling during expansion
										markdownExpandingRef.current = true
										setIsExpanded(!isExpanded)
										// Clear flag after content has rendered and settled
										setTimeout(() => {
											markdownExpandingRef.current = false
										}, 1000)
									}}>
									<span className={`codicon codicon-chevron-${isExpanded ? "up" : "down"}`} />
								</VSCodeButton>
							</StandardTooltip>
						)}

						{markdown && !partial && (
							<StandardTooltip content="Copy as markdown">
								<VSCodeButton
									className="copy-button"
									appearance="icon"
									style={{
										height: "24px",
										border: "none",
										background: "var(--vscode-editor-background)",
										transition: "background 0.2s ease-in-out",
									}}
									onClick={async () => {
										const success = await copyWithFeedback(markdown)
										if (success) {
											const button = document.activeElement as HTMLElement
											if (button) {
												button.style.background = "var(--vscode-button-background)"
												setTimeout(() => {
													button.style.background = ""
												}, 200)
											}
										}
									}}>
									<span className="codicon codicon-copy" />
								</VSCodeButton>
							</StandardTooltip>
						)}
					</div>
				)}

				<div
					ref={contentRef}
					style={{
						wordBreak: "break-word",
						overflowWrap: "anywhere",
						maxHeight: !isExpanded && showExpandButton ? `${MAX_COLLAPSED_HEIGHT}px` : "none",
						overflow: !isExpanded && showExpandButton && collapseWithoutScroll ? "hidden" : "auto",
						position: "relative",
					}}>
					<MarkdownBlock markdown={markdown} />
				</div>
				{collapseWithoutScroll && showExpandButton && !isExpanded && !partial && (
					<div
						role="button"
						tabIndex={0}
						onClick={() => {
							markdownExpandingRef.current = true
							setIsExpanded(true)
							setTimeout(() => {
								markdownExpandingRef.current = false
							}, 1000)
						}}
						onKeyDown={(event) => {
							if (event.key === "Enter" || event.key === " ") {
								event.preventDefault()
								markdownExpandingRef.current = true
								setIsExpanded(true)
								setTimeout(() => {
									markdownExpandingRef.current = false
								}, 1000)
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
	},
)
