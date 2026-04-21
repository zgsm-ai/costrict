import { AlertCircle, CheckCircle2, ChevronDown, LoaderCircle, TerminalSquare, XCircle } from "lucide-react"
import { useMemo, useState } from "react"

import CodeBlock from "../../../components/common/CodeBlock"
import { Button } from "../../../components/ui/button"
import type { CostrictCloudMessageItem } from "../../messageAdapter"
import { cn } from "../../../lib/utils"

type CommandRendererProps = {
	message: CostrictCloudMessageItem
	onInspect?: (message: CostrictCloudMessageItem) => void
}

export function CommandRenderer({ message, onInspect }: CommandRendererProps) {
	const stdout = typeof message.metadata?.stdout === "string" ? message.metadata.stdout : ""
	const stderr = typeof message.metadata?.stderr === "string" ? message.metadata.stderr : ""
	const exitCode = typeof message.metadata?.exitCode === "number" ? message.metadata.exitCode : undefined
	const hasStructuredOutput = Boolean(stdout || stderr)
	const details = Object.entries(message.metadata ?? {}).filter(([key]) => !["stdout", "stderr", "exitCode"].includes(key))
	const previewText = stdout || stderr || message.content || ""
	const shouldStartCollapsed = useMemo(() => {
		const textLength = previewText.length
		return message.status === "completed" && (textLength > 320 || details.length > 2)
	}, [details.length, message.status, previewText.length])
	const [collapsed, setCollapsed] = useState(shouldStartCollapsed)

	return (
		<div className="rounded-[20px] border border-vscode-panel-border/70 bg-vscode-editor-background/55 px-4 py-3 shadow-[0_8px_24px_rgba(0,0,0,0.08)] transition-all duration-200 hover:border-vscode-panel-border/90 hover:bg-vscode-editor-background/65">
			<div className="flex items-start gap-3">
				<button
					type="button"
					onClick={() => setCollapsed((current) => !current)}
					className="flex min-w-0 flex-1 items-start gap-2 rounded-xl px-1.5 py-1.5 text-left transition-all duration-200 hover:bg-vscode-list-hoverBackground/25 active:scale-[0.995]">
					<div className="mt-0.5 flex size-7 items-center justify-center rounded-full border border-vscode-panel-border/70 bg-vscode-sideBar-background/35 transition-colors duration-200 group-hover:border-vscode-focusBorder/25 group-hover:bg-vscode-focusBorder/10">
						<TerminalSquare className="size-3.5" />
					</div>
					<div className="min-w-0 flex-1">
						<div className="flex flex-wrap items-center gap-2 text-sm font-medium text-vscode-descriptionForeground">
							<span className="text-vscode-editor-foreground">{message.command || message.title || "命令执行"}</span>
							{message.status ? <InlineStatus status={message.status} /> : null}
							{typeof exitCode === "number" ? <ExitCodeBadge exitCode={exitCode} /> : null}
						</div>
						<div className="mt-1 truncate text-xs text-vscode-descriptionForeground">
							{message.command || (previewText ? previewText.replace(/\s+/g, " ") : "点击展开查看命令详情")}
						</div>
					</div>
					<ChevronDown className={cn("mt-1 size-4 shrink-0 text-vscode-descriptionForeground transition-transform duration-200", !collapsed && "rotate-180")} />
				</button>
				<Button variant="ghost" size="sm" className="rounded-full transition-all duration-200 hover:-translate-y-0.5" onClick={() => onInspect?.(message)}>
					查看详情
				</Button>
			</div>

			<div className={cn("grid transition-all duration-300 ease-out", collapsed ? "grid-rows-[0fr] opacity-0" : "mt-3 grid-rows-[1fr] opacity-100")}>
				<div className="overflow-hidden">
					<div className="space-y-3 border-t border-vscode-panel-border/50 pt-3">
						{message.command ? (
							<div>
								<div className="mb-1.5 text-[11px] uppercase tracking-[0.16em] text-vscode-descriptionForeground">命令</div>
								<CodeBlock source={message.command} language="shell" />
							</div>
						) : null}

						{hasStructuredOutput ? (
							<div className="space-y-3">
								{stdout ? (
									<div>
										<div className="mb-1.5 text-[11px] uppercase tracking-[0.16em] text-vscode-descriptionForeground">标准输出</div>
										<CodeBlock source={stdout} language="shell" />
									</div>
								) : null}
								{stderr ? (
									<div>
										<div className="mb-1.5 text-[11px] uppercase tracking-[0.16em] text-vscode-descriptionForeground">错误输出</div>
										<div className="rounded-2xl border border-vscode-errorForeground/25 bg-vscode-inputValidation-errorBackground/20 p-2">
											<CodeBlock source={stderr} language="shell" />
										</div>
									</div>
								) : null}
							</div>
						) : message.content ? (
							<div>
								<div className="mb-1.5 text-[11px] uppercase tracking-[0.16em] text-vscode-descriptionForeground">输出预览</div>
								<CodeBlock source={message.content} language="shell" />
							</div>
						) : (
							<div className="rounded-2xl border border-dashed border-vscode-panel-border/70 bg-vscode-editor-background/35 px-3 py-3 text-sm text-vscode-descriptionForeground">
								暂时还没有可展示的命令输出。
							</div>
						)}

						{details.length > 0 ? (
							<div className="rounded-2xl border border-vscode-panel-border/60 bg-vscode-textCodeBlock-background/45 p-3 text-xs text-vscode-descriptionForeground">
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
		</div>
	)
}

function ExitCodeBadge({ exitCode }: { exitCode: number }) {
	return (
		<span
			className={cn(
				"inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
				exitCode === 0 ? "bg-vscode-testing-iconPassed/15 text-vscode-testing-iconPassed" : "bg-vscode-errorForeground/15 text-vscode-errorForeground",
			)}>
			exit {exitCode}
		</span>
	)
}

function InlineStatus({ status }: { status: string }) {
	return (
		<span className={cn("inline-flex items-center gap-1 text-xs", statusTone(status))}>
			{statusIcon(status)}
			{status}
		</span>
	)
}

function statusTone(status: string) {
	switch (status.toLowerCase()) {
		case "completed":
			return "text-vscode-testing-iconPassed"
		case "failed":
		case "error":
			return "text-vscode-errorForeground"
		case "running":
		case "pending":
		case "streaming":
			return "text-vscode-button-foreground"
		default:
			return "text-vscode-descriptionForeground"
	}
}

function statusIcon(status: string) {
	switch (status.toLowerCase()) {
		case "completed":
			return <CheckCircle2 className="size-3.5" />
		case "failed":
		case "error":
			return <XCircle className="size-3.5" />
		case "running":
		case "pending":
		case "streaming":
			return <LoaderCircle className="size-3.5 animate-spin" />
		default:
			return <AlertCircle className="size-3.5" />
	}
}

export default CommandRenderer
