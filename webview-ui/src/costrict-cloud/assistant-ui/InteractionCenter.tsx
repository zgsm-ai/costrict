import { HelpCircle, ShieldAlert } from "lucide-react"

import { Button } from "../../components/ui/button"
import { cn } from "../../lib/utils"
import type { CostrictCloudInteractionItem } from "../messageAdapter"

type InteractionCenterProps = {
	permissions: CostrictCloudInteractionItem[]
	questions: CostrictCloudInteractionItem[]
	interactionSubmittingId: string
	onRefresh: () => void
	refreshing: boolean
	renderPermission: (interaction: CostrictCloudInteractionItem) => React.ReactNode
	renderQuestion: (interaction: CostrictCloudInteractionItem) => React.ReactNode
}

export function InteractionCenter({
	permissions,
	questions,
	interactionSubmittingId,
	onRefresh,
	refreshing,
	renderPermission,
	renderQuestion,
}: InteractionCenterProps) {
	const totalCount = permissions.length + questions.length
	const activeSubmitting = Boolean(interactionSubmittingId)

	return (
		<section className="mt-1 rounded-[28px] border border-vscode-panel-border/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.035),rgba(255,255,255,0.015))] p-4 shadow-[0_18px_50px_rgba(0,0,0,0.14)] backdrop-blur-sm">
			<div className="flex flex-col gap-3 border-b border-vscode-panel-border/50 pb-3 lg:flex-row lg:items-start lg:justify-between">
				<div>
					<div className="text-[11px] uppercase tracking-[0.18em] text-vscode-descriptionForeground">人工确认</div>
					<div className="mt-1 flex flex-wrap items-center gap-2">
						<div className="text-sm font-medium">交互中心</div>
						<span className="rounded-full border border-vscode-panel-border/70 bg-vscode-sideBar-background/40 px-2.5 py-0.5 text-[11px] text-vscode-descriptionForeground">
							{totalCount} pending
						</span>
						{activeSubmitting ? (
							<span className="rounded-full border border-vscode-testing-iconQueued/35 bg-vscode-testing-iconQueued/10 px-2.5 py-0.5 text-[11px] text-vscode-testing-iconQueued">
								处理中…
							</span>
						) : null}
					</div>
					<p className="mt-1.5 text-xs text-vscode-descriptionForeground">
						统一展示当前会话需要人工确认或回复的交互请求。
					</p>
				</div>
				<Button variant="outline" size="sm" className="rounded-full" onClick={onRefresh} disabled={refreshing}>
					刷新交互
				</Button>
			</div>

			<div className="mt-4 grid gap-4 xl:grid-cols-2">
				<InteractionColumn
					title="Permissions"
					description="等待人工确认的权限请求"
					count={permissions.length}
					icon={<ShieldAlert className="size-4" />}>
					{permissions.length === 0 ? (
						<EmptyInteractionState text="当前没有待处理 permission" />
					) : (
						permissions.map((interaction) => <div key={interaction.id}>{renderPermission(interaction)}</div>)
					)}
				</InteractionColumn>

				<InteractionColumn
					title="Questions"
					description="需要用户填写回复内容的问题"
					count={questions.length}
					icon={<HelpCircle className="size-4" />}>
					{questions.length === 0 ? (
						<EmptyInteractionState text="当前没有待处理 question" />
					) : (
						questions.map((interaction) => <div key={interaction.id}>{renderQuestion(interaction)}</div>)
					)}
				</InteractionColumn>
			</div>
		</section>
	)
}

type InteractionColumnProps = {
	title: string
	description: string
	count: number
	icon: React.ReactNode
	children: React.ReactNode
}

function InteractionColumn({ title, description, count, icon, children }: InteractionColumnProps) {
	return (
		<div className="rounded-[22px] border border-vscode-panel-border/70 bg-vscode-sideBar-background/22 p-3.5 shadow-[0_1px_0_rgba(255,255,255,0.03)_inset]">
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<div className="flex items-center gap-2 text-sm font-medium text-vscode-foreground">
						{icon}
						<span>{title}</span>
					</div>
					<div className="mt-1 text-xs text-vscode-descriptionForeground">{description}</div>
				</div>
				<span className={cn("rounded-full border px-2.5 py-0.5 text-[11px] font-medium", count > 0 ? "border-vscode-button-background/25 bg-vscode-button-background/10 text-vscode-button-foreground" : "border-vscode-panel-border/70 bg-vscode-badge-background/70 text-vscode-badge-foreground")}>
					{count}
				</span>
			</div>
			<div className="mt-3 space-y-3">{children}</div>
		</div>
	)
}

function EmptyInteractionState({ text }: { text: string }) {
	return (
		<div className="rounded-2xl border border-dashed border-vscode-panel-border/70 bg-vscode-editor-background/35 px-3 py-5 text-center text-sm text-vscode-descriptionForeground">
			{text}
		</div>
	)
}

export default InteractionCenter
