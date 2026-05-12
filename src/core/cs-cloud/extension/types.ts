export interface AssistantUIContextMessage {
	type: "assistantUIContext"
	text: string // 插入 composer 的文本（如 "@path/file.ts:10-20"）
	images?: string[] // base64 data URLs
	previewText?: string // 仅用于 hover 预览，不插入 composer（与 Classic 行为一致）
	focus?: boolean // 发送后是否聚焦 composer
}

export type SendContextResult = "sent" | "queued" | "unavailable"
