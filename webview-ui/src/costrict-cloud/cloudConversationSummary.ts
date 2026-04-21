import type { CostrictCloudInteractionItem, CostrictCloudMessageItem } from "./messageAdapter"

/**
 * `cloudConversationSummary.ts` 负责 Cloud 模式会话侧的轻量摘要推导。
 *
 * 负责：
 * - 将部分实时事件压平成会话级 event summary message
 * - 基于 messages / interactions / cached event / abort override 生成 conversation summary
 * - 生成会话列表与顶部状态区可直接消费的 label/detail
 *
 * 不负责：
 * - 上游 messages payload 的完整归一化
 * - event stream 与时间线消息的增量合并
 * - agents/models/providers 目录兼容
 * - CloudApp 的状态管理与请求编排
 *
 * 该模块的意义是把“会话摘要推导”从页面编排层中剥离出来。
 * 如果未来上游直接提供更丰富的 session metadata，这里的推导逻辑应进一步收缩。
 */

export type ConversationRecord = {
	id?: string
	title?: string
	status?: string
	createdAt?: string
	updatedAt?: string
	[key: string]: unknown
}

export type ConversationSummary = {
	label: string
	tone: "running" | "waiting" | "idle" | "error"
	detail: string
}

export type ConversationEventCache = {
	kind: CostrictCloudMessageItem["kind"]
	status?: string
	label: string
	timestamp: number
}

export function adaptEventMessageSummary(message: { event: string; data: unknown }): CostrictCloudMessageItem | null {
	if (typeof message.data !== "object" || message.data === null) {
		return null
	}
	const payload = message.data as Record<string, unknown>
	const conversationId =
		typeof payload.conversationId === "string"
			? payload.conversationId
			: typeof payload.conversation_id === "string"
				? payload.conversation_id
				: typeof payload.sessionId === "string"
					? payload.sessionId
					: typeof payload.session_id === "string"
						? payload.session_id
						: undefined
	if (!conversationId) {
		return null
	}
	const content =
		typeof payload.delta === "string"
			? payload.delta
			: typeof payload.content === "string"
				? payload.content
				: typeof payload.message === "string"
					? payload.message
					: ""
	const type = typeof payload.type === "string" ? payload.type : message.event
	const status = typeof payload.status === "string" ? payload.status : typeof payload.state === "string" ? payload.state : undefined
	const toolName = typeof payload.toolName === "string" ? payload.toolName : typeof payload.tool_name === "string" ? payload.tool_name : undefined
	const command = typeof payload.command === "string" ? payload.command : undefined
	const kind =
		message.event === "agent_thought_chunk"
			? "reasoning"
			: message.event === "tool_call" || message.event === "tool_call_update"
				? "tool"
				: message.event === "command_output"
					? "command"
					: message.event === "error"
						? "error"
						: "assistant"
	return {
		id: typeof payload.id === "string" ? payload.id : `${message.event}-${conversationId}`,
		kind,
		conversationId,
		content,
		raw: payload,
		status,
		toolName,
		command,
		title: type,
	}
}

export function buildEventCacheLabel(message: CostrictCloudMessageItem): string {
	if (message.status === "streaming") {
		return message.kind === "reasoning" ? "正在思考" : "正在生成回复"
	}
	if (message.kind === "tool") {
		return `${message.toolName || "工具"}${message.status === "completed" ? " 已完成" : message.status === "failed" ? " 执行失败" : " 运行中"}`
	}
	if (message.kind === "command") {
		return `${message.command || "命令"}${message.status === "completed" ? " 已完成" : message.status === "failed" ? " 执行失败" : " 运行中"}`
	}
	if (message.kind === "error") {
		return message.content || "发生错误"
	}
	return message.content || message.title || "收到新事件"
}

export function buildConversationSummary({
	conversation,
	messages,
	cachedEvent,
	permissions,
	questions,
	abortOverride,
}: {
	conversation: ConversationRecord
	messages: CostrictCloudMessageItem[]
	cachedEvent?: ConversationEventCache
	permissions: CostrictCloudInteractionItem[]
	questions: CostrictCloudInteractionItem[]
	abortOverride?: "force-idle"
}): ConversationSummary {
	const conversationId = String(conversation.id ?? "")
	const normalizedStatus = String(conversation.status ?? "").toLowerCase()
	const pendingPermission = permissions.find((item) => item.conversationId === conversationId)
	if (pendingPermission) {
		return { label: "waiting", tone: "waiting", detail: `等待权限：${pendingPermission.title}` }
	}
	const pendingQuestion = questions.find((item) => item.conversationId === conversationId)
	if (pendingQuestion) {
		return { label: "waiting", tone: "waiting", detail: `等待回复：${pendingQuestion.title}` }
	}
	if (abortOverride === "force-idle") {
		return { label: "idle", tone: "idle", detail: "已停止" }
	}
	if (messages.length > 0) {
		const latestMessage = [...messages].reverse().find((item) => item.kind !== "user")
		if (latestMessage?.status === "streaming") {
			return {
				label: "running",
				tone: "running",
				detail: latestMessage.kind === "reasoning" ? "正在思考" : "正在生成回复",
			}
		}
		if (latestMessage && (latestMessage.kind === "tool" || latestMessage.kind === "command") && latestMessage.status) {
			if (latestMessage.status === "failed" || latestMessage.status === "error") {
				return {
					label: "error",
					tone: "error",
					detail: `${latestMessage.kind === "tool" ? latestMessage.toolName || "工具" : latestMessage.command || "命令"} 执行失败`,
				}
			}
			if (latestMessage.status === "running" || latestMessage.status === "pending") {
				return {
					label: "running",
					tone: "running",
					detail: `${latestMessage.kind === "tool" ? latestMessage.toolName || "工具" : latestMessage.command || "命令"} 运行中`,
				}
			}
			if (latestMessage.status === "completed") {
				return {
					label: "idle",
					tone: "idle",
					detail: `${latestMessage.kind === "tool" ? latestMessage.toolName || "工具" : latestMessage.command || "命令"} 已完成`,
				}
			}
		}
	}
	if (cachedEvent) {
		if (cachedEvent.status === "failed" || cachedEvent.status === "error") {
			return { label: "error", tone: "error", detail: cachedEvent.label }
		}
		if (["streaming", "running", "pending"].includes(cachedEvent.status ?? "")) {
			return { label: "running", tone: "running", detail: cachedEvent.label }
		}
		if (cachedEvent.status === "completed") {
			return { label: "idle", tone: "idle", detail: cachedEvent.label }
		}
	}
	if (["error", "failed"].includes(normalizedStatus)) {
		return { label: "error", tone: "error", detail: conversation.status || "执行失败" }
	}
	if (["running", "processing", "active", "busy"].includes(normalizedStatus)) {
		return { label: "running", tone: "running", detail: conversation.status || "运行中" }
	}
	if (["waiting", "paused", "needs_input"].includes(normalizedStatus)) {
		return { label: "waiting", tone: "waiting", detail: conversation.status || "等待中" }
	}
	return { label: "idle", tone: "idle", detail: conversation.status || "空闲" }
}
