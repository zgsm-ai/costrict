import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import {
	Activity,
	AlertTriangle,
	Bot,
	HelpCircle,
	Loader2,
	MessageSquareText,
	RefreshCw,
	SendHorizonal,
	ServerCrash,
	ShieldAlert,
} from "lucide-react"

import type { CostrictCloudBridgeResponse, CostrictCloudBootstrap, CostrictCloudEventStatus } from "@roo/costrict-cloud"

import { Button } from "../components/ui/button"
import { cn } from "../lib/utils"
import { CostrictCloudMessageList } from "./CostrictCloudMessageList"
import CloudProductionView from "./CloudProductionView"
import {
	adaptInteractionsResponse,
	buildPromptRequestBody,
	// extractModelEntries,
	normalizeAgentsResponse,
	normalizeModelsResponse,
	type CloudAgentOption,
	type CloudModelOption,
	type CloudProviderOption,
} from "./cloudAppAdapters"
import {
	adaptEventMessageSummary,
	buildConversationSummary,
	buildEventCacheLabel,
	type ConversationEventCache,
	type ConversationRecord,
	type ConversationSummary,
} from "./cloudConversationSummary"
import { adaptCsCloudInteraction } from "./cloudInteractionAdapter"
export type { CloudAgentOption, CloudModelOption, CloudProviderOption } from "./cloudAppAdapters"
import {
	isCostrictCloudBootstrapMessage,
	isCostrictCloudEventMessage,
	isCostrictCloudEventStatusMessage,
	isCostrictCloudResponseMessage,
	postCostrictCloudMessage,
} from "./bridge"
import {
	adaptCsCloudMessages,
	mergeCsCloudEventIntoMessages,
	type CostrictCloudInteractionItem,
	type CostrictCloudMessageItem,
} from "./messageAdapter"

type PendingRequestTarget =
	| "agents"
	| "models"
	| "conversations"
	| "createConversation"
	| "messages"
	| "prompt"
	| "abort"
	| "permissions"
	| "questions"
	| "interactionReply"

type CloudAppProps = {
	debugMode?: boolean
}

const CloudApp = ({ debugMode = false }: CloudAppProps) => {
	const [bootstrap, setBootstrap] = useState<CostrictCloudBootstrap["payload"] | null>(null)
	const [agents, setAgents] = useState<CloudAgentOption[]>([])
	const [models, setModels] = useState<CloudModelOption[]>([])
	const [selectedAgentId, setSelectedAgentId] = useState<string>("")
	const [selectedProviderId, setSelectedProviderId] = useState<string>("costrict")
	const [selectedModelId, setSelectedModelId] = useState<string>("Auto")
	const [conversationModelSelections, setConversationModelSelections] = useState<Record<string, string>>({})
	const [conversations, setConversations] = useState<ConversationRecord[]>([])
	const [selectedConversationId, setSelectedConversationId] = useState<string>("")
	const [messages, setMessages] = useState<CostrictCloudMessageItem[]>([])
	const [rawMessages, setRawMessages] = useState<unknown>(null)
	const [messagesByConversationId, setMessagesByConversationId] = useState<
		Record<string, CostrictCloudMessageItem[]>
	>({})
	const [rawMessagesByConversationId, setRawMessagesByConversationId] = useState<Record<string, unknown>>({})
	const [conversationEventCache, setConversationEventCache] = useState<Record<string, ConversationEventCache>>({})
	const [abortStateOverrides, setAbortStateOverrides] = useState<Record<string, "force-idle">>({})
	const [permissions, setPermissions] = useState<CostrictCloudInteractionItem[]>([])
	const [questions, setQuestions] = useState<CostrictCloudInteractionItem[]>([])
	const [questionAnswers, setQuestionAnswers] = useState<Record<string, string>>({})
	const [interactionSubmittingId, setInteractionSubmittingId] = useState<string>("")
	const [eventStatus, setEventStatus] = useState<CostrictCloudEventStatus["status"]>("disconnected")
	const [eventStatusError, setEventStatusError] = useState<string>("")
	const [lastEventName, setLastEventName] = useState<string>("")
	const [prompt, setPrompt] = useState("")
	const [error, setError] = useState<string>("")
	const [loading, setLoading] = useState<Record<PendingRequestTarget, boolean>>({
		agents: false,
		models: false,
		conversations: false,
		createConversation: false,
		messages: false,
		prompt: false,
		abort: false,
		permissions: false,
		questions: false,
		interactionReply: false,
	})
	const pendingRequests = useRef(new Map<string, PendingRequestTarget>())
	const lastMessageRefreshRef = useRef(0)

	const ready = !!bootstrap?.authenticated && !!bootstrap?.serverUrl && !!bootstrap?.healthy
	const providers = useMemo<CloudProviderOption[]>(() => {
		const entries = new Map<string, CloudProviderOption>()
		for (const model of models) {
			if (!model.provider) {
				continue
			}
			if (!entries.has(model.provider)) {
				entries.set(model.provider, {
					id: model.provider,
					label: model.providerLabel || model.provider,
					description:
						model.providerLabel && model.providerLabel !== model.provider ? model.provider : undefined,
					available: true,
				})
			}
		}
		return Array.from(entries.values()).sort((a, b) => a.label.localeCompare(b.label))
	}, [models])
	const effectiveSelectedProviderId =
		models.find(
			(model) =>
				model.id ===
				((selectedConversationId ? conversationModelSelections[selectedConversationId] : "") ||
					selectedModelId),
		)?.provider ||
		selectedProviderId ||
		providers[0]?.id ||
		""
	const effectiveSelectedModelId =
		(selectedConversationId ? conversationModelSelections[selectedConversationId] : "") || selectedModelId
	// const effectiveSelectedModel = models.find((model) => model.id === effectiveSelectedModelId)
	const currentMessages = selectedConversationId
		? (messagesByConversationId[selectedConversationId] ?? messages)
		: messages
	const currentRawMessages = selectedConversationId
		? (rawMessagesByConversationId[selectedConversationId] ?? rawMessages)
		: rawMessages

	const emitDebugLog = useCallback((tag: string, payload: unknown) => {
		postCostrictCloudMessage({
			type: "costrict-cloud.debugLog",
			tag,
			payload,
		})
	}, [])

	const setLoadingFlag = useCallback((target: PendingRequestTarget, value: boolean) => {
		setLoading((current) => ({ ...current, [target]: value }))
	}, [])

	const sendRequest = useCallback(
		(
			target: PendingRequestTarget,
			path: string,
			init?: { method?: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown },
		) => {
			const requestId = `${target}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
			pendingRequests.current.set(requestId, target)
			setLoadingFlag(target, true)
			emitDebugLog("cloudapp.sendRequest", {
				target,
				requestId,
				path,
				method: init?.method ?? "GET",
				body: init?.body,
			})
			postCostrictCloudMessage({
				type: "costrict-cloud.request",
				requestId,
				path,
				method: init?.method ?? "GET",
				body: init?.body,
			})
		},
		[emitDebugLog, setLoadingFlag],
	)

	const refreshBootstrap = useCallback(() => {
		setError("")
		postCostrictCloudMessage({ type: "costrict-cloud.refresh" })
	}, [])

	const loadAgents = useCallback(() => {
		setError("")
		sendRequest("agents", "/agents/session-modes")
	}, [sendRequest])

	const loadModels = useCallback(() => {
		setError("")
		sendRequest("models", "/agents/models")
	}, [sendRequest])

	const loadConversations = useCallback(() => {
		setError("")
		sendRequest("conversations", "/conversations")
	}, [sendRequest])

	const loadMessages = useCallback(() => {
		if (!selectedConversationId) {
			setError("请先选择一个 Conversation")
			return
		}
		setError("")
		sendRequest("messages", `/conversations/${selectedConversationId}/messages`)
	}, [selectedConversationId, sendRequest])

	const loadInteractions = useCallback(() => {
		setError("")
		sendRequest("permissions", "/permissions")
		sendRequest("questions", "/questions")
	}, [sendRequest])

	const requestMessagesRefreshFromEvent = useCallback(() => {
		if (!selectedConversationId) {
			return
		}
		const now = Date.now()
		if (now - lastMessageRefreshRef.current < 800) {
			return
		}
		lastMessageRefreshRef.current = now
		sendRequest("messages", `/conversations/${selectedConversationId}/messages`)
	}, [selectedConversationId, sendRequest])

	const createConversation = useCallback(() => {
		setError("")
		const body: Record<string, unknown> = {}
		if (selectedAgentId) {
			body.agentId = selectedAgentId
		}
		if (effectiveSelectedModelId) {
			body.modelID = effectiveSelectedModelId
		}
		if (effectiveSelectedProviderId) {
			body.providerID = effectiveSelectedProviderId
		}
		emitDebugLog("cloudapp.createConversation", {
			selectedAgentId,
			selectedProviderId,
			selectedModelId,
			effectiveSelectedProviderId,
			effectiveSelectedModelId,
			selectedConversationId,
			conversationModelSelections,
			body,
		})
		sendRequest("createConversation", "/conversations", { method: "POST", body })
	}, [
		conversationModelSelections,
		effectiveSelectedModelId,
		effectiveSelectedProviderId,
		emitDebugLog,
		selectedAgentId,
		selectedConversationId,
		selectedModelId,
		selectedProviderId,
		sendRequest,
	])

	const submitPrompt = useCallback(() => {
		if (!selectedConversationId) {
			setError("请先创建或选择一个 Conversation")
			return
		}
		if (!prompt.trim()) {
			setError("请输入 prompt")
			return
		}
		setError("")
		setAbortStateOverrides((current) => {
			if (!current[selectedConversationId]) {
				return current
			}
			const next = { ...current }
			delete next[selectedConversationId]
			return next
		})
		const body = buildPromptRequestBody({
			prompt: prompt.trim(),
			modelId: effectiveSelectedModelId,
			providerId: effectiveSelectedProviderId,
		})
		emitDebugLog("cloudapp.submitPrompt", {
			selectedConversationId,
			selectedProviderId,
			selectedModelId,
			effectiveSelectedProviderId,
			effectiveSelectedModelId,
			conversationModelSelection: selectedConversationId
				? conversationModelSelections[selectedConversationId]
				: undefined,
			prompt: prompt.trim(),
			body,
		})
		sendRequest("prompt", `/conversations/${selectedConversationId}/prompt`, {
			method: "POST",
			body,
		})
	}, [
		conversationModelSelections,
		effectiveSelectedModelId,
		effectiveSelectedProviderId,
		emitDebugLog,
		prompt,
		selectedConversationId,
		selectedModelId,
		selectedProviderId,
		sendRequest,
	])

	const submitAbort = useCallback(() => {
		if (!selectedConversationId) {
			setError("请先选择一个 Conversation")
			return
		}
		setError("")
		setConversationEventCache((current) => ({
			...current,
			[selectedConversationId]: {
				kind: "command",
				status: "running",
				label: "正在停止当前会话…",
				timestamp: Date.now(),
			},
		}))
		sendRequest("abort", `/conversations/${selectedConversationId}/abort`, {
			method: "POST",
		})
	}, [selectedConversationId, sendRequest])

	const submitPermissionResponse = useCallback(
		(interaction: CostrictCloudInteractionItem, optionId: string) => {
			setError("")
			setInteractionSubmittingId(interaction.id)
			sendRequest("interactionReply", `/permissions/${interaction.id}/reply`, {
				method: "POST",
				body: { decision: optionId },
			})
		},
		[sendRequest],
	)

	const submitQuestionReply = useCallback(
		(interaction: CostrictCloudInteractionItem, approved: boolean) => {
			const answer = questionAnswers[interaction.id]?.trim() ?? ""
			if (approved && !answer) {
				setError("请先输入回复内容")
				return
			}
			setError("")
			setInteractionSubmittingId(interaction.id)
			sendRequest(
				"interactionReply",
				approved ? `/questions/${interaction.id}/reply` : `/questions/${interaction.id}/reject`,
				{
					method: "POST",
					body: approved ? { reply: answer } : {},
				},
			)
		},
		[questionAnswers, sendRequest],
	)

	useEffect(() => {
		refreshBootstrap()
	}, [refreshBootstrap])

	useEffect(() => {
		if (ready) {
			postCostrictCloudMessage({ type: "costrict-cloud.events.start" })
			loadInteractions()
			return () => postCostrictCloudMessage({ type: "costrict-cloud.events.stop" })
		}
		postCostrictCloudMessage({ type: "costrict-cloud.events.stop" })
		setEventStatus("disconnected")
		return undefined
	}, [loadInteractions, ready])

	useEffect(() => {
		const onMessage = (event: MessageEvent) => {
			if (isCostrictCloudBootstrapMessage(event.data)) {
				setBootstrap(event.data.payload)
				if (event.data.payload.authenticated && event.data.payload.serverUrl && event.data.payload.healthy) {
					loadAgents()
					loadModels()
					loadConversations()
					loadInteractions()
				}
				return
			}
			if (isCostrictCloudEventStatusMessage(event.data)) {
				setEventStatus(event.data.status)
				setEventStatusError(event.data.error ?? "")
				if (event.data.status === "error" && event.data.error) {
					setError(event.data.error)
				}
				return
			}
			if (isCostrictCloudEventMessage(event.data)) {
				setLastEventName(event.data.event)
				const interaction = adaptCsCloudInteraction(event.data)
				if (interaction) {
					if (interaction.kind === "permission") {
						setPermissions((current) => upsertInteraction(current, interaction, selectedConversationId))
					} else {
						setQuestions((current) => upsertInteraction(current, interaction, selectedConversationId))
					}
					return
				}
				const eventMessage = adaptEventMessageSummary(event.data)
				if (eventMessage?.conversationId) {
					if (["streaming", "running", "pending"].includes(eventMessage.status ?? "")) {
						setAbortStateOverrides((current) => {
							if (!current[eventMessage.conversationId as string]) {
								return current
							}
							const next = { ...current }
							delete next[eventMessage.conversationId as string]
							return next
						})
					}
					setConversationEventCache((current) => ({
						...current,
						[eventMessage.conversationId as string]: {
							kind: eventMessage.kind,
							status: eventMessage.status,
							label: buildEventCacheLabel(eventMessage),
							timestamp: Date.now(),
						},
					}))
				}
				setMessages((current) => {
					const result = mergeCsCloudEventIntoMessages(current, event.data, selectedConversationId)
					if (!result.didMutate) {
						requestMessagesRefreshFromEvent()
						if (result.shouldRefetch) {
							loadInteractions()
						}
					}
					if (selectedConversationId && result.didMutate) {
						setMessagesByConversationId((cached) => ({
							...cached,
							[selectedConversationId]: result.messages,
						}))
					}
					return result.messages
				})
				return
			}
			if (!isCostrictCloudResponseMessage(event.data)) {
				return
			}
			const response = event.data as CostrictCloudBridgeResponse
			const target = pendingRequests.current.get(response.requestId)
			if (!target) {
				return
			}
			pendingRequests.current.delete(response.requestId)
			setLoadingFlag(target, false)
			if (target === "interactionReply") {
				setInteractionSubmittingId("")
			}
			if (!response.ok) {
				setError(response.error)
				return
			}
			setError("")
			switch (target) {
				case "agents": {
					const normalizedAgents = normalizeAgentsResponse(response.data)
					setAgents(normalizedAgents)
					setSelectedAgentId((current) => current || normalizedAgents[0]?.id || "")
					break
				}
				case "models": {
					const normalizedModels = normalizeModelsResponse(response.data)
					setModels(normalizedModels)
					setSelectedProviderId((current) => current || normalizedModels[0]?.provider || "")
					setSelectedModelId((current) => current || normalizedModels[0]?.id || "")
					break
				}
				case "conversations": {
					const payload = Array.isArray(response.data)
						? response.data
						: Array.isArray((response.data as { data?: unknown })?.data)
							? (((response.data as { data?: unknown }).data as unknown[]) ?? [])
							: []
					setConversations(payload as ConversationRecord[])
					if (!selectedConversationId && payload.length > 0) {
						const firstId = String((payload[0] as ConversationRecord).id ?? "")
						setSelectedConversationId(firstId)
					}
					break
				}
				case "createConversation": {
					const data = (response.data as { data?: ConversationRecord } | ConversationRecord) ?? {}
					const conversation = ((data as { data?: ConversationRecord }).data ?? data) as ConversationRecord
					const newId = String(conversation.id ?? "")
					if (newId) {
						setSelectedConversationId(newId)
						setConversations((current) => [
							conversation,
							...current.filter((item) => String(item.id ?? "") !== newId),
						])
					}
					break
				}
				case "messages":
				case "prompt": {
					const adaptedMessages = adaptCsCloudMessages(response.data)
					setRawMessages(response.data)
					setMessages(adaptedMessages)
					if (selectedConversationId) {
						setRawMessagesByConversationId((current) => ({
							...current,
							[selectedConversationId]: response.data,
						}))
						setMessagesByConversationId((current) => ({
							...current,
							[selectedConversationId]: adaptedMessages,
						}))
					}
					if (target === "prompt") {
						setPrompt("")
						loadMessages()
					}
					break
				}
				case "abort":
					if (selectedConversationId) {
						setAbortStateOverrides((current) => ({
							...current,
							[selectedConversationId]: "force-idle",
						}))
						setConversationEventCache((current) => {
							const next = { ...current }
							delete next[selectedConversationId]
							return next
						})
					}
					loadMessages()
					loadInteractions()
					break
				case "permissions":
					setPermissions(adaptInteractionsResponse(response.data, "permission", adaptCsCloudInteraction))
					break
				case "questions":
					setQuestions(adaptInteractionsResponse(response.data, "question", adaptCsCloudInteraction))
					break
				case "interactionReply":
					loadInteractions()
					requestMessagesRefreshFromEvent()
					break
				default:
					break
			}
		}
		window.addEventListener("message", onMessage)
		return () => window.removeEventListener("message", onMessage)
	}, [
		loadAgents,
		loadConversations,
		loadInteractions,
		loadMessages,
		loadModels,
		requestMessagesRefreshFromEvent,
		selectedConversationId,
		setLoadingFlag,
	])

	const selectedConversation = useMemo(
		() => conversations.find((item) => String(item.id ?? "") === selectedConversationId),
		[conversations, selectedConversationId],
	)

	const visiblePermissions = useMemo(
		() =>
			permissions.filter(
				(item) =>
					!selectedConversationId || !item.conversationId || item.conversationId === selectedConversationId,
			),
		[permissions, selectedConversationId],
	)
	const visibleQuestions = useMemo(
		() =>
			questions.filter(
				(item) =>
					!selectedConversationId || !item.conversationId || item.conversationId === selectedConversationId,
			),
		[questions, selectedConversationId],
	)

	const conversationSummaries = useMemo(() => {
		const summaries = new Map<string, ConversationSummary>()
		for (const conversation of conversations) {
			const id = String(conversation.id ?? "")
			if (!id) {
				continue
			}
			summaries.set(
				id,
				buildConversationSummary({
					conversation,
					messages: messagesByConversationId[id] ?? (id === selectedConversationId ? messages : []),
					cachedEvent: conversationEventCache[id],
					permissions,
					questions,
					abortOverride: abortStateOverrides[id],
				}),
			)
		}
		return summaries
	}, [
		abortStateOverrides,
		conversations,
		conversationEventCache,
		messages,
		messagesByConversationId,
		permissions,
		questions,
		selectedConversationId,
	])

	const selectedConversationSummary = useMemo(
		() => (selectedConversationId ? conversationSummaries.get(selectedConversationId) : undefined),
		[conversationSummaries, selectedConversationId],
	)
	const selectedConversationIsActive =
		selectedConversationId && abortStateOverrides[selectedConversationId] === "force-idle"
			? false
			: selectedConversationSummary?.tone === "running"

	useEffect(() => {
		if (!selectedConversationId) {
			return
		}
		if (!ready) {
			return
		}
		setQuestionAnswers((current) => {
			if (Object.keys(current).length === 0) {
				return current
			}
			const next: Record<string, string> = {}
			for (const key of Object.keys(current)) {
				next[key] = current[key]
			}
			return next
		})
		if (!messagesByConversationId[selectedConversationId]) {
			loadMessages()
		}
		loadInteractions()
	}, [loadInteractions, loadMessages, messagesByConversationId, ready, selectedConversationId])

	useEffect(() => {
		if (!selectedConversationId) {
			return
		}
		const conversationModelId = conversationModelSelections[selectedConversationId]
		if (conversationModelId) {
			setSelectedModelId(conversationModelId)
			const nextModel = models.find((model) => model.id === conversationModelId)
			if (nextModel?.provider) {
				setSelectedProviderId(nextModel.provider)
			}
		}
	}, [conversationModelSelections, models, selectedConversationId])

	const handleSelectConversation = useCallback(
		(conversationId: string) => {
			setSelectedConversationId(conversationId)
			const rememberedModelId = conversationModelSelections[conversationId]
			if (rememberedModelId) {
				setSelectedModelId(rememberedModelId)
				const nextModel = models.find((model) => model.id === rememberedModelId)
				if (nextModel?.provider) {
					setSelectedProviderId(nextModel.provider)
				}
			}
			emitDebugLog("cloudapp.handleSelectConversation", {
				conversationId,
				rememberedModelId,
				selectedProviderId,
				selectedModelId,
			})
		},
		[conversationModelSelections, emitDebugLog, models, selectedModelId, selectedProviderId],
	)

	const handleSelectModel = useCallback(
		(modelId: string) => {
			const nextModel = models.find((model) => model.id === modelId)
			emitDebugLog("cloudapp.handleSelectModel", {
				modelId,
				providerId: nextModel?.provider,
				selectedConversationId,
				selectedModelIdBefore: selectedModelId,
				selectedProviderIdBefore: selectedProviderId,
			})
			setSelectedModelId(modelId)
			if (nextModel?.provider) {
				setSelectedProviderId(nextModel.provider)
			}
			if (!selectedConversationId) {
				return
			}
			setConversationModelSelections((current) => ({
				...current,
				[selectedConversationId]: modelId,
			}))
		},
		[emitDebugLog, models, selectedConversationId, selectedModelId, selectedProviderId],
	)

	useEffect(() => {
		if (!selectedConversationId || !effectiveSelectedModelId) {
			return
		}
		setConversationModelSelections((current) =>
			current[selectedConversationId] === effectiveSelectedModelId
				? current
				: {
						...current,
						[selectedConversationId]: effectiveSelectedModelId,
					},
		)
	}, [effectiveSelectedModelId, selectedConversationId])

	if (!debugMode) {
		return (
			<CloudProductionView
				bootstrap={bootstrap}
				agents={agents}
				providers={providers}
				models={models}
				selectedAgentId={selectedAgentId}
				selectedProviderId={effectiveSelectedProviderId}
				selectedModelId={effectiveSelectedModelId}
				conversations={conversations}
				selectedConversationId={selectedConversationId}
				selectedConversation={selectedConversation}
				conversationSummaries={conversationSummaries}
				selectedConversationIsActive={selectedConversationIsActive}
				messages={currentMessages}
				prompt={prompt}
				error={error}
				loadingMessages={loading.messages}
				loadingPrompt={loading.prompt}
				loadingAbort={loading.abort}
				loadingAgents={loading.agents}
				loadingModels={loading.models}
				eventStatus={eventStatus}
				lastEventName={lastEventName}
				visiblePermissions={visiblePermissions}
				visibleQuestions={visibleQuestions}
				questionAnswers={questionAnswers}
				interactionSubmittingId={interactionSubmittingId}
				onSelectConversation={handleSelectConversation}
				onSelectAgent={setSelectedAgentId}
				onSelectModel={handleSelectModel}
				onCreateConversation={createConversation}
				onLoadAgents={loadAgents}
				onLoadModels={loadModels}
				onLoadConversations={loadConversations}
				onLoadMessages={loadMessages}
				onLoadInteractions={loadInteractions}
				onPromptChange={setPrompt}
				onSubmitPrompt={submitPrompt}
				onAbortPrompt={submitAbort}
				onQuestionAnswerChange={(interactionId, value) =>
					setQuestionAnswers((current) => ({
						...current,
						[interactionId]: value,
					}))
				}
				onSubmitPermission={submitPermissionResponse}
				onSubmitQuestionReply={(interaction) => submitQuestionReply(interaction, true)}
				onRejectQuestion={(interaction) => submitQuestionReply(interaction, false)}
			/>
		)
	}

	return (
		<div className="min-h-screen bg-vscode-editor-background text-vscode-editor-foreground">
			<div className="mx-auto flex max-w-7xl flex-col gap-4 p-4">
				<header className="rounded-3xl border border-vscode-panel-border bg-vscode-sideBar-background/80 p-5 shadow-sm backdrop-blur">
					<div className="flex flex-wrap items-center justify-between gap-3">
						<div>
							<p className="text-xs uppercase tracking-[0.2em] text-vscode-descriptionForeground">
								costrict-cloud
							</p>
							<h1 className="mt-1 text-2xl font-semibold">CoStrict Cloud 模式</h1>
							<p className="mt-2 max-w-3xl text-sm text-vscode-descriptionForeground">
								该界面为独立 React CloudApp 入口，所有数据都通过 extension host 转发到本地 cs-cloud。
							</p>
						</div>
						<Button variant="outline" onClick={refreshBootstrap}>
							<RefreshCw className="size-4" />
							刷新状态
						</Button>
					</div>
					<div className="mt-4 grid gap-3 md:grid-cols-4">
						<StatusCard
							title="认证信息"
							ok={!!bootstrap?.authenticated}
							description="读取 ~/.costrict/share/auth.json"
						/>
						<StatusCard
							title="cs-cloud 地址"
							ok={!!bootstrap?.serverUrl}
							description={bootstrap?.serverUrl ?? "未检测到 server.url"}
						/>
						<StatusCard
							title="健康检查"
							ok={!!bootstrap?.healthy}
							description={bootstrap?.healthy ? "运行中" : "等待执行 cs-cloud start"}
						/>
						<EventStatusCard status={eventStatus} error={eventStatusError} lastEventName={lastEventName} />
					</div>
				</header>

				{error ? (
					<div className="flex items-start gap-3 rounded-2xl border border-vscode-errorForeground/30 bg-vscode-inputValidation-warningBackground/30 p-4 text-sm text-vscode-errorForeground">
						<ServerCrash className="mt-0.5 size-4 shrink-0" />
						<div>{error}</div>
					</div>
				) : null}

				{visiblePermissions.length > 0 || visibleQuestions.length > 0 ? (
					<section className="rounded-3xl border border-vscode-panel-border bg-vscode-sideBar-background/80 p-4 shadow-sm">
						<div className="flex items-center justify-between gap-2">
							<div>
								<h2 className="text-lg font-semibold">Pending Interactions</h2>
								<p className="text-xs text-vscode-descriptionForeground">
									在这里直接处理 permission / question，无需离开 Cloud 页面。
								</p>
							</div>
							<Button
								variant="outline"
								size="sm"
								onClick={loadInteractions}
								disabled={!ready || loading.permissions || loading.questions}>
								{loading.permissions || loading.questions ? (
									<Loader2 className="size-4 animate-spin" />
								) : (
									<RefreshCw className="size-4" />
								)}
								刷新交互
							</Button>
						</div>
						<div className="mt-4 grid gap-4 lg:grid-cols-2">
							<InteractionColumn
								title="Permissions"
								description="等待人工确认的权限请求"
								icon={<ShieldAlert className="size-4" />}
								emptyText="当前没有待处理 permission">
								{visiblePermissions.map((interaction) => (
									<PermissionInteractionCard
										key={interaction.id}
										interaction={interaction}
										disabled={
											interactionSubmittingId === interaction.id || loading.interactionReply
										}
										onSelect={(optionId) => submitPermissionResponse(interaction, optionId)}
									/>
								))}
							</InteractionColumn>
							<InteractionColumn
								title="Questions"
								description="需要用户填写回复内容的问题"
								icon={<HelpCircle className="size-4" />}
								emptyText="当前没有待处理 question">
								{visibleQuestions.map((interaction) => (
									<QuestionInteractionCard
										key={interaction.id}
										interaction={interaction}
										value={questionAnswers[interaction.id] ?? ""}
										disabled={
											interactionSubmittingId === interaction.id || loading.interactionReply
										}
										onChange={(value) =>
											setQuestionAnswers((current) => ({
												...current,
												[interaction.id]: value,
											}))
										}
										onReply={() => submitQuestionReply(interaction, true)}
										onReject={() => submitQuestionReply(interaction, false)}
									/>
								))}
							</InteractionColumn>
						</div>
					</section>
				) : null}

				<div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
					<section className="rounded-3xl border border-vscode-panel-border bg-vscode-sideBar-background/80 p-4 shadow-sm">
						<div className="flex items-center justify-between gap-2">
							<div>
								<h2 className="text-lg font-semibold">Conversations</h2>
								<p className="text-xs text-vscode-descriptionForeground">读取、创建并选择会话</p>
							</div>
							<Button
								variant="primary"
								size="sm"
								onClick={createConversation}
								disabled={!ready || loading.createConversation}>
								{loading.createConversation ? (
									<Loader2 className="size-4 animate-spin" />
								) : (
									<MessageSquareText className="size-4" />
								)}
								新建
							</Button>
						</div>
						<div className="mt-3 flex items-center gap-2">
							<Button
								variant="outline"
								size="sm"
								onClick={loadConversations}
								disabled={!ready || loading.conversations}>
								{loading.conversations ? (
									<Loader2 className="size-4 animate-spin" />
								) : (
									<RefreshCw className="size-4" />
								)}
								刷新列表
							</Button>
							<Button
								variant="outline"
								size="sm"
								onClick={loadAgents}
								disabled={!ready || loading.agents}>
								{loading.agents ? (
									<Loader2 className="size-4 animate-spin" />
								) : (
									<Bot className="size-4" />
								)}
								读取 Agents
							</Button>
						</div>
						<div className="mt-4 space-y-2">
							{conversations.length === 0 ? (
								<div className="rounded-2xl border border-dashed border-vscode-panel-border p-4 text-sm text-vscode-descriptionForeground">
									暂无会话，请先创建或等待 cs-cloud 返回数据。
								</div>
							) : (
								conversations.map((conversation) => {
									const id = String(conversation.id ?? "")
									const active = id === selectedConversationId
									const summary = conversationSummaries.get(id)
									return (
										<button
											key={id || Math.random().toString(36)}
											type="button"
											onClick={() => setSelectedConversationId(id)}
											className={cn(
												"w-full rounded-2xl border px-3 py-3 text-left transition-colors",
												active
													? "border-vscode-focusBorder bg-vscode-list-activeSelectionBackground text-vscode-list-activeSelectionForeground"
													: "border-vscode-panel-border bg-vscode-editor-background hover:bg-vscode-list-hoverBackground",
											)}>
											<div className="flex items-start justify-between gap-2">
												<div className="min-w-0">
													<div className="truncate text-sm font-medium">
														{conversation.title || id || "未命名会话"}
													</div>
													<div className="mt-1 text-xs opacity-75">
														{summary?.detail || conversation.status || "unknown"}
													</div>
												</div>
												{summary ? <ConversationStatusBadge summary={summary} /> : null}
											</div>
										</button>
									)
								})
							)}
						</div>
					</section>

					<section className="rounded-3xl border border-vscode-panel-border bg-vscode-sideBar-background/80 p-4 shadow-sm">
						<div className="flex flex-wrap items-start justify-between gap-3">
							<div>
								<h2 className="text-lg font-semibold">Conversation Workspace</h2>
								<p className="text-xs text-vscode-descriptionForeground">
									{selectedConversation
										? `当前会话：${selectedConversation.title || selectedConversation.id}`
										: "请选择或新建一个 Conversation"}
								</p>
							</div>
							<Button
								variant="outline"
								size="sm"
								onClick={loadMessages}
								disabled={!ready || !selectedConversationId || loading.messages}>
								{loading.messages ? (
									<Loader2 className="size-4 animate-spin" />
								) : (
									<RefreshCw className="size-4" />
								)}
								格式化 Messages
							</Button>
						</div>

						<div className="mt-4 rounded-2xl border border-vscode-panel-border bg-vscode-editor-background p-3">
							<label className="mb-2 block text-xs text-vscode-descriptionForeground">Prompt</label>
							<textarea
								value={prompt}
								onChange={(event) => setPrompt(event.target.value)}
								placeholder="输入要发送给 cs-cloud 的 prompt"
								className="min-h-[120px] w-full rounded-2xl border border-vscode-input-border bg-vscode-input-background px-4 py-3 text-sm outline-none focus:border-vscode-focusBorder"
							/>
							<div className="mt-3 flex justify-end">
								<Button variant="primary" onClick={submitPrompt} disabled={!ready || loading.prompt}>
									{loading.prompt ? (
										<Loader2 className="size-4 animate-spin" />
									) : (
										<SendHorizonal className="size-4" />
									)}
									发送 Prompt
								</Button>
							</div>
						</div>

						<div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,0.6fr)]">
							<div className="rounded-2xl border border-vscode-panel-border bg-vscode-editor-background p-3">
								<div className="mb-2 text-sm font-medium">Messages</div>
								<CostrictCloudMessageList messages={currentMessages} />
							</div>
							<div className="space-y-4">
								<DataPanel title="Agents 原始数据" value={agents} emptyText="尚未读取 agents" />
								<DataPanel
									title="Messages 原始响应"
									value={currentRawMessages}
									emptyText="尚未读取 messages"
								/>
							</div>
						</div>
					</section>
				</div>
			</div>
		</div>
	)
}

function ConversationStatusBadge({ summary }: { summary: ConversationSummary }) {
	return (
		<span
			className={cn(
				"inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide",
				summary.tone === "running" && "bg-vscode-button-background/15 text-vscode-button-foreground",
				summary.tone === "waiting" &&
					"bg-vscode-editorWarning-foreground/15 text-vscode-editorWarning-foreground",
				summary.tone === "idle" && "bg-vscode-testing-iconPassed/15 text-vscode-testing-iconPassed",
				summary.tone === "error" && "bg-vscode-errorForeground/15 text-vscode-errorForeground",
			)}>
			{summary.label}
		</span>
	)
}

function upsertInteraction(
	current: CostrictCloudInteractionItem[],
	item: CostrictCloudInteractionItem,
	selectedConversationId: string,
): CostrictCloudInteractionItem[] {
	if (selectedConversationId && item.conversationId && item.conversationId !== selectedConversationId) {
		return current
	}
	const index = current.findIndex((entry) => entry.id === item.id)
	if (index === -1) {
		return [item, ...current]
	}
	const next = [...current]
	next[index] = item
	return next
}

function StatusCard({ title, ok, description }: { title: string; ok: boolean; description: string }) {
	return (
		<div className="rounded-2xl border border-vscode-panel-border bg-vscode-editor-background p-4">
			<div className="flex items-center gap-2 text-sm font-medium">
				<span
					className={cn(
						"inline-block size-2 rounded-full",
						ok ? "bg-vscode-testing-iconPassed" : "bg-vscode-errorForeground",
					)}
				/>
				{title}
			</div>
			<p className="mt-2 text-xs text-vscode-descriptionForeground">{description}</p>
		</div>
	)
}

function EventStatusCard({
	status,
	error,
	lastEventName,
}: {
	status: CostrictCloudEventStatus["status"]
	error: string
	lastEventName: string
}) {
	const statusLabel = {
		connecting: "连接中",
		connected: "已连接",
		disconnected: "已断开",
		error: "错误",
	}[status]
	const ok = status === "connected"
	return (
		<div className="rounded-2xl border border-vscode-panel-border bg-vscode-editor-background p-4">
			<div className="flex items-center gap-2 text-sm font-medium">
				<Activity
					className={cn("size-4", ok ? "text-vscode-testing-iconPassed" : "text-vscode-errorForeground")}
				/>
				实时事件流 · {statusLabel}
			</div>
			<p className="mt-2 text-xs text-vscode-descriptionForeground">
				{error || (lastEventName ? `最近事件：${lastEventName}` : "等待 /api/v1/events 推送")}
			</p>
		</div>
	)
}

function InteractionColumn({
	title,
	description,
	icon,
	emptyText,
	children,
}: {
	title: string
	description: string
	icon: ReactNode
	emptyText: string
	children: ReactNode
}) {
	const hasChildren = Array.isArray(children) ? children.length > 0 : !!children
	return (
		<div className="rounded-2xl border border-vscode-panel-border bg-vscode-editor-background p-4">
			<div className="flex items-center gap-2 text-sm font-medium">
				{icon}
				{title}
			</div>
			<p className="mt-1 text-xs text-vscode-descriptionForeground">{description}</p>
			<div className="mt-3 space-y-3">
				{hasChildren ? (
					children
				) : (
					<div className="rounded-2xl border border-dashed border-vscode-panel-border p-4 text-sm text-vscode-descriptionForeground">
						{emptyText}
					</div>
				)}
			</div>
		</div>
	)
}

function PermissionInteractionCard({
	interaction,
	disabled,
	onSelect,
}: {
	interaction: CostrictCloudInteractionItem
	disabled: boolean
	onSelect: (optionId: string) => void
}) {
	return (
		<div className="rounded-2xl border border-vscode-panel-border bg-vscode-sideBar-background/60 p-4">
			<div className="flex items-start gap-2">
				<ShieldAlert className="mt-0.5 size-4 text-vscode-editorWarning-foreground" />
				<div className="min-w-0 flex-1">
					<div className="text-sm font-medium">{interaction.title}</div>
					<p className="mt-1 whitespace-pre-wrap text-sm text-vscode-descriptionForeground">
						{interaction.description}
					</p>
				</div>
			</div>
			<div className="mt-3 flex flex-wrap gap-2">
				{interaction.options.map((option) => (
					<Button
						key={option.id}
						variant={option.kind?.startsWith("reject") ? "outline" : "primary"}
						size="sm"
						disabled={disabled}
						onClick={() => onSelect(option.id)}>
						{disabled ? <Loader2 className="size-4 animate-spin" /> : null}
						{option.label}
					</Button>
				))}
			</div>
		</div>
	)
}

function QuestionInteractionCard({
	interaction,
	value,
	disabled,
	onChange,
	onReply,
	onReject,
}: {
	interaction: CostrictCloudInteractionItem
	value: string
	disabled: boolean
	onChange: (value: string) => void
	onReply: () => void
	onReject: () => void
}) {
	return (
		<div className="rounded-2xl border border-vscode-panel-border bg-vscode-sideBar-background/60 p-4">
			<div className="flex items-start gap-2">
				<HelpCircle className="mt-0.5 size-4 text-vscode-testing-iconQueued" />
				<div className="min-w-0 flex-1">
					<div className="text-sm font-medium">{interaction.title}</div>
					<p className="mt-1 whitespace-pre-wrap text-sm text-vscode-descriptionForeground">
						{interaction.description}
					</p>
				</div>
			</div>
			<textarea
				value={value}
				onChange={(event) => onChange(event.target.value)}
				placeholder="输入你要回复给 agent 的内容"
				disabled={disabled}
				className="mt-3 min-h-[88px] w-full rounded-2xl border border-vscode-input-border bg-vscode-input-background px-3 py-2 text-sm outline-none focus:border-vscode-focusBorder disabled:opacity-60"
			/>
			<div className="mt-3 flex flex-wrap gap-2">
				<Button variant="primary" size="sm" disabled={disabled} onClick={onReply}>
					{disabled ? <Loader2 className="size-4 animate-spin" /> : <SendHorizonal className="size-4" />}
					提交回复
				</Button>
				<Button variant="outline" size="sm" disabled={disabled} onClick={onReject}>
					<AlertTriangle className="size-4" />
					拒绝
				</Button>
			</div>
		</div>
	)
}

function DataPanel({ title, value, emptyText }: { title: string; value: unknown; emptyText: string }) {
	return (
		<div className="rounded-2xl border border-vscode-panel-border bg-vscode-editor-background p-3">
			<div className="mb-2 text-sm font-medium">{title}</div>
			<pre className="max-h-[360px] overflow-auto rounded-2xl bg-vscode-textCodeBlock-background p-3 text-xs text-vscode-editor-foreground">
				{value ? JSON.stringify(value, null, 2) : emptyText}
			</pre>
		</div>
	)
}

export default CloudApp
