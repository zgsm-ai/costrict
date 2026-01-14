import type { ErrorContext } from "../types/ErrorContext"
import type { Message } from "../types/ErrorContext"

/**
 * 对话清理器接口
 * 负责分析对话历史并移除导致错误的消息片段
 */
export interface IConversationCleaner {
	/**
	 * 识别需要移除的消息
	 * @param history - 对话历史
	 * @param error - 发生的错误
	 * @param errorContext - 错误上下文
	 * @returns 需要移除的消息列表
	 */
	identifyMessagesToRemove(history: Message[], error: Error, errorContext: ErrorContext): Promise<Message[]>

	/**
	 * 从对话历史中移除指定的消息
	 * @param history - 原始对话历史
	 * @param messagesToRemove - 需要移除的消息
	 * @returns 清理后的对话历史
	 */
	removeMessages(history: Message[], messagesToRemove: Message[]): Message[]

	/**
	 * 验证清理后的对话历史是否有效
	 * @param history - 清理后的对话历史
	 * @returns 是否有效
	 */
	validateCleanedHistory(history: Message[]): boolean

	/**
	 * 执行完整的清理流程
	 * @param history - 原始对话历史
	 * @param error - 发生的错误
	 * @param errorContext - 错误上下文
	 * @returns 清理后的对话历史和移除的消息数量
	 */
	cleanConversation(
		history: Message[],
		error: Error,
		errorContext: ErrorContext,
	): Promise<{
		cleanedHistory: Message[]
		removedCount: number
		removedMessages: Message[]
	}>

	/**
	 * 分析对话历史，获取统计信息
	 * @param history - 对话历史
	 * @returns 统计信息
	 */
	analyzeConversation(history: Message[]): {
		totalMessages: number
		userMessages: number
		assistantMessages: number
		systemMessages: number
		estimatedTokens: number
	}
}
