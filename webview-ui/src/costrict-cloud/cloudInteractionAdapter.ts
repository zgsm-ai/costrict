import type {
	CostrictCloudInteractionItem,
	CostrictCloudInteractionOption,
} from "./messageAdapter"

/**
 * `cloudInteractionAdapter.ts` 负责 Cloud 模式中的 interaction 事件兼容。
 *
 * 负责：
 * - 将 permission / question 事件适配为统一的 `CostrictCloudInteractionItem`
 * - 兼容 id / title / description / options / conversationId 的多种字段命名
 *
 * 不负责：
 * - messages payload 归一化
 * - event timeline 合并
 * - interaction 列表 response envelope 兼容（那属于 cloudAppAdapters）
 * - UI 提交行为与表单状态
 *
 * 该模块的目标是把 interaction 单条事件适配从 `messageAdapter.ts` 中剥离出来。
 * 如果未来上游 interaction schema 稳定，这里的字段探测逻辑应进一步收缩。
 */

type LooseRecord = Record<string, unknown>

/**
 * 消费侧 interaction 适配入口：
 * - 当前 permission/question 事件字段命名仍不稳定
 * - 这里统一收敛为前端可直接消费的 `CostrictCloudInteractionItem`
 * - 等上游 interaction schema 稳定后，这里应只保留轻量校验
 */
export function adaptCsCloudInteraction(event: { event: string; data: unknown }): CostrictCloudInteractionItem | null {
	if (!isRecord(event.data)) {
		return null
	}
	if (event.event === "permission") {
		return adaptPermissionInteraction(event.data)
	}
	if (event.event === "question") {
		return adaptQuestionInteraction(event.data)
	}
	return null
}

/**
 * 临时兼容函数：
 * - 兼容 permission 事件的多种字段命名
 * - 等上游统一 interaction schema 后，这里应退化为简单映射/校验
 */
function adaptPermissionInteraction(data: LooseRecord): CostrictCloudInteractionItem | null {
	const id = firstString(data, ["id", "call_id", "callId", "callID", "request_id", "requestId"])
	if (!id) {
		return null
	}
	const title = firstString(data, ["title", "kind", "name"]) || "Permission Request"
	const description = firstString(data, ["description", "message", "prompt", "text"]) || stringifyValue(data)
	const conversationId = firstString(data, ["conversationId", "conversation_id", "sessionId", "session_id", "sessionID"])
	const options = adaptInteractionOptions(data.options, [
		{ id: "allow_once", label: "允许一次", kind: "allow_once" },
		{ id: "allow_always", label: "总是允许", kind: "allow_always" },
		{ id: "reject_once", label: "拒绝一次", kind: "reject_once" },
		{ id: "reject_always", label: "总是拒绝", kind: "reject_always" },
	])
	return {
		id,
		kind: "permission",
		conversationId: conversationId || undefined,
		title,
		description,
		options,
		raw: data,
	}
}

function adaptQuestionInteraction(data: LooseRecord): CostrictCloudInteractionItem | null {
	const id = firstString(data, ["question_id", "questionId", "id", "request_id", "requestId"])
	if (!id) {
		return null
	}
	const title = firstString(data, ["title", "name"]) || "Question"
	const description = firstString(data, ["question", "prompt", "message", "text"]) || stringifyValue(data)
	const conversationId = firstString(data, ["conversationId", "conversation_id", "sessionId", "session_id"])
	const options = adaptInteractionOptions(data.options, [{ id: "reply", label: "提交回复", kind: "reply" }])
	return {
		id,
		kind: "question",
		conversationId: conversationId || undefined,
		title,
		description,
		options,
		raw: data,
	}
}

function adaptInteractionOptions(value: unknown, fallback: CostrictCloudInteractionOption[]): CostrictCloudInteractionOption[] {
	if (!Array.isArray(value)) {
		return fallback
	}
	const options: CostrictCloudInteractionOption[] = []
	for (let index = 0; index < value.length; index += 1) {
		const item = value[index]
		if (!isRecord(item)) {
			continue
		}
		const id = firstString(item, ["option_id", "optionId", "id", "value"]) || `option-${index}`
		const label = firstString(item, ["label", "name", "title", "text"]) || id
		const kind = firstString(item, ["kind", "type"])
		options.push({ id, label, ...(kind ? { kind } : {}) })
	}
	return options.length > 0 ? options : fallback
}

function isRecord(value: unknown): value is LooseRecord {
	return typeof value === "object" && value !== null
}

function firstString(record: LooseRecord, keys: string[]): string {
	for (const key of keys) {
		const value = record[key]
		if (typeof value === "string" && value.trim()) {
			return value.trim()
		}
	}
	return ""
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
