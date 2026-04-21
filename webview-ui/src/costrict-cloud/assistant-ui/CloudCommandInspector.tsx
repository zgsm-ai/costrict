import { TerminalSquare, Wrench, X } from "lucide-react"

import CodeBlock from "../../components/common/CodeBlock"
import { Button } from "../../components/ui/button"
import { cn } from "../../lib/utils"
import type { CostrictCloudMessageItem } from "../messageAdapter"

type CloudCommandInspectorProps = {
	message: CostrictCloudMessageItem | null
	onClose: () => void
}

export function CloudCommandInspector({ message, onClose }: CloudCommandInspectorProps) {
	if (!message) {
		return null
	}

	const stdout = typeof message.metadata?.stdout === "string" ? message.metadata.stdout : ""
	const stderr = typeof message.metadata?.stderr === "string" ? message.metadata.stderr : ""
	const output = typeof message.metadata?.output === "string" ? message.metadata.output : ""
	const exitCode = typeof message.metadata?.exitCode === "number" ? message.metadata.exitCode : undefined
	const metadataEntries = Object.entries(message.metadata ?? {})
	const kindLabel = message.kind === "tool" ? "工具详情" : "命令详情"
	const title = message.command || message.toolName || message.title || kindLabel

	return (
		<>
			<button type="button" aria-label="关闭详情面板" className="absolute inset-0 z-30 bg-black/45 backdrop-blur-[1px]" onClick={onClose} />
			<aside className="absolute inset-y-0 right-0 z-40 flex w-[560px] max-w-[92vw] flex-col border-l border-vscode-panel-border/80 bg-[linear-gradient(180deg,rgba(24,24,27,0.98),rgba(24,24,27,0.94))] shadow-[0_30px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl">
				<div className="border-b border-vscode-panel-border/70 px-4 py-4">
					<div className="flex items-start justify-between gap-3">
						<div className="min-w-0">
							<div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-vscode-descriptionForeground">
								{message.kind === "tool" ? <Wrench className="size-4" /> : <TerminalSquare className="size-4" />}
								<span>{kindLabel}</span>
							</div>
							<h2 className="mt-2 break-words text-lg font-semibold text-vscode-editor-foreground">{title}</h2>
							<div className="mt-2 flex flex-wrap gap-2 text-xs text-vscode-descriptionForeground">
								{message.status ? <InspectorMetaChip>{message.status}</InspectorMetaChip> : null}
								{typeof exitCode === "number" ? <InspectorMetaChip tone={exitCode === 0 ? "success" : "danger"}>exit {exitCode}</InspectorMetaChip> : null}
								{message.timestamp ? <InspectorMetaChip>{new Date(message.timestamp).toLocaleString()}</InspectorMetaChip> : null}
							</div>
						</div>
						<Button variant="ghost" size="icon" className="rounded-full" onClick={onClose} title="关闭详情面板">
							<X className="size-4" />
						</Button>
					</div>
				</div>

				<div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
					{message.command ? (
						<InspectorSection title="命令">
							<CodeBlock source={message.command} language="shell" />
						</InspectorSection>
					) : null}

					{message.content ? (
						<InspectorSection title={message.kind === "tool" ? "内容预览" : "输出预览"}>
							<CodeBlock source={message.content} language={message.kind === "tool" ? "json" : "shell"} />
						</InspectorSection>
					) : null}

					{stdout ? (
						<InspectorSection title="标准输出">
							<CodeBlock source={stdout} language="shell" />
						</InspectorSection>
					) : null}

					{stderr ? (
						<InspectorSection title="错误输出" tone="danger">
							<CodeBlock source={stderr} language="shell" />
						</InspectorSection>
					) : null}

					{output ? (
						<InspectorSection title="原始输出">
							<CodeBlock source={output} language="shell" />
						</InspectorSection>
					) : null}

					{metadataEntries.length > 0 ? (
						<InspectorSection title="元数据">
							<div className="space-y-3">
								{metadataEntries.map(([key, value]) => (
									<div key={key}>
										<div className="mb-1 text-xs font-medium uppercase tracking-wide text-vscode-descriptionForeground">{key}</div>
										<pre className="overflow-auto whitespace-pre-wrap break-all rounded-xl border border-vscode-panel-border/60 bg-vscode-editor-background p-3 text-xs text-vscode-editor-foreground">
											{typeof value === "string" ? value : JSON.stringify(value, null, 2)}
										</pre>
									</div>
								))}
							</div>
						</InspectorSection>
					) : null}

					<InspectorSection title="原始事件数据">
						<pre className="overflow-auto whitespace-pre-wrap break-all rounded-xl border border-vscode-panel-border/60 bg-vscode-editor-background p-3 text-xs text-vscode-editor-foreground">
							{JSON.stringify(message.raw, null, 2)}
						</pre>
					</InspectorSection>
				</div>
			</aside>
		</>
	)
}

function InspectorSection({ title, children, tone = "default" }: { title: string; children: React.ReactNode; tone?: "default" | "danger" }) {
	return (
		<section className={cn("rounded-[22px] border p-3.5 shadow-[0_8px_24px_rgba(0,0,0,0.08)]", tone === "danger" ? "border-vscode-errorForeground/30 bg-vscode-inputValidation-errorBackground/20" : "border-vscode-panel-border/70 bg-vscode-editor-background/70")}>
			<div className="mb-2 text-[11px] font-medium uppercase tracking-[0.18em] text-vscode-descriptionForeground">{title}</div>
			{children}
		</section>
	)
}

function InspectorMetaChip({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "success" | "danger" }) {
	return (
		<span
			className={cn(
				"rounded-full border px-2.5 py-0.5",
				tone === "success" && "border-vscode-testing-iconPassed/40 bg-vscode-testing-iconPassed/10 text-vscode-testing-iconPassed",
				tone === "danger" && "border-vscode-errorForeground/40 bg-vscode-errorForeground/10 text-vscode-errorForeground",
				tone === "default" && "border-vscode-panel-border/70 bg-vscode-sideBar-background/50 text-vscode-descriptionForeground",
			)}>
			{children}
		</span>
	)
}

export default CloudCommandInspector
