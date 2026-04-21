import { Search, X, List, Plus, RefreshCw, ShieldAlert, HelpCircle, SendHorizonal, AlertTriangle } from "lucide-react"
import { useMemo, useState } from "react"
import logoSvg from "../assets/logo.svg?raw"

import type { CostrictCloudBootstrap, CostrictCloudEventStatus } from "@roo/costrict-cloud"

import { ToolUseBlock, ToolUseBlockHeader } from "../components/common/ToolUseBlock"
import { Button } from "../components/ui/button"
import { Input } from "../components/ui/input"
import { Textarea } from "../components/ui/textarea"
import { useEscapeKey } from "../hooks/useEscapeKey"
import { cn } from "../lib/utils"
import { CostrictCloudMessageList } from "./CostrictCloudMessageList"
import type { CloudModelOption, CloudProviderOption } from "./CloudApp"
import { CloudAssistantComposerShell } from "./assistant-ui/CloudAssistantComposerShell"
import { InteractionCenter } from "./assistant-ui/InteractionCenter"
import type { CostrictCloudInteractionItem, CostrictCloudMessageItem } from "./messageAdapter"

type ConversationRecord = {
	id?: string
	title?: string
	status?: string
	createdAt?: string
	updatedAt?: string
	[key: string]: unknown
}

type ConversationSummary = {
	label: string
	tone: "running" | "waiting" | "idle" | "error"
	detail: string
}

type CloudAgentOption = {
	id: string
	label: string
	description?: string
	available?: boolean
}

type CloudProductionViewProps = {
	bootstrap: CostrictCloudBootstrap["payload"] | null
	agents: CloudAgentOption[]
	providers: CloudProviderOption[]
	models: CloudModelOption[]
	selectedAgentId: string
	selectedProviderId: string
	selectedModelId: string
	conversations: ConversationRecord[]
	selectedConversationId: string
	selectedConversation?: ConversationRecord
	conversationSummaries: Map<string, ConversationSummary>
	selectedConversationIsActive: boolean
	messages: CostrictCloudMessageItem[]
	prompt: string
	error: string
	loadingMessages: boolean
	loadingPrompt: boolean
	loadingAbort: boolean
	loadingAgents: boolean
	loadingModels: boolean
	eventStatus: CostrictCloudEventStatus["status"]
	lastEventName: string
	visiblePermissions: CostrictCloudInteractionItem[]
	visibleQuestions: CostrictCloudInteractionItem[]
	questionAnswers: Record<string, string>
	interactionSubmittingId: string
	onSelectConversation: (id: string) => void
	onSelectAgent: (id: string) => void
	onSelectModel: (id: string) => void
	onCreateConversation: () => void
	onLoadAgents: () => void
	onLoadModels: () => void
	onLoadConversations: () => void
	onLoadMessages: () => void
	onLoadInteractions: () => void
	onPromptChange: (value: string) => void
	onSubmitPrompt: () => void
	onAbortPrompt: () => void
	onQuestionAnswerChange: (interactionId: string, value: string) => void
	onSubmitPermission: (interaction: CostrictCloudInteractionItem, optionId: string) => void
	onSubmitQuestionReply: (interaction: CostrictCloudInteractionItem) => void
	onRejectQuestion: (interaction: CostrictCloudInteractionItem) => void
}

export default function CloudProductionView({
	bootstrap,
	agents,
	models,
	selectedAgentId,
	selectedModelId,
	conversations,
	selectedConversationId,
	conversationSummaries,
	selectedConversationIsActive,
	messages,
	prompt,
	error,
	loadingMessages,
	loadingPrompt,
	loadingAbort,
	loadingAgents,
	loadingModels,
	eventStatus,
	visiblePermissions,
	visibleQuestions,
	questionAnswers,
	interactionSubmittingId,
	onSelectConversation,
	onSelectAgent,
	onSelectModel,
	onCreateConversation,
	onLoadAgents,
	onLoadModels,
	onLoadConversations,
	onLoadMessages,
	onLoadInteractions,
	onPromptChange,
	onSubmitPrompt,
	onAbortPrompt,
	onQuestionAnswerChange,
	onSubmitPermission,
	onSubmitQuestionReply,
	onRejectQuestion,
}: CloudProductionViewProps) {
	const ready = !!bootstrap?.authenticated && !!bootstrap?.serverUrl && !!bootstrap?.healthy
	const [showConversationDrawer, setShowConversationDrawer] = useState(false)
	const [conversationQuery, setConversationQuery] = useState("")
	const [modelPickerOpen, setModelPickerOpen] = useState(false)
	const [modelQuery, setModelQuery] = useState("")

	useEscapeKey(showConversationDrawer, () => setShowConversationDrawer(false))

	const filteredConversations = useMemo(() => {
		const keyword = conversationQuery.trim().toLowerCase()
		if (!keyword) {
			return conversations
		}
		return conversations.filter((conversation) => {
			const id = String(conversation.id ?? "").toLowerCase()
			const title = String(conversation.title ?? "").toLowerCase()
			const status = String(conversation.status ?? "").toLowerCase()
			return id.includes(keyword) || title.includes(keyword) || status.includes(keyword)
		})
	}, [conversationQuery, conversations])

	const groupedModels = useMemo(() => {
		const keyword = modelQuery.trim().toLowerCase()
		const filteredModels = keyword
			? models.filter((model) => {
				const searchableText = [
					model.label,
					model.id,
					model.providerLabel,
					model.provider,
					model.family,
					model.description,
					...(model.capabilities ?? []),
				]
					.filter(Boolean)
					.join(" ")
					.toLowerCase()
				return searchableText.includes(keyword)
			})
			: models
		const groups = new Map<string, typeof models>()
		for (const model of filteredModels) {
			const groupKey = model.providerLabel || model.provider || "Other"
			const existing = groups.get(groupKey) ?? []
			existing.push(model)
			groups.set(groupKey, existing)
		}
		return Array.from(groups.entries()).map(([group, items]) => ({
			group,
			items,
		}))
	}, [modelQuery, models])

	const selectedModel = models.find((model) => model.id === selectedModelId)
	const selectedConversationSummary = selectedConversationId ? conversationSummaries.get(selectedConversationId) : undefined
	const showAbort = selectedConversationIsActive || loadingPrompt
	const sendDisabled = !selectedConversationId || showAbort || !prompt.trim()
	const abortDisabled = !selectedConversationId || loadingAbort
	const activityLabel = loadingAbort ? "Stopping…" : showAbort ? "Running…" : "Ctrl/Cmd + Enter"

	return (
		<div className="relative flex h-full min-h-0 overflow-hidden bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.06),transparent_28%),var(--vscode-editor-background)] text-vscode-editor-foreground">
			<div className="flex min-h-0 min-w-0 flex-1 flex-col">
				<div className="flex min-h-0 min-w-0 flex-1">
					<section className="flex min-h-0 min-w-0 flex-1 flex-col">
						<div className="border-b border-vscode-panel-border/25 bg-vscode-editor-background/16 px-5 py-2 backdrop-blur-sm">
							<div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3">
								<div className="flex min-w-0 items-center gap-2">
									<Button
										variant="ghost"
										size="icon"
										className="rounded-full border border-vscode-panel-border/50 bg-vscode-sideBar-background/16"
										onClick={() => setShowConversationDrawer(true)}
										title="打开会话抽屉">
										<List className="size-4" />
									</Button>
									<div className="items-center gap-1.5 sm:flex">
										{/* {selectedConversationId ? <RestoreStateBadge active={selectedConversationIsActive} /> : null} */}
										{/* <StatusPill label="事件流" ok={eventStatus === "connected"} detail={eventStatus || "connecting"} /> */}
										{selectedConversationSummary ? <ConversationTone tone={selectedConversationSummary.tone} label={selectedConversationSummary.label} /> : null}
									</div>
								</div>
								<div className="flex flex-wrap items-center justify-end gap-2">
									<Button variant="ghost" size="sm" className="rounded-full" onClick={onLoadMessages} disabled={!selectedConversationId || loadingMessages}>
										<RefreshCw className={cn("size-4", loadingMessages && "animate-spin")} />
										刷新消息(隐藏 test 信息)
									</Button>
									<Button variant="outline" size="sm" className="rounded-full border-vscode-panel-border/50 bg-transparent" onClick={onCreateConversation}>
										<Plus className="size-4" />
										{/* 新建会话 */}
									</Button>
								</div>
							</div>
						</div>

						<div className="min-h-0 flex-1 pl-3 pr-0 py-0">
							<div className="mx-auto flex h-full w-full max-w-5xl flex-col gap-3">
								{error ? (
									<div className="rounded-[18px] border border-vscode-errorForeground/30 bg-[linear-gradient(180deg,rgba(127,29,29,0.16),rgba(127,29,29,0.06))] px-4 py-3 text-sm text-vscode-errorForeground shadow-[0_8px_24px_rgba(0,0,0,0.10)]">
										<div className="font-medium">Cloud 请求出现异常</div>
										<div className="mt-1 opacity-90">{error}</div>
									</div>
								) : null}

								{!ready ? (
									<EmptyState title="Cloud 尚未就绪" description="请先确认认证、server 地址和健康检查均已通过。" />
								) : !selectedConversationId ? (
									<EmptyState title="请选择会话" description="先新建一个会话，或从左上角会话抽屉切换历史会话。" />
								) : messages.length === 0 ? (
									<EmptyState title="暂无消息" description="当前会话还没有消息，可以发送一条 prompt，或手动读取 Messages。" />
								) : (
									<div className="min-h-0 flex-1 px-0 py-0">
										<CostrictCloudMessageList messages={messages} />
									</div>
								)}
								{(visiblePermissions.length > 0 || visibleQuestions.length > 0) && (
									<InteractionCenter
										permissions={visiblePermissions}
										questions={visibleQuestions}
										interactionSubmittingId={interactionSubmittingId}
										onRefresh={onLoadInteractions}
										refreshing={interactionSubmittingId.length > 0}
										renderPermission={(interaction) => (
											<CloudPermissionCard
												interaction={interaction}
												disabled={interactionSubmittingId === interaction.id}
												onSelect={(optionId) => onSubmitPermission(interaction, optionId)}
											/>
										)}
										renderQuestion={(interaction) => (
											<CloudQuestionCard
												interaction={interaction}
												value={questionAnswers[interaction.id] ?? ""}
												disabled={interactionSubmittingId === interaction.id}
												onChange={(value) => onQuestionAnswerChange(interaction.id, value)}
												onReply={() => onSubmitQuestionReply(interaction)}
												onReject={() => onRejectQuestion(interaction)}
											/>
										)}
									/>
								)}
							</div>
						</div>

						<div className="shrink-0 border-t border-vscode-panel-border/35 bg-vscode-editor-background/45 px-1 py-0.5 backdrop-blur-sm">
							<div className="mx-auto w-full max-w-5xl">
								<CloudAssistantComposerShell
									prompt={prompt}
									onPromptChange={onPromptChange}
									onSubmitPrompt={onSubmitPrompt}
									onAbortPrompt={onAbortPrompt}
									sendDisabled={sendDisabled}
									abortDisabled={abortDisabled}
									showAbort={showAbort}
									activityLabel={activityLabel}
									selectedAgentId={selectedAgentId}
									agentOptions={agents.map((agent) => ({ value: agent.id, label: agent.label }))}
									onSelectAgent={onSelectAgent}
									onRefreshAgents={onLoadAgents}
									loadingAgents={loadingAgents}
									selectedModelId={selectedModelId}
									selectedModel={selectedModel}
									modelGroups={groupedModels}
									modelQuery={modelQuery}
									modelPickerOpen={modelPickerOpen}
									onModelQueryChange={setModelQuery}
									onModelPickerOpenChange={setModelPickerOpen}
									onSelectModel={(nextValue) => {
										onSelectModel(nextValue)
										setModelPickerOpen(false)
									}}
									onRefreshModels={onLoadModels}
									loadingModels={loadingModels}
								/>
							</div>
						</div>
					</section>
				</div>
			</div>

			{showConversationDrawer ? (
				<>
					<button type="button" aria-label="关闭会话抽屉" className="absolute inset-0 z-30 bg-[color-mix(in_srgb,var(--vscode-editor-background)_42%,transparent)] backdrop-blur-[1px]" onClick={() => setShowConversationDrawer(false)} />
					<aside className="absolute inset-y-0 left-0 z-40 flex w-[360px] max-w-[90vw] flex-col border-r border-vscode-panel-border/80 bg-vscode-sideBar-background/96 text-vscode-sideBar-foreground shadow-[0_20px_48px_rgba(0,0,0,0.16)] backdrop-blur-xl">
						<div className="border-b border-vscode-panel-border/70 px-4 py-4">
							<div className="flex items-start justify-between gap-3">
								<div>
									{/* <div className="text-[11px] uppercase tracking-[0.18em] text-vscode-descriptionForeground">会话历史</div> */}
									<div className="mt-1 text-base font-semibold text-vscode-sideBar-foreground">历史会话</div>
									<div className="mt-1 text-xs text-vscode-descriptionForeground">搜索、恢复会话上下文</div>
								</div>
								{/* <div className="flex items-center gap-1">
									<Button variant="outline" size="icon" className="rounded-full" onClick={onCreateConversation} title="新建会话"><Plus className="size-4" /></Button>
									<Button variant="ghost" size="icon" className="rounded-full" onClick={() => setShowConversationDrawer(false)} title="关闭抽屉"><X className="size-4" /></Button>
								</div> */}
							</div>
						</div>

						<div className="border-b border-vscode-panel-border/70 px-4 py-3">
							<div className="relative">
								<Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-vscode-descriptionForeground" />
								<Input value={conversationQuery} onChange={(event) => setConversationQuery(event.target.value)} placeholder="搜索标题、ID、状态" className="rounded-xl border-vscode-panel-border/70 bg-vscode-input-background py-2 pl-9 pr-9 text-sm text-vscode-input-foreground" />
								{conversationQuery ? <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-vscode-descriptionForeground hover:text-vscode-editor-foreground" onClick={() => setConversationQuery("")} title="清空搜索"><X className="size-4" /></button> : null}
							</div>
							<div className="mt-3 flex items-center justify-between gap-2">
								<Button variant="ghost" size="sm" onClick={onLoadConversations} className="rounded-full justify-start"><RefreshCw className="size-4" />刷新列表</Button>
								<div className="rounded-full border border-vscode-panel-border/70 bg-vscode-editor-background/45 px-2.5 py-1 text-[11px] text-vscode-descriptionForeground">共 {filteredConversations.length} 条</div>
							</div>
						</div>

						<div className="scrollbar-cloud min-h-0 flex-1 overflow-y-auto px-4 py-4">
							<div className="space-y-2.5">
								{filteredConversations.length === 0 ? (
									<div className="rounded-2xl border border-dashed border-vscode-panel-border/80 bg-vscode-editor-background/35 p-5 text-sm text-vscode-descriptionForeground">{conversationQuery ? "没有匹配的会话" : "暂无会话"}</div>
								) : (
									filteredConversations.map((conversation) => {
										const id = String(conversation.id ?? "")
										const summary = conversationSummaries.get(id)
										const updatedLabel = formatRelativeDateTime(conversation.updatedAt)
										const createdLabel = formatRelativeDateTime(conversation.createdAt)
										return (
											<button
												key={id}
												type="button"
												onClick={() => {
													onSelectConversation(id)
													setShowConversationDrawer(false)
												}}
												className={cn(
													"w-full rounded-2xl border px-3.5 py-3 text-left transition-all",
													id === selectedConversationId
														? "border-vscode-focusBorder/55 bg-vscode-list-activeSelectionBackground/65 shadow-[0_10px_24px_rgba(0,0,0,0.10)]"
														: "border-vscode-panel-border/75 bg-vscode-editor-background/58 hover:border-vscode-panel-border hover:bg-vscode-list-hoverBackground/45",
												)}>
												<div className="flex items-start justify-between gap-3">
													<div className="min-w-0 flex-1">
														<div className="truncate text-sm font-medium text-vscode-sideBar-foreground">{conversation.title || id}</div>
														<div className="mt-1 line-clamp-2 text-xs text-vscode-descriptionForeground">{summary?.detail || conversation.status || "空闲"}</div>
														<div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-vscode-descriptionForeground">
															<span className="rounded-full border border-vscode-panel-border/70 bg-vscode-editor-background/42 px-2 py-0.5">{summary?.tone === "running" ? "实时交互中" : "可恢复上下文"}</span>
															{updatedLabel ? <span className="rounded-full border border-vscode-panel-border/70 bg-vscode-editor-background/42 px-2 py-0.5">最近活动 {updatedLabel}</span> : null}
															{createdLabel ? <span className="rounded-full border border-vscode-panel-border/70 bg-vscode-editor-background/42 px-2 py-0.5">创建于 {createdLabel}</span> : null}
														</div>
													</div>
													<ConversationTone tone={summary?.tone || "idle"} label={summary?.label || "idle"} />
												</div>
											</button>
										)
									})
								)}
							</div>
						</div>
					</aside>
				</>
			) : null}
		</div>
	)
}

function StatusPill({ label, ok, detail }: { label: string; ok: boolean; detail?: string }) {
	return (
		<div
			className={cn(
				"inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium",
				ok
					? "border-vscode-testing-iconPassed/35 bg-vscode-testing-iconPassed/10 text-vscode-testing-iconPassed"
					: "border-vscode-panel-border bg-vscode-sideBar-background/50 text-vscode-descriptionForeground",
			)}>
			{label}
			{detail ? <span className="ml-1 opacity-80">· {detail}</span> : null}
		</div>
	)
}




function RestoreStateBadge({ active }: { active: boolean }) {
	return (
		<span
			className={cn(
				"inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-medium",
				active
					? "border border-vscode-testing-iconPassed/40 bg-vscode-testing-iconPassed/10 text-vscode-testing-iconPassed"
					: "border border-vscode-panel-border bg-vscode-sideBar-background/60 text-vscode-descriptionForeground",
			)}>
			{active ? "进行中" : "已恢复"}
		</span>
	)
}

function formatRelativeDateTime(value?: string) {
	if (!value) {
		return ""
	}
	const timestamp = Date.parse(value)
	if (Number.isNaN(timestamp)) {
		return value
	}
	return new Intl.DateTimeFormat(undefined, {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	}).format(new Date(timestamp))
}

function ConversationTone({ tone, label }: { tone: ConversationSummary["tone"]; label: string }) {
	return <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide", tone === "running" && "bg-vscode-testing-iconPassed/15 text-vscode-testing-iconPassed", tone === "waiting" && "bg-vscode-testing-iconQueued/15 text-vscode-testing-iconQueued", tone === "error" && "bg-vscode-errorForeground/15 text-vscode-errorForeground", tone === "idle" && "bg-vscode-badge-background text-vscode-badge-foreground")}>{label}</span>
}

function EmptyState({ title, description }: { title: string; description: string }) {
	return (
		<div className="flex min-h-[260px] flex-col items-center justify-center rounded-[28px] border border-dashed border-vscode-panel-border/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.025),rgba(255,255,255,0.01))] px-6 py-10 text-center shadow-[0_16px_40px_rgba(0,0,0,0.12)]">
			<div className="flex size-14 items-center justify-center rounded-2xl border border-vscode-panel-border/70 bg-vscode-sideBar-background/30">
				<div
					className="size-10 [&>svg]:w-full [&>svg]:h-full"
					style={{ animation: "loadingLogoGlow 1.8s ease-in-out infinite" }}
					dangerouslySetInnerHTML={{ __html: logoSvg }}
							/>
				{/* <Bot className="size-7 text-vscode-descriptionForeground" /> */}
			</div>
			<div className="mt-5 text-base font-medium">{title}</div>
			<div className="mt-2 max-w-xl text-sm leading-6 text-vscode-descriptionForeground">{description}</div>
		</div>
	)
}

function CloudPermissionCard({ interaction, disabled, onSelect }: { interaction: CostrictCloudInteractionItem; disabled: boolean; onSelect: (optionId: string) => void }) {
	return (
		<ToolUseBlock className="rounded-[20px] border border-vscode-panel-border/75 bg-vscode-editor-background/55 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
			<ToolUseBlockHeader className="gap-2 text-sm"><ShieldAlert className="size-4 text-vscode-editorWarning-foreground" /><span>{interaction.title}</span></ToolUseBlockHeader>
			<p className="mb-3 whitespace-pre-wrap text-sm leading-6 text-vscode-descriptionForeground">{interaction.description}</p>
			<div className="flex flex-wrap gap-2">{interaction.options.map((option) => <Button key={option.id} variant={option.kind?.startsWith("reject") ? "outline" : undefined} size="sm" className="rounded-full" disabled={disabled} onClick={() => onSelect(option.id)}>{option.label}</Button>)}</div>
		</ToolUseBlock>
	)
}

function CloudQuestionCard({ interaction, value, disabled, onChange, onReply, onReject }: { interaction: CostrictCloudInteractionItem; value: string; disabled: boolean; onChange: (value: string) => void; onReply: () => void; onReject: () => void }) {
	return (
		<ToolUseBlock className="rounded-[20px] border border-vscode-panel-border/75 bg-vscode-editor-background/55 shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
			<ToolUseBlockHeader className="gap-2 text-sm"><HelpCircle className="size-4 text-vscode-testing-iconQueued" /><span>{interaction.title}</span></ToolUseBlockHeader>
			<p className="mb-3 whitespace-pre-wrap text-sm leading-6 text-vscode-descriptionForeground">{interaction.description}</p>
			<Textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder="输入你要回复给 agent 的内容" disabled={disabled} className="min-h-[92px] rounded-2xl border-vscode-panel-border/70 bg-vscode-editor-background/55" />
			<div className="mt-3 flex flex-wrap gap-2">
				<Button size="sm" className="rounded-full" disabled={disabled} onClick={onReply}><SendHorizonal className="size-4" />提交回复</Button>
				<Button variant="outline" size="sm" className="rounded-full" disabled={disabled} onClick={onReject}><AlertTriangle className="size-4" />拒绝</Button>
			</div>
		</ToolUseBlock>
	)
}
