import type { CostrictCloudInteractionItem } from "./messageAdapter"

/**
 * `cloudAppAdapters.ts` 承担 CloudApp 周边的消费侧辅助适配职责。
 *
 * 负责：
 * - agents / models / providers 目录 payload 的 normalize
 * - interaction list response 的数组 / envelope 兼容
 * - prompt request body 的保守构造
 *
 * 不负责：
 * - message/event timeline 合并
 * - permission/question event 单条适配
 * - 会话摘要与 event summary 推导
 * - UI 渲染与视图状态编排
 *
 * 它的目标是把 CloudApp 中与“目录协议”和“请求体兼容”有关的杂音隔离出去。
 * 如果未来上游目录与请求 schema 稳定，这个模块应明显收缩。
 */

export type CloudAgentOption = {
	id: string
	label: string
	description?: string
	available?: boolean
}

export type CloudModelOption = {
	id: string
	label: string
	description?: string
	provider?: string
	providerLabel?: string
	family?: string
	contextWindow?: number
	capabilities?: string[]
}

export type CloudProviderOption = {
	id: string
	label: string
	description?: string
	available?: boolean
}

/**
 * 消费侧 interaction list 适配函数：
 * - 兼容数组与 `{ data: [] }` 形态
 * - 统一复用 `messageAdapter` 中的 interaction event adapter
 * - 上游 interaction list schema 稳定后，这里应收缩或删除
 */
export function adaptInteractionsResponse(
	data: unknown,
	kind: CostrictCloudInteractionItem["kind"],
	adaptInteraction: (event: { event: string; data: unknown }) => CostrictCloudInteractionItem | null,
): CostrictCloudInteractionItem[] {
	const raw = Array.isArray(data)
		? data
		: Array.isArray((data as { data?: unknown })?.data)
			? (((data as { data?: unknown }).data as unknown[]) ?? [])
			: []
	return raw.map((item) => adaptInteraction({ event: kind, data: item })).filter((item): item is CostrictCloudInteractionItem => item !== null)
}

function pickFirstString(record: Record<string, unknown>, keys: string[]): string | undefined {
	for (const key of keys) {
		const value = record[key]
		if (typeof value === "string" && value.trim()) {
			return value.trim()
		}
	}
	return undefined
}

function joinDescriptionParts(parts: Array<unknown>): string | undefined {
	const values = parts
		.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
		.map((value) => value.trim())
	const uniqueValues = Array.from(new Set(values))
	return uniqueValues.length > 0 ? uniqueValues.join(" · ") : undefined
}

/**
 * 消费侧目录兼容函数：
 * - 当前上游 agents 响应存在多种 shape（modes/sessionModes/payload/data）
 * - 这里负责将其吸收为稳定的 `CloudAgentOption[]`
 * - 若上游未来提供稳定 agents API，这里应收缩为简单映射
 */
export function normalizeAgentsResponse(payload: unknown): CloudAgentOption[] {
	const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null
	const rawAgents = Array.isArray(payload)
		? payload
		: Array.isArray(record?.modes)
			? ((record?.modes as unknown[]) ?? [])
			: Array.isArray(record?.sessionModes)
				? ((record?.sessionModes as unknown[]) ?? [])
				: Array.isArray(record?.payload)
					? ((record?.payload as unknown[]) ?? [])
					: Array.isArray((record?.payload as { modes?: unknown } | undefined)?.modes)
						? (((record?.payload as { modes?: unknown }).modes as unknown[]) ?? [])
						: Array.isArray((record?.data as { modes?: unknown } | undefined)?.modes)
							? (((record?.data as { modes?: unknown }).modes as unknown[]) ?? [])
							: Array.isArray(record?.data)
								? ((record?.data as unknown[]) ?? [])
								: []

	const normalized: Array<CloudAgentOption | null> = rawAgents
		.filter((agent) => {
			if (!agent || typeof agent !== "object") {
				return false
			}
			const entry = agent as Record<string, unknown>
			const hidden = entry.hidden === true
			const mode = typeof entry.mode === "string" ? entry.mode.toLowerCase() : ""
			return !hidden && mode === "primary"
		})
		.map((agent, index) => {
			const entry = agent as Record<string, unknown>
			const id = pickFirstString(entry, ["id", "slug", "name", "label", "title"]) ?? `agent-${index}`
			const label = pickFirstString(entry, ["name", "label", "title", "slug", "id"]) ?? id
			return {
				id,
				label,
				description: joinDescriptionParts([entry.description, entry.provider, entry.source]),
				available: typeof entry.available === "boolean" ? entry.available : true,
			}
		})

	return normalized.filter((agent): agent is CloudAgentOption => agent !== null)
}

/**
 * 消费侧目录兼容函数：
 * - 当前上游 models/providers 目录结构存在多种树形/数组形态
 * - 这里负责把不稳定 payload 吸收为前端稳定的 `CloudModelOption[]`
 * - 若未来存在稳定 `/models` 与 `/providers` API，这里应大幅收缩
 */
export function normalizeModelsResponse(payload: unknown): CloudModelOption[] {
	const normalizedEntries = extractModelEntries(payload)
	const deduped = new Map<string, CloudModelOption>()

	for (const model of normalizedEntries) {
		if (!deduped.has(model.id)) {
			deduped.set(model.id, model)
		}
	}

	const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null
	if (record) {
		const currentModelId = typeof record.current_model_id === "string" ? record.current_model_id : typeof record.currentModelId === "string" ? record.currentModelId : ""
		const currentModelLabel = typeof record.current_model_label === "string" ? record.current_model_label : typeof record.currentModelLabel === "string" ? record.currentModelLabel : currentModelId
		if (currentModelId && !deduped.has(currentModelId)) {
			deduped.set(currentModelId, {
				id: currentModelId,
				label: currentModelLabel || currentModelId,
				description: record.can_switch === false ? "当前模型" : undefined,
			})
		}
	}

	return Array.from(deduped.values())
}

/**
 * 临时兼容函数：
 * - 递归吸收 models/provider catalog 的多种 payload shape
 * - 当前允许字符串、数组、对象、provider collections、available_models、current_model 等多种入口
 * - 上游目录协议稳定后，这里应优先删除递归探测逻辑
 */
export function extractModelEntries(payload: unknown): CloudModelOption[] {
	if (typeof payload === "string") {
		const value = payload.trim()
		return value
			? [
					{
						id: value,
						label: value,
					},
				]
			: []
	}
	if (Array.isArray(payload)) {
		return payload.flatMap((item) => extractModelEntries(item))
	}
	if (!payload || typeof payload !== "object") {
		return []
	}

	const record = payload as Record<string, unknown>
	const providerCollections = [record.connected, record.configured, record.providers]
		.filter(Array.isArray)
		.flatMap((value) => value as unknown[])
	if (providerCollections.length > 0) {
		return providerCollections.flatMap((item) => extractProviderModelEntries(item))
	}
	if (Array.isArray(record.available_models)) {
		return (record.available_models as unknown[]).flatMap((item) => extractModelEntries(item))
	}
	if (Array.isArray(record.availableModels)) {
		return (record.availableModels as unknown[]).flatMap((item) => extractModelEntries(item))
	}
	if (Array.isArray(record.models)) {
		const provider = pickFirstString(record, ["provider", "id", "name"])
		return (record.models as unknown[]).flatMap((item) => normalizeModelEntry(item, provider))
	}
	if (record.models && typeof record.models === "object") {
		const provider = pickFirstString(record, ["id", "name", "provider"])
		return Object.values(record.models as Record<string, unknown>).flatMap((item) => normalizeModelEntry(item, provider))
	}
	if (typeof record.id === "string" || typeof record.modelId === "string") {
		const id = String(record.id ?? record.modelId)
		const provider = pickFirstString(record, ["provider", "providerId"])
		const providerLabel = pickFirstString(record, ["providerLabel", "providerName"])
		const label = pickFirstString(record, ["name", "label", "id"]) ?? id
		const family = pickFirstString(record, ["family"])
		const contextWindow = pickFirstNumber(record, ["contextWindow", "context_window", "context"])
		const capabilities = extractModelCapabilities(record.capabilities)
		const description = joinDescriptionParts([providerLabel ?? provider, record.status, family, record.description])
		return [
			{
				id,
				label,
				description,
				provider,
				providerLabel,
				family,
				contextWindow,
				capabilities,
			},
		]
	}
	if (typeof record.current_model_id === "string" || typeof record.currentModelId === "string") {
		const id = String(record.current_model_id ?? record.currentModelId)
		const label = String(record.current_model_label ?? record.currentModelLabel ?? id)
		return id
			? [
					{
						id,
						label,
						description: "当前模型",
					},
				]
			: []
	}

	const nestedKeys = ["entries", "items", "data", "payload", "capabilities"]
	for (const key of nestedKeys) {
		const nested = extractModelEntries(record[key])
		if (nested.length > 0) {
			return nested
		}
	}

	return []
}

function extractProviderModelEntries(providerEntry: unknown): CloudModelOption[] {
	if (!providerEntry || typeof providerEntry !== "object") {
		return []
	}
	const record = providerEntry as Record<string, unknown>
	const provider = pickFirstString(record, ["id", "provider"])
	const providerLabel = pickFirstString(record, ["name", "providerLabel", "providerName"]) ?? provider
	if (record.models && typeof record.models === "object" && !Array.isArray(record.models)) {
		return Object.values(record.models as Record<string, unknown>).flatMap((item) => normalizeModelEntry(item, provider, providerLabel))
	}
	if (Array.isArray(record.models)) {
		return (record.models as unknown[]).flatMap((item) => normalizeModelEntry(item, provider, providerLabel))
	}
	return extractModelEntries(record)
}

function normalizeModelEntry(entry: unknown, provider?: string, providerLabel?: string): CloudModelOption[] {
	if (typeof entry === "string") {
		const value = entry.trim()
		return value
			? [
					{
						id: value,
						label: value,
						provider,
						providerLabel,
						description: providerLabel ?? provider,
					},
				]
			: []
	}
	if (!entry || typeof entry !== "object") {
		return []
	}
	const record = entry as Record<string, unknown>
	const id = pickFirstString(record, ["id", "modelId", "name", "label"])
	if (!id) {
		return extractModelEntries(record)
	}
	const resolvedProvider = pickFirstString(record, ["provider", "providerId"]) ?? provider
	const resolvedProviderLabel = pickFirstString(record, ["providerLabel", "providerName"]) ?? providerLabel ?? resolvedProvider
	const label = pickFirstString(record, ["name", "label", "id"]) ?? id
	const family = pickFirstString(record, ["family"])
	const contextWindow = pickModelContextWindow(record)
	const capabilities = extractModelCapabilities(record.capabilities)
	const description = joinDescriptionParts([resolvedProviderLabel, record.status, family])
	return [
		{
			id,
			label,
			provider: resolvedProvider,
			providerLabel: resolvedProviderLabel,
			description,
			family,
			contextWindow,
			capabilities,
		},
	]
}

function pickModelContextWindow(record: Record<string, unknown>): number | undefined {
	const direct = pickFirstNumber(record, ["contextWindow", "context_window", "context"])
	if (typeof direct === "number") {
		return direct
	}
	const limit = record.limit
	if (limit && typeof limit === "object") {
		return pickFirstNumber(limit as Record<string, unknown>, ["context", "input"])
	}
	return undefined
}

function extractModelCapabilities(input: unknown): string[] {
	if (!input || typeof input !== "object") {
		return []
	}
	const record = input as Record<string, unknown>
	const result: string[] = []
	if (record.input && typeof record.input === "object") {
		const inputCapabilities = record.input as Record<string, unknown>
		if (inputCapabilities.text) {
			result.push("文本")
		}
		if (inputCapabilities.image) {
			result.push("图像")
		}
		if (inputCapabilities.pdf) {
			result.push("PDF")
		}
	}
	if (typeof record.reasoning === "boolean") {
		result.push(record.reasoning ? "支持推理" : "不支持推理")
	}
	if (typeof record.toolcall === "boolean") {
		result.push(record.toolcall ? "工具调用" : "不支持工具调用")
	}
	return Array.from(new Set(result.filter(Boolean)))
}

function pickFirstNumber(record: Record<string, unknown>, keys: string[]): number | undefined {
	for (const key of keys) {
		const value = record[key]
		if (typeof value === "number" && Number.isFinite(value)) {
			return value
		}
		if (typeof value === "string") {
			const parsed = Number(value)
			if (Number.isFinite(parsed)) {
				return parsed
			}
		}
	}
	return undefined
}

/**
 * 消费侧保守请求构造函数：
 * - 这里只发送当前上游已接受或已验证可用的 prompt/body 结构
 * - 即使文档中存在更理想的 schema 建议，也不应在未获授权时主动改动上游约定
 */
export function buildPromptRequestBody({
	prompt,
	modelId,
	providerId,
}: {
	prompt: string
	modelId?: string
	providerId?: string
}): Record<string, unknown> {
	const body: Record<string, unknown> = {
		parts: [{ type: "text", text: prompt.trim() }],
	}
	if (modelId) {
		body.modelID = modelId
	}
	if (providerId) {
		body.providerID = providerId
	}
	return body
}
