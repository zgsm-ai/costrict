import { useCallback, useEffect, useRef, useState } from "react"
interface HoverProps {
	show: boolean
	content: string
	x: number
	y: number
}

export const useHoverEvent = (
	highlightLayerRef: React.RefObject<HTMLDivElement>,
	hoverPreviewMap?: Map<string, string>,
) => {
	// Hover preview states
	const [hoverPreview, setHoverPreview] = useState<HoverProps>({ show: false, content: "", x: 0, y: 0 })

	// Custom setHoverPreview to ensure immediate unlock when preview is hidden
	const customSetHoverPreview = useCallback((newState: HoverProps | ((prev: HoverProps) => HoverProps)) => {
		setHoverPreview((prev) => {
			const updatedState = typeof newState === "function" ? newState(prev) : newState

			// Immediately unlock if preview state changes from shown to hidden
			if (prev.show && !updatedState.show) {
				isPreviewLockedRef.current = false
			}

			return updatedState
		})
	}, [])

	// Timer reference for delayed display
	const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null)
	// Current hovered element information
	const currentHoverRef = useRef<{ element: HTMLElement; rect: DOMRect; content: string } | null>(null)
	// Lock state to prevent other elements from triggering new previews when preview is shown
	const isPreviewLockedRef = useRef(false)

	// Clear delay timer
	const clearHoverTimeout = useCallback(() => {
		if (hoverTimeoutRef.current) {
			clearTimeout(hoverTimeoutRef.current)
			hoverTimeoutRef.current = null
		}
	}, [])

	// Show preview content
	const showPreview = useCallback(
		(_: HTMLElement, rect: DOMRect, content: string) => {
			// Estimate actual height based on content line count
			const lines = content.split("\n").length
			const estimatedHeight = Math.min(lines * 16 + 16, 150) // 16px per line + 16px top/bottom padding

			// Get page scroll offset
			const scrollTop = window.pageYOffset || document.documentElement.scrollTop
			const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft

			// Get viewport dimensions
			const viewportWidth = window.innerWidth
			const viewportHeight = window.innerHeight

			// Preview box dimensions
			const previewWidth = 300
			const previewHeight = estimatedHeight

			// Calculate element's relative position in viewport
			const elementTop = rect.top + scrollTop
			const elementBottom = rect.bottom + scrollTop
			const elementLeft = rect.left + scrollLeft

			// Calculate initial position of preview box (prefer showing above element)
			let xPos = elementLeft
			let yPos = elementTop - previewHeight - 2 // Show 2px above element

			// Check if there's enough space above
			if (yPos < scrollTop) {
				// Not enough space above, try showing below element
				yPos = elementBottom + 2

				// Check if there's enough space below
				if (yPos + previewHeight > scrollTop + viewportHeight) {
					// Not enough space below either, center in viewport
					yPos = scrollTop + (viewportHeight - previewHeight) / 2
				}
			}

			// Check if there's enough space on the right
			if (xPos + previewWidth > scrollLeft + viewportWidth) {
				// Not enough space on right, try left alignment
				xPos = scrollLeft + viewportWidth - previewWidth - 8

				// If still overflowing, center display
				if (xPos < scrollLeft) {
					xPos = scrollLeft + (viewportWidth - previewWidth) / 2
				}
			}

			// Ensure not exceeding left boundary
			if (xPos < scrollLeft) {
				xPos = scrollLeft + 8
			}

			// Lock preview state to prevent other elements from triggering new previews
			isPreviewLockedRef.current = true

			customSetHoverPreview({
				show: true,
				content: `${content}`,
				x: xPos,
				y: yPos,
			})
		},
		[customSetHoverPreview],
	)

	// Handle hover events for file path previews
	const handleHighlightMouseEnter = useCallback(
		(event: Event) => {
			const target = event.target as HTMLElement
			if (target.classList.contains("file-path-highlight") && target.textContent) {
				const rect = target.getBoundingClientRect()
				const pathKey = target.textContent
				const content = hoverPreviewMap?.get(pathKey) || target.textContent

				// Check if mouse is within preview layer
				const previewContainer = document.querySelector('[class*="hover-preview-container"]')
				const isMouseInPreview = previewContainer && previewContainer.matches(":hover")

				// If preview is locked and mouse is in preview layer, don't trigger any new preview operations
				if (isPreviewLockedRef.current && isMouseInPreview) {
					return
				}

				// If preview is locked and mouse is not in preview layer, set delay to update preview content after 1 second
				if (isPreviewLockedRef.current && !isMouseInPreview) {
					// Confirm again that mouse is not in preview layer
					const checkAgainPreview = document.querySelector('[class*="hover-preview-container"]')
					const isStillMouseInPreview = checkAgainPreview && checkAgainPreview.matches(":hover")

					if (!isStillMouseInPreview) {
						// Clear previous timer
						clearHoverTimeout()

						// Store current hovered element information
						currentHoverRef.current = { element: target, rect, content }

						// Set delay to update preview content after 1 second
						hoverTimeoutRef.current = setTimeout(() => {
							// Check again if mouse is still on element and not in preview layer
							const finalPreviewCheck = document.querySelector('[class*="hover-preview-container"]')
							const isMouseInPreviewFinal = finalPreviewCheck && finalPreviewCheck.matches(":hover")

							if (
								currentHoverRef.current &&
								currentHoverRef.current.element === target &&
								!isMouseInPreviewFinal
							) {
								showPreview(target, rect, content)
							}
						}, 1000)
					}
					return
				}

				// Clear previous timer
				clearHoverTimeout()

				// Store current hovered element information
				currentHoverRef.current = { element: target, rect, content }

				// Set delay to show after 500ms
				hoverTimeoutRef.current = setTimeout(() => {
					// Check if mouse is still on element
					if (currentHoverRef.current && currentHoverRef.current.element === target) {
						showPreview(target, rect, content)
					}
				}, 500)
			}
		},
		[hoverPreviewMap, clearHoverTimeout, showPreview],
	)

	const handleHighlightMouseLeave = useCallback(
		(event: MouseEvent) => {
			const relatedTarget = event.relatedTarget as HTMLElement

			// Check if moving to preview box or other highlighted elements
			if (
				relatedTarget &&
				(relatedTarget.closest('[class*="hover-preview-container"]') ||
					relatedTarget.classList.contains("file-path-highlight"))
			) {
				return
			}

			// Add delay to hide, giving users time to move mouse to preview box
			hoverTimeoutRef.current = setTimeout(() => {
				// Check again if mouse is currently in preview box
				const previewContainer = document.querySelector('[class*="hover-preview-container"]')
				if (previewContainer && previewContainer.matches(":hover")) {
					return // Don't hide if mouse is in preview box
				}

				// Clear delay timer and current hover information
				clearHoverTimeout()
				currentHoverRef.current = null
				// Unlock preview state, allowing other elements to trigger new previews
				isPreviewLockedRef.current = false
				customSetHoverPreview((prev) => ({ ...prev, show: false }))
			}, 500) // Increase to 500ms, giving users more time to move mouse to preview box
		},
		[clearHoverTimeout, customSetHoverPreview],
	)

	// Use useEffect to manage event listeners
	useEffect(() => {
		const highlightLayer = highlightLayerRef.current
		if (!highlightLayer) return

		const filePathElements = highlightLayer.querySelectorAll(".file-path-highlight")
		const eventListeners: Array<() => void> = []

		filePathElements.forEach((element: Element) => {
			const enterHandler = (event: Event) => handleHighlightMouseEnter(event)
			const leaveHandler = (event: Event) => handleHighlightMouseLeave(event as MouseEvent)

			element.addEventListener("mouseenter", enterHandler)
			element.addEventListener("mouseleave", leaveHandler)

			eventListeners.push(() => {
				element.removeEventListener("mouseenter", enterHandler)
				element.removeEventListener("mouseleave", leaveHandler)
			})
		})

		// Return cleanup function
		return () => {
			// Clean up event listeners
			eventListeners.forEach((cleanup) => cleanup())
			// Clean up timers
			clearHoverTimeout()
			currentHoverRef.current = null
		}
	}, [handleHighlightMouseEnter, handleHighlightMouseLeave, clearHoverTimeout, highlightLayerRef])

	return {
		hoverPreview,
		setHoverPreview: customSetHoverPreview,
	}
}
