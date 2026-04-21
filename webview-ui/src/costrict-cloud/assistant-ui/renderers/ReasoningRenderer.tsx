import { useMemo, useState } from "react"
import { ChevronUp, Lightbulb } from "lucide-react"

import MarkdownBlock from "../../../components/common/MarkdownBlock"
import { cn } from "../../../lib/utils"

type ReasoningRendererProps = {
	content: string
	isStreaming: boolean
	isLast: boolean
}

export function ReasoningRenderer({ content, isStreaming, isLast }: ReasoningRendererProps) {
	const [collapsed, setCollapsed] = useState(false)
	const streamingLabel = useMemo(() => {
		if (!isLast || !isStreaming) {
			return "思考中"
		}
		return "正在推理…"
	}, [isLast, isStreaming])

	return (
		<div className="group rounded-[20px] border border-vscode-panel-border/70 bg-vscode-editor-background/55 px-4 py-3 shadow-[0_8px_24px_rgba(0,0,0,0.08)] transition-all duration-200 hover:border-vscode-panel-border/90 hover:bg-vscode-editor-background/65">
			<button
				type="button"
				className="flex w-full items-center justify-between gap-2 rounded-xl px-1.5 py-1.5 text-left text-vscode-descriptionForeground transition-all duration-200 hover:bg-vscode-list-hoverBackground/30 active:scale-[0.995]"
				onClick={() => setCollapsed((current) => !current)}>
				<div className="flex items-center gap-2">
					<div className="flex size-7 items-center justify-center rounded-full border border-vscode-panel-border/70 bg-vscode-sideBar-background/35 transition-colors duration-200 group-hover:border-vscode-focusBorder/25 group-hover:bg-vscode-focusBorder/10">
						<Lightbulb className="size-3.5" />
					</div>
					<div>
						<div className="text-[11px] uppercase tracking-[0.16em] text-vscode-descriptionForeground">推理过程</div>
						<div className="text-sm font-medium text-vscode-foreground">{streamingLabel}</div>
					</div>
				</div>
				<ChevronUp className={cn("size-4 transition-transform duration-200", collapsed && "rotate-180")} />
			</button>
			<div className={cn("grid transition-all duration-300 ease-out", collapsed || !content.trim() ? "grid-rows-[0fr] opacity-0" : "mt-3 grid-rows-[1fr] opacity-100")}>
				<div className="overflow-hidden">
					<div className="ml-3 border-l border-vscode-descriptionForeground/20 pl-4 text-sm leading-6 text-vscode-descriptionForeground">
						<MarkdownBlock markdown={content} />
					</div>
				</div>
			</div>
		</div>
	)
}

export default ReasoningRenderer
