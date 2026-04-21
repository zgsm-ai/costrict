import type { CostrictCloudMessageItem } from "../../messageAdapter"
import { cn } from "../../../lib/utils"

type UnknownRendererProps = {
	message: CostrictCloudMessageItem
}

export function UnknownRenderer({ message }: UnknownRendererProps) {
	return (
		<div className="rounded-2xl border border-vscode-panel-border/70 bg-vscode-sideBar-background/30 px-4 py-3">
			<div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-vscode-descriptionForeground">
				<span>{message.kind}</span>
				{message.status ? (
					<span
						className={cn(
							"inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
							message.status === "streaming" || message.status === "running"
								? "bg-vscode-button-background/15 text-vscode-button-foreground"
								: "bg-vscode-badge-background text-vscode-badge-foreground",
						)}>
						{message.status}
					</span>
				) : null}
			</div>
			<div className="text-sm text-vscode-editor-foreground whitespace-pre-wrap break-words">
				{message.content || (typeof message.raw === "string" ? message.raw : JSON.stringify(message.raw, null, 2))}
			</div>
		</div>
	)
}

export default UnknownRenderer
