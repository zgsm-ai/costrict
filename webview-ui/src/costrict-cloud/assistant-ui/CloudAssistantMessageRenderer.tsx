import { LoaderCircle, MessageSquareText, Bot } from "lucide-react"

import MarkdownBlock from "../../components/common/MarkdownBlock"
import { cn } from "../../lib/utils"
import type { CostrictCloudMessageItem } from "../messageAdapter"
import { ReasoningRenderer } from "./renderers/ReasoningRenderer"
import { ToolRenderer } from "./renderers/ToolRenderer"
import { CommandRenderer } from "./renderers/CommandRenderer"
import { ErrorRenderer } from "./renderers/ErrorRenderer"
import { UnknownRenderer } from "./renderers/UnknownRenderer"

type CloudAssistantMessageRendererProps = {
	messages: CostrictCloudMessageItem[]
	emptyState?: React.ReactNode
	onInspectMessage?: (message: CostrictCloudMessageItem) => void
}

/**
 * Phase 2 消息 renderer：
 * - 保留 user / assistant 的基础展示
 * - 拆出 reasoning / tool / command / error / unknown 专用 renderer
 * - 当前消息分发层已具备完整扩展点，后续可继续收敛为 assistant-ui primitives
 */
export function CloudAssistantMessageRenderer({ messages, emptyState, onInspectMessage }: CloudAssistantMessageRendererProps) {
	if (messages.length === 0) {
		return (
			emptyState ?? (
				<div className="rounded-2xl border border-dashed border-vscode-panel-border p-6 text-sm text-vscode-descriptionForeground">
					暂无消息，请先读取 messages 或发送 prompt。
				</div>
			)
		)
	}

	return (
		<div className="min-h-0 space-y-3 px-1 py-1">
			{messages.map((message, index) => {
				if (message.kind === "user") {
					return <UserMessageCard key={`${message.id}-${index}`} message={message} />
				}
				if (message.kind === "assistant") {
					return <AssistantMessageCard key={`${message.id}-${index}`} message={message} />
				}
				if (message.kind === "reasoning") {
					return (
						<div key={`${message.id}-${index}`} className="pl-11">
							<ReasoningRenderer
								content={message.content}
								isStreaming={message.status === "streaming"}
								isLast={index === messages.length - 1}
							/>
						</div>
					)
				}
				if (message.kind === "tool") {
					return <div key={`${message.id}-${index}`} className="pl-11"><ToolRenderer message={message} onInspect={onInspectMessage} /></div>
				}
				if (message.kind === "command") {
					return <div key={`${message.id}-${index}`} className="pl-11"><CommandRenderer message={message} onInspect={onInspectMessage} /></div>
				}
				if (message.kind === "error") {
					return <div key={`${message.id}-${index}`} className="pl-11"><ErrorRenderer message={message.content} /></div>
				}
				return <div key={`${message.id}-${index}`} className="pl-11"><UnknownRenderer message={message} /></div>
			})}
		</div>
	)
}

function UserMessageCard({ message }: { message: CostrictCloudMessageItem }) {
	return (
		<div className="flex justify-end">
			<div className="max-w-[76%] space-y-1.5">
				<div className="flex items-center justify-end gap-2 px-1 text-[11px] font-medium uppercase tracking-[0.16em] text-vscode-descriptionForeground">
					{message.timestamp ? <span className="normal-case tracking-normal">{new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span> : null}
					<span className="inline-flex items-center gap-1 rounded-full border border-vscode-focusBorder/25 bg-vscode-focusBorder/10 px-2 py-0.5 text-vscode-focusBorder">
						<MessageSquareText className="size-3" />
						用户
					</span>
				</div>
				<div className="rounded-[20px] rounded-br-md border border-vscode-focusBorder/18 bg-[color-mix(in_srgb,var(--vscode-focusBorder)_10%,var(--vscode-editor-background))] px-4 py-3 text-[14px] leading-6 text-vscode-editor-foreground shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
					<MarkdownBlock markdown={message.content} />
				</div>
			</div>
		</div>
	)
}

function AssistantMessageCard({ message }: { message: CostrictCloudMessageItem }) {
	const streaming = message.status === "streaming"
	return (
		<div className="relative flex items-start gap-3">
			<div className="absolute left-4 top-10 bottom-[-12px] w-px bg-vscode-panel-border/50" aria-hidden="true" />
			<div className="relative mt-1 flex size-8 shrink-0 items-center justify-center rounded-full border border-vscode-panel-border/70 bg-vscode-sideBar-background/70 text-vscode-descriptionForeground shadow-sm">
				<Bot className="size-4" />
			</div>
			<div className="min-w-0 max-w-[82%] space-y-1.5">
				<div className="flex flex-wrap items-center gap-2 px-1 text-[11px] text-vscode-descriptionForeground">
					{/* <span className="font-semibold uppercase tracking-[0.16em] text-vscode-editor-foreground/85">助手</span> */}
					{streaming ? (
						<span className="inline-flex items-center gap-1 rounded-full border border-vscode-focusBorder/20 bg-vscode-focusBorder/10 px-2 py-0.5 text-vscode-focusBorder">
							<LoaderCircle className="size-3 animate-spin" />
							正在生成
						</span>
					) : null}
					{message.timestamp ? <span>{new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span> : null}
				</div>
				<div
					className={cn(
						"rounded-[20px] rounded-tl-md border px-4 py-3 text-[14px] leading-6 shadow-[0_10px_30px_rgba(0,0,0,0.12)]",
						streaming
							? "border-vscode-focusBorder/20 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.02))]"
							: "border-vscode-panel-border/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.012))]",
					)}>
					<MarkdownBlock markdown={message.content} />
				</div>
			</div>
		</div>
	)
}
