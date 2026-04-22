/**
 * `messageAdapter.ts` 是 Cloud 模式前端消费侧的消息时间线协议吸收层。
 *
 * 负责：
 * - 将上游 `cs-cloud` 的 messages payload 适配为稳定的 `CostrictCloudMessageItem[]`
 * - 将 event stream 临时合并到当前前端消息时间线
 * - 处理 chunk merge、fallback refetch 与消息级 metadata 提取
 *
 * 不负责：
 * - 单条 permission / question event 适配（已拆到 `cloudInteractionAdapter.ts`）
 * - UI 组件渲染规则
 * - 会话摘要与会话状态推导
 * - agents/models/providers 目录归一化
 * - prompt request body 构造
 *
 * 这些逻辑之所以集中在这里，是因为上游消息协议仍存在多种 payload shape。
 * 一旦上游 schema 稳定，本文件应优先收缩，而不是继续承载更多 UI 业务分支。
 */
// import { adaptCsCloudInteraction } from "./cloudInteractionAdapter"

export type CostrictCloudMessageKind = "user" | "assistant" | "reasoning" | "tool" | "command" | "error" | "unknown"

export type CostrictCloudMessageItem = {
	id: string
	kind: CostrictCloudMessageKind
	conversationId?: string
	timestamp?: number
	title?: string
	content: string
	raw: unknown
	toolName?: string
	command?: string
	status?: string
	metadata?: Record<string, unknown>
}

export type CostrictCloudInteractionKind = "permission" | "question"

export type CostrictCloudInteractionOption = {
	id: string
	label: string
	kind?: string
}

export type CostrictCloudInteractionItem = {
	id: string
	kind: CostrictCloudInteractionKind
	conversationId?: string
	title: string
	description: string
	options: CostrictCloudInteractionOption[]
	raw: unknown
}

type LooseRecord = Record<string, unknown>

type EventMergeResult = {
	messages: CostrictCloudMessageItem[]
	didMutate: boolean
	shouldRefetch: boolean
}

/**
 * 消费侧消息适配入口：
 * - 当前 `cs-cloud` 仍可能返回多种 messages payload 形态
 * - 这里统一将外部 payload 吸收到前端稳定的 `CostrictCloudMessageItem[]`
 * - 这属于临时协议兼容层，不应继续向 UI renderer 扩散
 */
export function adaptCsCloudMessages(payload: unknown): CostrictCloudMessageItem[] {
	const source = unwrapMessageArray(payload)
	return source
		.map((item, index) => adaptMessage(item, index))
		.filter((item): item is CostrictCloudMessageItem => item !== null)
}

/**
 * 消费侧事件合并入口：
 * - 负责把上游 event stream 临时拼接为前端消息时间线
 * - 当前仍包含 fallback refetch 与 chunk merge 补偿逻辑
 * - 若上游事件 schema 将来稳定，这里应收缩为轻量 merge 层
 */
export function mergeCsCloudEventIntoMessages(
	current: CostrictCloudMessageItem[],
	event: { event: string; data: unknown },
	selectedConversationId?: string,
): EventMergeResult {
	if (event.event === "session.status") {
		const finalized = finalizeStreamingMessages(current, event.data, selectedConversationId)
		return {
			messages: finalized.messages,
			didMutate: finalized.didMutate,
			shouldRefetch: true,
		}
	}
	if (isIgnorableSystemEvent(event.event, event.data)) {
		return { messages: current, didMutate: false, shouldRefetch: false }
	}
	if (shouldFallbackRefetch(event.event)) {
		return { messages: current, didMutate: false, shouldRefetch: true }
	}
	const adapted = adaptEventToMessage(event)
	if (!adapted) {
		return { messages: current, didMutate: false, shouldRefetch: false }
	}
	if (selectedConversationId && adapted.conversationId && adapted.conversationId !== selectedConversationId) {
		return { messages: current, didMutate: false, shouldRefetch: false }
	}

	const next = [...current]
	const existingIndex = next.findIndex((item) => item.id === adapted.id)
	if (existingIndex === -1) {
		next.push(adapted)
		return { messages: next, didMutate: true, shouldRefetch: false }
	}

	const previous = next[existingIndex]
	const merged = mergeMessage(previous, adapted, event.event)
	if (merged === previous) {
		return { messages: current, didMutate: false, shouldRefetch: false }
	}
	next[existingIndex] = merged
	return { messages: next, didMutate: true, shouldRefetch: false }
}

/**
 * 临时兼容函数：兼容多种 messages response 包裹格式。
 * 一旦上游固定为单一 schema（例如 `data.messages`），应优先删除。
 */
function unwrapMessageArray(payload: unknown): unknown[] {
	if (Array.isArray(payload)) {
		return payload
	}
	if (isRecord(payload)) {
		if (Array.isArray(payload.data)) {
			return payload.data
		}
		if (isRecord(payload.data) && Array.isArray(payload.data.messages)) {
			return payload.data.messages
		}
		if (Array.isArray(payload.messages)) {
			return payload.messages
		}
	}
	return []
}

/**
 * 临时兼容函数：
 * - 从不稳定的 event/message payload 中尽量提取统一消息结构
 * - 当前混合承担字段猜测、层级遍历、fallback content、metadata 抽取等职责
 * - 后续若上游稳定输出 `CloudMessage`，这里应大幅收缩
 */
function adaptMessage(input: unknown, index: number): CostrictCloudMessageItem | null {
	if (!isRecord(input)) {
		return {
			id: `message-${index}`,
			kind: "unknown",
			content: stringifyValue(input),
			raw: input,
		}
	}

	const info = isRecord(input.info) ? input.info : undefined
	const properties = isRecord(input.properties) ? input.properties : undefined
	const part = properties && isRecord(properties.part) ? properties.part : undefined
	const type = firstString(input, ["type", "kind", "role", "event", "update_type"]).toLowerCase()
	const role = firstString(info ?? input, ["role", "sender", "author"]).toLowerCase()
	const title =
		firstString(part ?? properties ?? info ?? input, ["title", "name", "label", "type", "field"]) ||
		(type ? type : undefined)
	const content = extractMessageContent(input)
	const toolName =
		firstString(part ?? properties ?? input, ["toolName", "tool_name", "tool", "name"]) ||
		(stepLikeEvent(type) ? firstString(properties ?? input, ["name", "title", "stepType", "step_type"]) : "")
	const command = firstString(input, ["command", "cmd"])
	const status = deriveStatus(input, type)
	const timestamp = firstNumber(properties ?? info ?? input, [
		"created",
		"createdAt",
		"created_at",
		"start",
		"end",
		"ts",
		"timestamp",
		"updatedAt",
		"updated_at",
	])
	const conversationId = extractConversationId(input)
	const id = extractMessageId(input, index)

	const normalizedKind = resolveKind({ type, role, toolName, command, content, input })
	const normalizedContent = content || deriveFallbackContent(input, normalizedKind)

	return {
		id,
		kind: normalizedKind,
		conversationId: conversationId || undefined,
		timestamp,
		title: title || undefined,
		content: normalizedContent,
		raw: input,
		toolName: toolName || undefined,
		command: command || undefined,
		status: status || undefined,
		metadata: extractMetadata(input, normalizedKind),
	}
}

function adaptEventToMessage(event: { event: string; data: unknown }): CostrictCloudMessageItem | null {
	if (isRecord(event.data)) {
		const properties = isRecord(event.data.properties) ? event.data.properties : undefined
		const flattened = properties
			? { ...event.data, ...properties, event: event.event }
			: { ...event.data, event: event.event }
		return adaptMessage(flattened, Date.now())
	}
	return adaptMessage(event.data, Date.now())
}

function isIgnorableSystemEvent(eventName: string, data: unknown): boolean {
	if (eventName === "server.connected" || eventName === "server.heartbeat") {
		return true
	}
	if (!isRecord(data)) {
		return false
	}
	const type = firstString(data, ["type", "event"])
	return type === "server.connected" || type === "server.heartbeat"
}

function extractConversationId(input: LooseRecord): string {
	const properties = isRecord(input.properties) ? input.properties : undefined
	const part = properties && isRecord(properties.part) ? properties.part : undefined
	return (
		firstString(part ?? properties ?? input, [
			"conversationId",
			"conversation_id",
			"sessionId",
			"session_id",
			"sessionID",
		]) || firstString(input, ["conversationId", "conversation_id", "sessionId", "session_id", "sessionID"])
	)
}

function extractMessageId(input: LooseRecord, index: number): string {
	const properties = isRecord(input.properties) ? input.properties : undefined
	const part = properties && isRecord(properties.part) ? properties.part : undefined
	return (
		firstString(part ?? properties ?? input, [
			"partID",
			"partId",
			"id",
			"msg_id",
			"messageId",
			"message_id",
			"toolCallId",
			"tool_call_id",
			"callId",
			"call_id",
			"stepID",
			"stepId",
		]) || `message-${index}`
	)
}

/**
 * 临时兼容函数：
 * - 吸收上游正文字段与嵌套层级差异
 * - 当前需要在顶层、properties、part、message/output/result/payload、parts 之间反复查找内容
 * - 协议稳定后应由上游直接提供标准 `content`
 */
function extractMessageContent(input: LooseRecord): string {
	const properties = isRecord(input.properties) ? input.properties : undefined
	const part = properties && isRecord(properties.part) ? properties.part : undefined
	const direct = firstString(part ?? properties ?? input, ["content", "text", "message", "body", "value", "delta"])
	if (direct) {
		return direct
	}

	if (properties) {
		const fromPropertiesParts = joinContentParts(properties.parts)
		if (fromPropertiesParts) {
			return fromPropertiesParts
		}
	}

	const fromTopLevelParts = joinContentParts(input.parts)
	if (fromTopLevelParts) {
		return fromTopLevelParts
	}

	const nestedCandidates = [part, properties, input.message, input.output, input.result, input.data, input.payload]
	for (const candidate of nestedCandidates) {
		const extracted = extractNestedText(candidate)
		if (extracted) {
			return extracted
		}
	}

	return ""
}

function extractNestedText(value: unknown): string {
	if (typeof value === "string") {
		return value
	}
	if (Array.isArray(value)) {
		const joined = value
			.map((item) => extractNestedText(item))
			.filter(Boolean)
			.join("\n\n")
		return joined
	}
	if (!isRecord(value)) {
		return ""
	}

	const direct = firstString(value, ["content", "text", "message", "body", "value", "delta"])
	if (direct) {
		return direct
	}

	const fromParts = joinContentParts(value.parts ?? value.content)
	if (fromParts) {
		return fromParts
	}

	const nestedCandidates = [
		value.part,
		value.properties,
		value.message,
		value.output,
		value.result,
		value.data,
		value.payload,
	]
	for (const candidate of nestedCandidates) {
		const extracted = extractNestedText(candidate)
		if (extracted) {
			return extracted
		}
	}

	return ""
}

function joinContentParts(value: unknown): string {
	if (!Array.isArray(value)) {
		return ""
	}
	const parts = value.filter(isRecord)
	const texts = parts
		.map((part) => {
			const nestedText = firstString(part, ["text", "content", "value"])
			if (nestedText) {
				return nestedText
			}
			const type = firstString(part, ["type"])
			if (["text", "reasoning", "output_text", "input_text"].includes(type)) {
				return extractNestedText(part)
			}
			return extractNestedText(part.message ?? part.output ?? part.result)
		})
		.filter(Boolean)
	return texts.join("\n\n")
}

function mergeMessage(
	previous: CostrictCloudMessageItem,
	next: CostrictCloudMessageItem,
	eventName: string,
): CostrictCloudMessageItem {
	if (
		eventName === "agent_message_chunk" ||
		eventName === "agent_thought_chunk" ||
		eventName === "message.part.delta"
	) {
		return {
			...previous,
			...next,
			content: `${previous.content}${next.content}`,
			status: next.status || previous.status,
			metadata: mergeMetadata(previous.metadata, next.metadata),
			raw: next.raw,
		}
	}
	if (eventName === "tool_call_update" || eventName === "step-finish" || eventName === "message.updated") {
		return {
			...previous,
			...next,
			content: next.content || previous.content,
			status: next.status || previous.status,
			metadata: mergeMetadata(previous.metadata, next.metadata),
			raw: next.raw,
		}
	}
	if (eventName === "command_output") {
		return {
			...previous,
			...next,
			content: mergeCommandContent(previous.content, next.content),
			status: next.status || previous.status,
			metadata: mergeMetadata(previous.metadata, next.metadata),
			raw: next.raw,
		}
	}
	return {
		...previous,
		...next,
		metadata: mergeMetadata(previous.metadata, next.metadata),
		raw: next.raw,
	}
}

/**
 * 临时补偿逻辑：
 * - 某些事件当前无法可靠驱动前端 UI，只能退回到重新拉取 messages/interactions
 * - 这是消费侧为上游 event 语义不完整所做的补偿，不应长期保留
 */
function shouldFallbackRefetch(eventName: string): boolean {
	return ["plan", "available_commands_update", "config_option_update", "usage_update"].includes(eventName)
}

/**
 * 临时推断逻辑：
 * - 当前上游未稳定提供 `kind`，前端只能根据 type/role/toolName/command/content 等字段推断
 * - 一旦上游稳定输出 `kind`，这里应直接删除
 */
function resolveKind({
	type,
	role,
	toolName,
	command,
	content,
	input,
}: {
	type: string
	role: string
	toolName: string
	command: string
	content: string
	input: LooseRecord
}): CostrictCloudMessageKind {
	const properties = isRecord(input.properties) ? input.properties : undefined
	const part = properties && isRecord(properties.part) ? properties.part : undefined
	const partType = firstString(part ?? properties ?? input, ["type", "field"]).toLowerCase()
	if (role === "user" || type === "user_message" || type === "user_message_chunk") {
		return "user"
	}
	if (type === "agent_thought_chunk" || type === "reasoning" || type === "thought" || partType === "reasoning") {
		return "reasoning"
	}
	if (type === "tool_call" || type === "tool_call_update" || toolName || stepLikeEvent(type) || partType === "tool") {
		return "tool"
	}
	if (type === "command" || type === "command_output" || command) {
		return "command"
	}
	if (type === "error" || type === "api_error" || type === "diff_error" || isErrorLike(input)) {
		return "error"
	}
	if (
		role === "assistant" ||
		type === "assistant" ||
		type === "agent_message_chunk" ||
		type === "text" ||
		type === "message" ||
		type === "message.updated" ||
		type === "message.part.updated" ||
		type === "message.part.delta" ||
		partType === "text"
	) {
		return "assistant"
	}
	if (content) {
		return "assistant"
	}
	return "unknown"
}

function stepLikeEvent(type: string): boolean {
	return type === "step-start" || type === "step-finish" || type === "step"
}

function deriveFallbackContent(input: LooseRecord, kind: CostrictCloudMessageKind): string {
	const properties = isRecord(input.properties) ? input.properties : undefined
	const part = properties && isRecord(properties.part) ? properties.part : undefined
	if (kind === "tool") {
		const tool = firstString(part ?? properties ?? input, [
			"toolName",
			"tool_name",
			"tool",
			"name",
			"title",
			"type",
		])
		const args = input.arguments ?? input.args ?? input.input ?? (properties && properties.input)
		const result = input.result ?? input.output ?? (properties && properties.output)
		return [
			tool ? `Tool: ${tool}` : "Tool call",
			args ? `Arguments:\n${stringifyValue(args)}` : "",
			result ? `Result:\n${stringifyValue(result)}` : "",
		]
			.filter(Boolean)
			.join("\n\n")
	}
	if (kind === "command") {
		const command = firstString(input, ["command", "cmd"])
		const stdout = firstString(input, ["stdout", "output"])
		const stderr = firstString(input, ["stderr", "error_output"])
		const exitCode = firstNumber(input, ["exitCode", "exit_code"])
		return (
			[
				command ? `$ ${command}` : "",
				stdout,
				stderr ? `stderr:\n${stderr}` : "",
				typeof exitCode === "number" ? `exit_code: ${exitCode}` : "",
			]
				.filter(Boolean)
				.join("\n\n") || stringifyValue(input)
		)
	}
	if (kind === "error") {
		return firstString(input, ["error", "message", "text", "details"]) || stringifyValue(input)
	}
	if (kind === "assistant" || kind === "reasoning") {
		return (
			extractNestedText(
				part ?? properties ?? input.message ?? input.output ?? input.result ?? input.data ?? input.payload,
			) || ""
		)
	}
	return stringifyValue(input)
}

/**
 * 临时推断逻辑：
 * - 当前上游对 lifecycle status 的表达并不统一，前端需要从 `status/state/reason/exitCode/done/final` 混合推断
 * - 如果上游稳定输出 `status`，这里应收缩到极小甚至删除
 */
function deriveStatus(input: LooseRecord, type: string): string {
	const properties = isRecord(input.properties) ? input.properties : undefined
	const explicit = firstString(properties ?? input, ["status", "state", "reason"])
	if (explicit) {
		if (explicit === "stop") {
			return "completed"
		}
		return explicit
	}
	if (type === "tool_call" || type === "step-start") {
		return "running"
	}
	if (type === "tool_call_update" || type === "step-finish" || type === "message.updated") {
		const exitCode = firstNumber(properties ?? input, ["exitCode", "exit_code"])
		if (exitCode === 0) {
			return "completed"
		}
		if (typeof exitCode === "number" && exitCode !== 0) {
			return "failed"
		}
		return hasAny(properties ?? input, ["result", "output", "completed", "done", "reason"])
			? "completed"
			: "running"
	}
	if (type === "command_output") {
		const exitCode = firstNumber(input, ["exitCode", "exit_code"])
		if (exitCode === 0) {
			return "completed"
		}
		if (typeof exitCode === "number" && exitCode !== 0) {
			return "failed"
		}
		return hasAny(input, ["stdout", "stderr", "output"]) ? "running" : "pending"
	}
	if (type === "agent_message_chunk" || type === "agent_thought_chunk" || type === "message.part.delta") {
		return isStreamingChunkFinal(properties ?? input) ? "completed" : "streaming"
	}
	if (type === "message.part.updated") {
		return "streaming"
	}
	return ""
}

function finalizeStreamingMessages(
	current: CostrictCloudMessageItem[],
	payload: unknown,
	selectedConversationId?: string,
): { messages: CostrictCloudMessageItem[]; didMutate: boolean } {
	if (!isSessionCompleted(payload)) {
		return { messages: current, didMutate: false }
	}
	let didMutate = false
	const messages = current.map((item) => {
		if (item.status !== "streaming") {
			return item
		}
		if (selectedConversationId && item.conversationId && item.conversationId !== selectedConversationId) {
			return item
		}
		if (item.kind !== "assistant" && item.kind !== "reasoning") {
			return item
		}
		didMutate = true
		return { ...item, status: "completed" }
	})
	return { messages, didMutate }
}

function isStreamingChunkFinal(input: LooseRecord): boolean {
	const explicit = firstString(input, ["status", "state", "reason"]).toLowerCase()
	if (["completed", "done", "final", "finished", "stop"].includes(explicit)) {
		return true
	}
	return Boolean(
		input.final === true ||
		input.done === true ||
		input.completed === true ||
		input.is_final === true ||
		input.isFinal === true,
	)
}

function isSessionCompleted(payload: unknown): boolean {
	if (!isRecord(payload)) {
		return false
	}
	const status = firstString(payload, ["status", "state", "phase"]).toLowerCase()
	if (["completed", "complete", "done", "finished", "idle", "stopped"].includes(status)) {
		return true
	}
	return payload.completed === true || payload.done === true
}

function extractMetadata(input: LooseRecord, kind: CostrictCloudMessageKind): Record<string, unknown> | undefined {
	const metadata: Record<string, unknown> = {}
	const properties = isRecord(input.properties) ? input.properties : undefined
	const part = properties && isRecord(properties.part) ? properties.part : undefined
	const exitCode = firstNumber(properties ?? input, ["exitCode", "exit_code"])
	if (typeof exitCode === "number") {
		metadata.exitCode = exitCode
	}
	for (const key of [
		"stdout",
		"stderr",
		"arguments",
		"result",
		"output",
		"field",
		"delta",
		"reason",
		"tokens",
		"cost",
	]) {
		const source =
			key in input ? input : properties && key in properties ? properties : part && key in part ? part : undefined
		if (source && source[key] != null) {
			metadata[key] = source[key]
		}
	}
	return kind === "tool" || kind === "command" ? (Object.keys(metadata).length > 0 ? metadata : undefined) : undefined
}

function mergeMetadata(
	previous?: Record<string, unknown>,
	next?: Record<string, unknown>,
): Record<string, unknown> | undefined {
	if (!previous && !next) {
		return undefined
	}
	return { ...(previous ?? {}), ...(next ?? {}) }
}

function mergeCommandContent(previous: string, next: string): string {
	if (!next || previous === next) {
		return previous
	}
	if (next.startsWith(previous)) {
		return next
	}
	if (previous.includes(next)) {
		return previous
	}
	return `${previous}\n\n${next}`.trim()
}

function firstString(record: LooseRecord, keys: string[]): string {
	for (const key of keys) {
		const value = record[key]
		if (typeof value === "string" && value.trim().length > 0) {
			return value
		}
	}
	return ""
}

function firstNumber(record: LooseRecord, keys: string[]): number | undefined {
	for (const key of keys) {
		const value = record[key]
		if (typeof value === "number") {
			return value
		}
		if (typeof value === "string") {
			const parsed = Number(value)
			if (!Number.isNaN(parsed)) {
				return parsed
			}
		}
	}
	return undefined
}

function hasAny(record: LooseRecord, keys: string[]): boolean {
	return keys.some((key) => key in record && record[key] != null)
}

function isRecord(value: unknown): value is LooseRecord {
	return typeof value === "object" && value !== null
}

function isErrorLike(record: LooseRecord): boolean {
	return typeof record.error === "string" || typeof record.error_message === "string"
}

function stringifyValue(value: unknown): string {
	if (typeof value === "string") {
		return value
	}
	try {
		return JSON.stringify(value, null, 2)
	} catch {
		return String(value)
	}
}
