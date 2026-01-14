/**
 * 错误上下文类型
 * 提供错误发生时的上下文信息
 */
export interface ErrorContext {
	/** 错误发生的时间戳 */
	timestamp: number

	/** 关联的任务ID */
	taskId: string

	/** 对话历史记录 */
	conversationHistory: Message[]

	/** 当前使用的模型 */
	currentModel: string

	/** 错误类型 */
	errorType: "recovery" | "fatal"

	/** 错误来源（可选） */
	errorSource?: "tool_execution" | "api_response" | "stream_processing" | "unknown"

	/** 附加的上下文数据（可选） */
	metadata?: Record<string, unknown>
}

/**
 * 消息类型（从任务系统导入）
 * TODO: 从 src/core/task 或相关位置导入实际的 Message 类型
 */
export interface Message {
	role: "user" | "assistant" | "system"
	content: string
	timestamp?: number
	[key: string]: unknown
}

/**
 * 可恢复的错误模式
 */
export interface RecoverableErrorPattern {
	/** 正则表达式模式 */
	pattern: RegExp

	/** 错误类型 */
	errorType: "recovery" | "fatal"

	/** 推荐的恢复策略 */
	recommendedStrategy?: "level1" | "level2" | "level3"

	/** 描述 */
	description: string
}

/**
 * 预定义的可恢复错误模式
 */
export const RECOVERABLE_ERROR_PATTERNS: RecoverableErrorPattern[] = [
	{
		pattern: /timeout/i,
		errorType: "recovery",
		recommendedStrategy: "level1",
		description: "超时错误，通常可以重试",
	},
	{
		pattern: /rate limit/i,
		errorType: "recovery",
		recommendedStrategy: "level1",
		description: "速率限制错误，等待后重试",
	},
	{
		pattern: /context window|token limit/i,
		errorType: "recovery",
		recommendedStrategy: "level2",
		description: "上下文窗口或 token 限制，需要清理上下文",
	},
	{
		pattern: /permission denied/i,
		errorType: "recovery",
		recommendedStrategy: "level2",
		description: "权限错误，可能需要清理相关操作",
	},
]
