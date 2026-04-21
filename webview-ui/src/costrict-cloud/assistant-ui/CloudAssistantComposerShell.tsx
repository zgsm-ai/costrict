import { Check, ChevronDown, Paperclip, RefreshCw, SendHorizonal, X } from "lucide-react"

import { Button } from "../../components/ui/button"
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "../../components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select"
import { Textarea } from "../../components/ui/textarea"
import { cn } from "../../lib/utils"
import type { CloudModelOption } from "../CloudApp"

type CloudAssistantComposerShellProps = {
	prompt: string
	onPromptChange: (value: string) => void
	onSubmitPrompt: () => void
	onAbortPrompt: () => void
	sendDisabled: boolean
	abortDisabled: boolean
	showAbort: boolean
	activityLabel: string
	selectedAgentId: string
	agentOptions: Array<{ value: string; label: string }>
	onSelectAgent: (value: string) => void
	onRefreshAgents: () => void
	loadingAgents: boolean
	selectedModelId: string
	selectedModel?: CloudModelOption
	modelGroups: Array<{ group: string; items: CloudModelOption[] }>
	modelQuery: string
	modelPickerOpen: boolean
	onModelQueryChange: (value: string) => void
	onModelPickerOpenChange: (open: boolean) => void
	onSelectModel: (value: string) => void
	onRefreshModels: () => void
	loadingModels: boolean
}

export function CloudAssistantComposerShell({
	prompt,
	onPromptChange,
	onSubmitPrompt,
	onAbortPrompt,
	sendDisabled,
	abortDisabled,
	showAbort,
	activityLabel,
	selectedAgentId,
	agentOptions,
	onSelectAgent,
	onRefreshAgents: _onRefreshAgents,
	loadingAgents,
	selectedModelId,
	selectedModel,
	modelGroups,
	modelQuery,
	modelPickerOpen,
	onModelQueryChange,
	onModelPickerOpenChange,
	onSelectModel,
	onRefreshModels,
	loadingModels,
}: CloudAssistantComposerShellProps) {
	return (
		<div
			className={cn(
				"rounded-[16px] p-px transition-all duration-300",
				showAbort
					? "cloud-composer-animated-border shadow-[0_0_0_1px_rgba(59,130,246,0.08),0_0_22px_rgba(59,130,246,0.10)]"
					: "bg-transparent",
			)}>
			<div className="min-w-0 rounded-[14px] border border-vscode-panel-border/40 bg-vscode-input-background/28 px-3 py-2 transition-colors shadow-[0_-2px_12px_rgba(0,0,0,0.08)] focus-within:border-vscode-focusBorder/65 focus-within:bg-vscode-input-background focus-within:shadow-[0_0_0_2px_rgba(59,130,246,0.08)]">
				<Textarea
					value={prompt}
					onChange={(event) => onPromptChange(event.target.value)}
					placeholder={`输入你想让云端助手处理的内容…\n发送：Ctrl/Cmd + Enter`}
					className="min-h-[52px] resize-none border-0 bg-transparent px-0 py-0 text-[14px] leading-6 shadow-none placeholder:text-vscode-descriptionForeground/75 focus-visible:border-0"
					onKeyDown={(event) => {
						if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && !sendDisabled) {
							event.preventDefault()
							onSubmitPrompt()
						}
					}}
				/>
				<div className="mt-1.5 flex flex-wrap items-center gap-1.5 border-t border-vscode-panel-border/20 pt-1.5">
					<button
						type="button"
						className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-vscode-panel-border/45 bg-vscode-sideBar-background/12 text-vscode-descriptionForeground transition-colors hover:bg-vscode-list-hoverBackground hover:text-vscode-editor-foreground"
						title="预留附件入口"
						disabled>
						<Paperclip className="size-3.5" />
					</button>
					<div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
						<Select value={selectedAgentId} onValueChange={onSelectAgent}>
							<SelectTrigger className="h-7 min-w-[40px] max-w-[100px] rounded-full border border-vscode-panel-border/45 bg-vscode-sideBar-background/12 px-3 text-xs text-vscode-editor-foreground shadow-none focus-visible:border-vscode-focusBorder">
								<SelectValue placeholder={loadingAgents ? "加载中…" : "Agent"} />
							</SelectTrigger>
							<SelectContent>
								{agentOptions.map((option) => (
									<SelectItem key={option.value} value={option.value}>
										{option.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<div className="flex min-w-0 items-center gap-1">
							<Popover open={modelPickerOpen} onOpenChange={onModelPickerOpenChange}>
								<PopoverTrigger asChild>
									<button
										type="button"
										className="inline-flex h-7 min-w-[40px] max-w-[100px] items-center justify-between gap-2 rounded-full border border-vscode-panel-border/45 bg-vscode-sideBar-background/12 px-3 text-xs text-vscode-editor-foreground transition-colors hover:bg-vscode-list-hoverBackground">
										<span className="truncate text-left">
											{selectedModel?.label || (loadingModels ? "加载中…" : "选择模型")}
										</span>
										<div className="flex items-center gap-1 text-vscode-descriptionForeground">
											<ChevronDown className="size-3.5" />
										</div>
									</button>
								</PopoverTrigger>
								<PopoverContent
									align="start"
									className="w-[330px] max-w-[calc(100vw-2rem)] border-vscode-panel-border bg-vscode-editor-background p-0">
									<Command shouldFilter={false} className="bg-transparent">
										<div className="flex items-center border-b border-vscode-panel-border px-2 py-2">
											<CommandInput
												value={modelQuery}
												onValueChange={onModelQueryChange}
												placeholder="搜索模型"
												className="h-9 text-sm w-[232px]"
											/>
											<RefreshIconButton
												title="刷新模型"
												onClick={onRefreshModels}
												refreshing={loadingModels}
												className="ml-1"
											/>
										</div>
										<CommandList className="max-h-[320px] p-2">
											{modelGroups.length === 0 ? (
												<CommandEmpty>没有匹配的模型</CommandEmpty>
											) : (
												modelGroups.map((group) => (
													<CommandGroup key={group.group} heading={group.group}>
														{group.items.map((model) => (
															<CommandItem
																key={model.id}
																value={model.id}
																onSelect={() => onSelectModel(model.id)}
																className="items-start rounded-lg px-3 py-2.5">
																<Check
																	className={cn(
																		"mt-0.5 size-4 shrink-0",
																		selectedModelId === model.id
																			? "opacity-100"
																			: "opacity-0",
																	)}
																/>
																<div className="min-w-0 flex-1">
																	<div className="truncate text-sm font-medium">
																		{model.label}
																	</div>
																	<div className="mt-1 space-y-1 text-xs text-vscode-descriptionForeground">
																		{model.capabilities &&
																		model.capabilities.length > 0 ? (
																			<div>
																				支持：{model.capabilities.join("、")}
																			</div>
																		) : null}
																		{model.family ? (
																			<div>{model.family}</div>
																		) : null}
																		{model.contextWindow ? (
																			<div>
																				上下文上限{" "}
																				{model.contextWindow.toLocaleString()}
																			</div>
																		) : null}
																	</div>
																</div>
															</CommandItem>
														))}
													</CommandGroup>
												))
											)}
										</CommandList>
									</Command>
								</PopoverContent>
							</Popover>
						</div>
					</div>
					<Button
						variant="ghost"
						size="icon"
						className={cn(
							"ml-auto size-7 shrink-0 rounded-full border transition-colors",
							showAbort
								? "border-vscode-errorForeground/22 bg-vscode-inputValidation-errorBackground/8 text-vscode-errorForeground hover:bg-vscode-inputValidation-errorBackground/14"
								: "border-vscode-focusBorder/22 bg-vscode-focusBorder/8 text-vscode-focusBorder hover:bg-vscode-focusBorder/14",
						)}
						onClick={showAbort ? onAbortPrompt : onSubmitPrompt}
						disabled={showAbort ? abortDisabled : sendDisabled}
						title={showAbort ? "停止生成" : "发送"}>
						{showAbort ? <X className="size-3.5" /> : <SendHorizonal className="size-3.5" />}
					</Button>
					<div className="hidden items-center gap-2 text-[11px] text-vscode-descriptionForeground md:flex">
						<span className="inline-flex items-center gap-1">
							<span
								className={cn(
									"inline-flex size-2 rounded-full",
									showAbort ? "bg-vscode-testing-iconQueued" : "bg-vscode-focusBorder/80",
								)}
							/>
							<span>{activityLabel}</span>
						</span>
						{/* <span>Ctrl/Cmd + Enter</span> */}
					</div>
				</div>
			</div>
		</div>
	)
}

type RefreshIconButtonProps = {
	title: string
	onClick: () => void
	refreshing: boolean
	className?: string
}

function RefreshIconButton({ title, onClick, refreshing, className }: RefreshIconButtonProps) {
	return (
		<Button
			variant="ghost"
			size="icon"
			className={cn(
				"size-7 rounded-full border border-vscode-panel-border/50 bg-vscode-editor-background/55 text-vscode-descriptionForeground hover:bg-vscode-list-hoverBackground",
				className,
			)}
			onClick={onClick}
			disabled={refreshing}
			title={title}>
			<RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
		</Button>
	)
}

export default CloudAssistantComposerShell
