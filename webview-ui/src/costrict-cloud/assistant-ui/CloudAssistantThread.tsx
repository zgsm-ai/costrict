import { ArrowDown } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"

import { Button } from "../../components/ui/button"
import { cn } from "../../lib/utils"
import type { CostrictCloudMessageItem } from "../messageAdapter"
import { CloudAssistantMessageRenderer } from "./CloudAssistantMessageRenderer"
import { CloudCommandInspector } from "./CloudCommandInspector"
import type { CloudAssistantRuntimeLike } from "./types"

type CloudAssistantThreadProps = {
	runtime?: CloudAssistantRuntimeLike | null
	messages: CostrictCloudMessageItem[]
	emptyState?: React.ReactNode
}

/**
 * Phase 1 最小骨架：
 * - 先建立 assistant-ui 接入边界与组件目录
 * - 当前保持统一线程壳层，但不直接绑定 assistant-ui 具体 primitives
 * - 待 Phase 1/2 后续确认 runtime 与 primitives 用法后，再把这里替换为真实 assistant-ui Thread 实现
 */
export function CloudAssistantThread({ runtime: _runtime, messages, emptyState }: CloudAssistantThreadProps) {
	const [inspectedMessage, setInspectedMessage] = useState<CostrictCloudMessageItem | null>(null)
	const scrollContainerRef = useRef<HTMLDivElement | null>(null)
	const bottomAnchorRef = useRef<HTMLDivElement | null>(null)
	const [shouldAutoFollow, setShouldAutoFollow] = useState(true)
	const [showScrollToBottom, setShowScrollToBottom] = useState(false)
	const [hasUnreadWhileDetached, setHasUnreadWhileDetached] = useState(false)
	const previousMessageSignatureRef = useRef("")
	const messageSignature = useMemo(
		() => messages.map((message) => `${message.id}:${message.status ?? ""}:${message.content.length}`).join("|"),
		[messages],
	)

	useEffect(() => {
		const container = scrollContainerRef.current
		if (!container) {
			return
		}

		const handleScroll = () => {
			const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight
			const atBottom = distanceToBottom < 64
			setShouldAutoFollow(atBottom)
			setShowScrollToBottom(!atBottom)
			if (atBottom) {
				setHasUnreadWhileDetached(false)
			}
		}

		handleScroll()
		container.addEventListener("scroll", handleScroll, { passive: true })
		return () => container.removeEventListener("scroll", handleScroll)
	}, [])

	useEffect(() => {
		const previousSignature = previousMessageSignatureRef.current
		if (previousSignature && previousSignature !== messageSignature && !shouldAutoFollow) {
			setHasUnreadWhileDetached(true)
		}
		previousMessageSignatureRef.current = messageSignature
	}, [messageSignature, shouldAutoFollow])

	useEffect(() => {
		if (!shouldAutoFollow) {
			return
		}
		bottomAnchorRef.current?.scrollIntoView({ block: "end", behavior: "smooth" })
	}, [messageSignature, shouldAutoFollow])

	const handleScrollToBottom = () => {
		bottomAnchorRef.current?.scrollIntoView({ block: "end", behavior: "smooth" })
		setShouldAutoFollow(true)
		setShowScrollToBottom(false)
		setHasUnreadWhileDetached(false)
	}

	return (
		<div className="relative h-full min-w-0">
			<div ref={scrollContainerRef} className="scrollbar-cloud h-full overflow-x-hidden overflow-y-auto pr-1">
				<CloudAssistantMessageRenderer
					messages={messages}
					emptyState={emptyState}
					onInspectMessage={(message) => {
						if (message.kind === "command" || message.kind === "tool") {
							setInspectedMessage(message)
						}
					}}
				/>
				<div ref={bottomAnchorRef} className="h-1 w-full" />
			</div>

			{showScrollToBottom ? (
				<div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex flex-col items-center gap-2">
					<Button
						variant="outline"
						size="sm"
						className={cn(
							"pointer-events-auto rounded-full border-vscode-panel-border/80 bg-vscode-editor-background/90 shadow-[0_12px_30px_rgba(0,0,0,0.18)] backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5",
							hasUnreadWhileDetached &&
								"border-vscode-focusBorder/40 bg-vscode-focusBorder/12 text-vscode-focusBorder hover:bg-vscode-focusBorder/18",
						)}
						onClick={handleScrollToBottom}>
						<ArrowDown className="size-4" />
						{hasUnreadWhileDetached ? "查看最新消息" : "回到底部"}
					</Button>
				</div>
			) : null}

			<CloudCommandInspector message={inspectedMessage} onClose={() => setInspectedMessage(null)} />
		</div>
	)
}

export default CloudAssistantThread
