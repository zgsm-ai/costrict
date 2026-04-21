import { ChevronDown, Wrench } from "lucide-react"
import { useMemo, useState } from "react"

import { ToolUseBlock, ToolUseBlockHeader } from "../../../components/common/ToolUseBlock"
import { Button } from "../../../components/ui/button"
import type { CostrictCloudMessageItem } from "../../messageAdapter"
import MarkdownBlock from "../../../components/common/MarkdownBlock"
import { cn } from "../../../lib/utils"

type ToolRendererProps = {
	message: CostrictCloudMessageItem
	onInspect?: (message: CostrictCloudMessageItem) => void
}

export function ToolRenderer({ message, onInspect }: ToolRendererProps) {
	const result = message.metadata?.result
	const tokens = message.metadata?.tokens
	const reason = message.metadata?.reason
	const deltaField = typeof message.metadata?.field === "string" ? message.metadata.field : ""
	const chips = [
		tokens ? `tokens: ${formatCompactValue(tokens)}` : "",
		reason ? `reason: ${String(reason)}` : "",
		deltaField ? `field: ${deltaField}` : "",
		result != null && typeof result !== "string" ? "包含结构化结果" : "",
	].filter(Boolean)
	const details = message.metadata ? Object.entries(message.metadata) : []
	const previewText = message.content || chips.join(" · ") || "点击展开查看工具详情"
	const shouldStartCollapsed = useMemo(() => {
		return message.status === "completed" && (previewText.length > 260 || details.length > 2)
	}, [details.length, message.status, previewText.length])
	const [collapsed, setCollapsed] = useState(shouldStartCollapsed)

	return (
		<ToolUseBlock className="cursor-default rounded-[20px] border border-vscode-panel-border/70 bg-vscode-editor-background/55 px-4 py-3 shadow-[0_8px_24px_rgba(0,0,0,0.08)] transition-all duration-200 hover:border-vscode-panel-border/90 hover:bg-vscode-editor-background/65">
			<div className="flex items-start gap-3">
				<button type="button" onClick={() => setCollapsed((current) => !current)} className="flex min-w-0 flex-1 items-start gap-2 rounded-xl px-1.5 py-1.5 text-left transition-all duration-200 hover:bg-vscode-list-hoverBackground/25 active:scale-[0.995]">
					<div className="mt-0.5 flex size-7 items-center justify-center rounded-full border border-vscode-panel-border/70 bg-vscode-sideBar-background/35 transition-colors duration-200 group-hover:border-vscode-focusBorder/25 group-hover:bg-vscode-focusBorder/10">
						<Wrench className="size-3.5" />
					</div>
					<div className="min-w-0 flex-1">
						<ToolUseBlockHeader className="gap-2 text-sm">
							<span>{message.toolName || message.title || "工具调用"}</span>
							{message.status ? <span className="rounded-full border border-vscode-panel-border/70 bg-vscode-sideBar-background/30 px-2 py-0.5 text-[11px] text-vscode-descriptionForeground">{message.status}</span> : null}
						</ToolUseBlockHeader>
						<div className="mt-1 truncate text-xs text-vscode-descriptionForeground">{previewText.replace(/\s+/g, " ")}</div>
					</div>
					<ChevronDown className={cn("mt-1 size-4 shrink-0 text-vscode-descriptionForeground transition-transform duration-200", !collapsed && "rotate-180")} />
				</button>
				<Button variant="ghost" size="sm" className="rounded-full transition-all duration-200 hover:-translate-y-0.5" onClick={() => onInspect?.(message)}>
					查看详情
				</Button>
			</div>

			<div className={cn("grid transition-all duration-300 ease-out", collapsed ? "grid-rows-[0fr] opacity-0" : "mt-3 grid-rows-[1fr] opacity-100")}>
				<div className="overflow-hidden">
					<div className="border-t border-vscode-panel-border/50 pt-3">
						{chips.length > 0 ? (
							<div className="mb-3 flex flex-wrap gap-2">
								{chips.map((chip) => (
									<span key={chip} className="inline-flex items-center rounded-full border border-vscode-panel-border/70 bg-vscode-sideBar-background/25 px-2.5 py-1 text-[11px] text-vscode-descriptionForeground">
										{chip}
									</span>
								))}
							</div>
						) : null}

						{message.content ? <MarkdownBlock markdown={message.content} /> : null}

						{details.length > 0 ? (
							<div className="mt-3 rounded-2xl border border-vscode-panel-border/60 bg-vscode-textCodeBlock-background/45 p-3 text-xs text-vscode-descriptionForeground">
								<div className="mb-2 font-medium uppercase tracking-[0.16em]">附加信息</div>
								<div className="space-y-2">
									{details.map(([key, value]) => (
										<div key={key}>
											<div className="mb-1 font-medium">{key}</div>
											<pre className="overflow-auto whitespace-pre-wrap break-all rounded-xl bg-vscode-editor-background p-2 text-vscode-editor-foreground">
												{typeof value === "string" ? value : JSON.stringify(value, null, 2)}
											</pre>
										</div>
									))}
								</div>
							</div>
						) : null}
					</div>
				</div>
			</div>
		</ToolUseBlock>
	)
}

function formatCompactValue(value: unknown) {
	if (typeof value === "number") {
		return value.toLocaleString()
	}
	if (typeof value === "string") {
		return value
	}
	return JSON.stringify(value)
}

export default ToolRenderer
