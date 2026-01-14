/**
 * 对话历史清理器
 * 负责分析对话历史并移除导致错误的消息片段
 */
import type { IConversationCleaner } from "./interfaces/IConversationCleaner"
import type { ErrorContext } from "./types/ErrorContext"
import type { Message } from "./types/ErrorContext"
import { DEFAULT_BATTLE_MODE_CONFIG, type BattleModeConfig } from "./types/BattleModeConfig"
import { RECOVERABLE_ERROR_PATTERNS } from "./types/ErrorContext"

/**
 * 清理策略枚举
 */
export enum CleanupStrategy {
	/** 移除最后一条助手消息 */
	RemoveLastAssistant = "remove_last_assistant",
	/** 移除导致错误的特定消息 */
	RemoveErrorCause = "remove_error_cause",
	/** 移除最近的对话对（用户+助手） */
	RemoveRecentPair = "remove_recent_pair",
	/** 移除中间的消息段 */
	RemoveMiddleSegment = "remove_middle_segment",
	/** 移除连续失败的助手消息 */
	RemoveFailedSequence = "remove_failed_sequence",
	/** 移除过多的上下文（从最旧开始） */
	ReduceContext = "reduce_context",
}

/**
 * 清理历史记录
 */
export interface CleanupHistoryEntry {
	timestamp: number
	error: Error
	strategy: CleanupStrategy
	removedCount: number
	removedMessages: Message[]
	originalLength: number
	cleanedLength: number
}

/**
 * 清理器配置
 */
export interface ConversationCleanerConfig {
	/** 是否保留最后的用户消息 */
	keepLastUserMessage: boolean
	/** 是否保留系统消息 */
	keepSystemMessages: boolean
	/** 最多移除的消息数量 */
	maxMessagesToRemove: number
	/** 最小保留的消息数量 */
	minMessagesToKeep: number
	/** 是否启用token估算 */
	enableTokenEstimation: boolean
	/** 每个token的平均字符数（用于估算） */
	charsPerToken: number
	/** 最大token限制 */
	maxTokenLimit: number
}

/**
 * 默认清理器配置
 */
export const DEFAULT_CLEANER_CONFIG: ConversationCleanerConfig = {
	keepLastUserMessage: true,
	keepSystemMessages: true,
	maxMessagesToRemove: 10,
	minMessagesToKeep: 2,
	enableTokenEstimation: true,
	charsPerToken: 4,
	maxTokenLimit: 128000,
}

/**
 * 对话清理器实现
 * 支持多种清理策略来处理不同类型的错误
 */
export class ConversationCleaner implements IConversationCleaner {
	/** 清理器配置 */
	private config: ConversationCleanerConfig

	/** 清理历史记录 */
	private cleanupHistory: CleanupHistoryEntry[] = []

	/** 战斗模式配置 */
	private battleModeConfig: BattleModeConfig

	/**
	 * 构造函数
	 * @param config - 清理器配置
	 * @param battleModeConfig - 战斗模式配置
	 */
	constructor(config?: Partial<ConversationCleanerConfig>, battleModeConfig?: Partial<BattleModeConfig>) {
		this.config = { ...DEFAULT_CLEANER_CONFIG, ...config }
		this.battleModeConfig = { ...DEFAULT_BATTLE_MODE_CONFIG, ...battleModeConfig }
	}

	/**
	 * 更新配置
	 * @param config - 新的配置（部分）
	 */
	public updateConfig(config: Partial<ConversationCleanerConfig>): void {
		this.config = { ...this.config, ...config }
	}

	/**
	 * 更新战斗模式配置
	 * @param config - 战斗模式配置
	 */
	public updateBattleModeConfig(config: Partial<BattleModeConfig>): void {
		this.battleModeConfig = { ...this.battleModeConfig, ...config }
	}

	/**
	 * 获取清理历史
	 * @returns 清理历史数组
	 */
	public getCleanupHistory(): CleanupHistoryEntry[] {
		return [...this.cleanupHistory]
	}

	/**
	 * 清除清理历史
	 */
	public clearCleanupHistory(): void {
		this.cleanupHistory = []
	}

	/**
	 * 识别需要移除的消息
	 * @param history - 对话历史
	 * @param error - 发生的错误
	 * @param errorContext - 错误上下文
	 * @returns 需要移除的消息列表
	 */
	public async identifyMessagesToRemove(
		history: Message[],
		error: Error,
		errorContext: ErrorContext,
	): Promise<Message[]> {
		// 分析错误类型和消息
		const errorAnalysis = this.analyzeError(error, errorContext)
		const strategy = this.selectCleanupStrategy(errorAnalysis, history)

		let messagesToRemove: Message[] = []

		switch (strategy) {
			case CleanupStrategy.RemoveLastAssistant:
				messagesToRemove = this.identifyLastAssistantMessage(history)
				break

			case CleanupStrategy.RemoveErrorCause:
				messagesToRemove = this.identifyErrorCause(history, errorAnalysis)
				break

			case CleanupStrategy.RemoveRecentPair:
				messagesToRemove = this.identifyRecentPair(history)
				break

			case CleanupStrategy.RemoveMiddleSegment:
				messagesToRemove = this.identifyMiddleSegment(history)
				break

			case CleanupStrategy.RemoveFailedSequence:
				messagesToRemove = this.identifyFailedSequence(history, errorContext)
				break

			case CleanupStrategy.ReduceContext:
				messagesToRemove = this.identifyContextToReduce(history)
				break

			default:
				// 默认移除最后一条助手消息
				messagesToRemove = this.identifyLastAssistantMessage(history)
		}

		// 应用保留规则
		messagesToRemove = this.applyRetentionRules(history, messagesToRemove)

		// 应用最大移除限制
		if (messagesToRemove.length > this.config.maxMessagesToRemove) {
			messagesToRemove = messagesToRemove.slice(0, this.config.maxMessagesToRemove)
		}

		return messagesToRemove
	}

	/**
	 * 从对话历史中移除指定的消息
	 * @param history - 原始对话历史
	 * @param messagesToRemove - 需要移除的消息
	 * @returns 清理后的对话历史
	 */
	public removeMessages(history: Message[], messagesToRemove: Message[]): Message[] {
		// 创建消息ID映射（用于识别相同消息）
		const messagesToRemoveSet = new Set(messagesToRemove.map((msg) => this.createMessageIdentifier(msg)))

		// 过滤掉需要移除的消息
		const cleanedHistory = history.filter((msg) => !messagesToRemoveSet.has(this.createMessageIdentifier(msg)))

		return cleanedHistory
	}

	/**
	 * 验证清理后的对话历史是否有效
	 * @param history - 清理后的对话历史
	 * @returns 是否有效
	 */
	public validateCleanedHistory(history: Message[]): boolean {
		// 检查消息数量是否足够
		if (history.length < this.config.minMessagesToKeep) {
			return false
		}

		// 检查是否至少有一条用户消息
		const hasUserMessage = history.some((msg) => msg.role === "user")
		if (!hasUserMessage) {
			return false
		}

		// 如果启用了token估算，检查token数量
		if (this.config.enableTokenEstimation) {
			const stats = this.analyzeConversation(history)
			if (stats.estimatedTokens > this.config.maxTokenLimit) {
				return false
			}
		}

		// 检查消息顺序是否合理
		let lastRole: string | null = null
		for (const msg of history) {
			// 系统消息应该在最前面
			if (msg.role === "system" && lastRole !== null && lastRole !== "system") {
				return false
			}
			lastRole = msg.role
		}

		return true
	}

	/**
	 * 执行完整的清理流程
	 * @param history - 原始对话历史
	 * @param error - 发生的错误
	 * @param errorContext - 错误上下文
	 * @returns 清理后的对话历史和移除的消息数量
	 */
	public async cleanConversation(
		history: Message[],
		error: Error,
		errorContext: ErrorContext,
	): Promise<{
		cleanedHistory: Message[]
		removedCount: number
		removedMessages: Message[]
	}> {
		const originalLength = history.length

		// 识别需要移除的消息
		const messagesToRemove = await this.identifyMessagesToRemove(history, error, errorContext)

		// 移除消息
		const cleanedHistory = this.removeMessages(history, messagesToRemove)

		// 验证清理结果
		if (!this.validateCleanedHistory(cleanedHistory)) {
			throw new Error("清理后的对话历史验证失败")
		}

		// 确定使用的策略
		const errorAnalysis = this.analyzeError(error, errorContext)
		const strategy = this.selectCleanupStrategy(errorAnalysis, history)

		// 记录清理历史
		this.cleanupHistory.push({
			timestamp: Date.now(),
			error,
			strategy,
			removedCount: messagesToRemove.length,
			removedMessages: messagesToRemove,
			originalLength,
			cleanedLength: cleanedHistory.length,
		})

		// 保持清理历史不超过100条
		if (this.cleanupHistory.length > 100) {
			this.cleanupHistory.shift()
		}

		return {
			cleanedHistory,
			removedCount: messagesToRemove.length,
			removedMessages: messagesToRemove,
		}
	}

	/**
	 * 分析对话历史，获取统计信息
	 * @param history - 对话历史
	 * @returns 统计信息
	 */
	public analyzeConversation(history: Message[]): {
		totalMessages: number
		userMessages: number
		assistantMessages: number
		systemMessages: number
		estimatedTokens: number
	} {
		const totalMessages = history.length
		const userMessages = history.filter((msg) => msg.role === "user").length
		const assistantMessages = history.filter((msg) => msg.role === "assistant").length
		const systemMessages = history.filter((msg) => msg.role === "system").length

		// 估算token数量
		const estimatedTokens = this.config.enableTokenEstimation ? this.estimateTokens(history) : 0

		return {
			totalMessages,
			userMessages,
			assistantMessages,
			systemMessages,
			estimatedTokens,
		}
	}

	/**
	 * 分析错误
	 * @param error - 错误对象
	 * @param errorContext - 错误上下文
	 * @returns 错误分析结果
	 */
	private analyzeError(
		error: Error,
		errorContext: ErrorContext,
	): {
		isContextError: boolean
		isTimeout: boolean
		isRateLimit: boolean
		isPermissionError: boolean
		hasKeywords: boolean
		keywords: string[]
	} {
		const errorMessage = error.message.toLowerCase()
		const isContextError = /context|token|memory|limit/i.test(errorMessage)
		const isTimeout = /timeout/i.test(errorMessage)
		const isRateLimit = /rate limit/i.test(errorMessage)
		const isPermissionError = /permission|access|denied/i.test(errorMessage)

		// 检查错误模式
		const matchedPatterns = RECOVERABLE_ERROR_PATTERNS.filter((pattern) => pattern.pattern.test(errorMessage))
		const hasKeywords = matchedPatterns.length > 0
		const keywords = matchedPatterns.map((p) => p.description)

		return {
			isContextError,
			isTimeout,
			isRateLimit,
			isPermissionError,
			hasKeywords,
			keywords,
		}
	}

	/**
	 * 选择清理策略
	 * @param errorAnalysis - 错误分析结果
	 * @param history - 对话历史
	 * @returns 清理策略
	 */
	private selectCleanupStrategy(
		errorAnalysis: ReturnType<ConversationCleaner["analyzeError"]>,
		history: Message[],
	): CleanupStrategy {
		// 上下文错误 - 需要大幅减少上下文
		if (errorAnalysis.isContextError) {
			return CleanupStrategy.ReduceContext
		}

		// 超时错误 - 可能是上下文过长
		if (errorAnalysis.isTimeout && history.length > 20) {
			return CleanupStrategy.ReduceContext
		}

		// 权限错误 - 移除最后一条助手消息
		if (errorAnalysis.isPermissionError) {
			return CleanupStrategy.RemoveLastAssistant
		}

		// 有特定错误关键词 - 移除错误原因
		if (errorAnalysis.hasKeywords) {
			return CleanupStrategy.RemoveErrorCause
		}

		// 默认策略：移除最近的对话对
		return CleanupStrategy.RemoveRecentPair
	}

	/**
	 * 识别最后一条助手消息
	 * @param history - 对话历史
	 * @returns 最后一条助手消息
	 */
	private identifyLastAssistantMessage(history: Message[]): Message[] {
		// 从后往前找第一条助手消息
		for (let i = history.length - 1; i >= 0; i--) {
			if (history[i].role === "assistant") {
				return [history[i]]
			}
		}
		return []
	}

	/**
	 * 识别导致错误的消息
	 * @param history - 对话历史
	 * @param errorAnalysis - 错误分析结果
	 * @returns 导致错误的消息
	 */
	private identifyErrorCause(
		history: Message[],
		errorAnalysis: ReturnType<ConversationCleaner["analyzeError"]>,
	): Message[] {
		// 查找包含错误关键词的助手消息
		const keywordMessages: Message[] = []
		for (let i = history.length - 1; i >= 0; i--) {
			if (history[i].role === "assistant") {
				const content = history[i].content.toLowerCase()
				const hasKeyword = errorAnalysis.keywords.some((keyword) => content.includes(keyword.toLowerCase()))
				if (hasKeyword) {
					keywordMessages.push(history[i])
				}
			}
			// 最多查找5条消息
			if (keywordMessages.length >= 5) {
				break
			}
		}

		// 如果找到关键字消息，返回它们
		if (keywordMessages.length > 0) {
			return keywordMessages
		}

		// 否则返回最近的助手消息及其相关工具调用
		return this.identifyRecentPair(history)
	}

	/**
	 * 识别最近的对话对
	 * @param history - 对话历史
	 * @returns 最近的一对用户和助手消息
	 */
	private identifyRecentPair(history: Message[]): Message[] {
		const result: Message[] = []

		// 从后往前找
		for (let i = history.length - 1; i >= 0; i--) {
			const msg = history[i]

			// 如果已经找到一对，停止
			if (result.length >= 2) {
				break
			}

			// 如果是用户或助手消息，添加到结果
			if (msg.role === "user" || msg.role === "assistant") {
				result.unshift(msg)
			}
		}

		return result
	}

	/**
	 * 识别中间的消息段
	 * @param history - 对话历史
	 * @returns 中间的消息段
	 */
	private identifyMiddleSegment(history: Message[]): Message[] {
		const length = history.length
		if (length < 5) {
			// 消息太少，不处理
			return []
		}

		// 保留前20%和后20%的消息
		const keepStart = Math.floor(length * 0.2)
		const keepEnd = Math.ceil(length * 0.8)

		const segment: Message[] = []
		for (let i = keepStart; i < keepEnd; i++) {
			const msg = history[i]
			// 跳过系统消息
			if (msg.role !== "system") {
				segment.push(msg)
			}
		}

		return segment
	}

	/**
	 * 识别连续失败的助手消息
	 * @param history - 对话历史
	 * @param errorContext - 错误上下文
	 * @returns 连续失败的消息
	 */
	private identifyFailedSequence(history: Message[], errorContext: ErrorContext): Message[] {
		// 查找清理历史中的连续失败
		const recentFailures = this.cleanupHistory.filter(
			(entry) => Date.now() - entry.timestamp < 60000, // 1分钟内的失败
		)

		if (recentFailures.length < 3) {
			// 失败不够多，使用默认策略
			return this.identifyLastAssistantMessage(history)
		}

		// 查找最近的助手消息
		const failedMessages: Message[] = []
		for (let i = history.length - 1; i >= 0; i--) {
			if (history[i].role === "assistant") {
				failedMessages.unshift(history[i])
				// 最多移除3条连续失败的助手消息
				if (failedMessages.length >= 3) {
					break
				}
			}
		}

		return failedMessages
	}

	/**
	 * 识别需要减少的上下文
	 * @param history - 对话历史
	 * @returns 需要移除的旧消息
	 */
	private identifyContextToReduce(history: Message[]): Message[] {
		const targetLength = Math.max(
			this.config.minMessagesToKeep,
			history.length - Math.floor(history.length * 0.3), // 减少30%
		)

		if (history.length <= targetLength) {
			// 已经足够少，不处理
			return []
		}

		const toRemove: Message[] = []
		const toKeep = new Set<string>()

		// 标记要保留的消息
		// 1. 保留最后的用户消息
		if (this.config.keepLastUserMessage) {
			for (let i = history.length - 1; i >= 0; i--) {
				if (history[i].role === "user") {
					toKeep.add(this.createMessageIdentifier(history[i]))
					break
				}
			}
		}

		// 2. 保留系统消息
		if (this.config.keepSystemMessages) {
			for (const msg of history) {
				if (msg.role === "system") {
					toKeep.add(this.createMessageIdentifier(msg))
				}
			}
		}

		// 3. 保留最后几条消息（确保上下文连贯）
		const keepLastCount = Math.min(5, targetLength)
		for (let i = 0; i < keepLastCount; i++) {
			const index = history.length - 1 - i
			if (index >= 0) {
				toKeep.add(this.createMessageIdentifier(history[index]))
			}
		}

		// 从旧到新遍历，标记需要移除的消息
		let keptCount = 0
		for (const msg of history) {
			const id = this.createMessageIdentifier(msg)

			if (toKeep.has(id)) {
				keptCount++
				continue
			}

			if (keptCount < targetLength) {
				keptCount++
				continue
			}

			toRemove.push(msg)
		}

		return toRemove
	}

	/**
	 * 应用保留规则
	 * @param history - 原始对话历史
	 * @param messagesToRemove - 需要移除的消息
	 * @returns 应用保留规则后的消息列表
	 */
	private applyRetentionRules(history: Message[], messagesToRemove: Message[]): Message[] {
		const toRemoveSet = new Set(messagesToRemove.map((msg) => this.createMessageIdentifier(msg)))

		// 保留最后的用户消息
		if (this.config.keepLastUserMessage) {
			for (let i = history.length - 1; i >= 0; i--) {
				if (history[i].role === "user") {
					const id = this.createMessageIdentifier(history[i])
					toRemoveSet.delete(id)
					break
				}
			}
		}

		// 保留系统消息
		if (this.config.keepSystemMessages) {
			for (const msg of history) {
				if (msg.role === "system") {
					toRemoveSet.delete(this.createMessageIdentifier(msg))
				}
			}
		}

		// 确保保留足够的消息
		const minToKeep = this.config.minMessagesToKeep
		if (history.length - toRemoveSet.size < minToKeep) {
			// 计算需要保留的消息数量
			const needToKeep = minToKeep - (history.length - toRemoveSet.size)

			// 保留最后needToKeep条消息
			let kept = 0
			for (let i = history.length - 1; i >= 0 && kept < needToKeep; i--) {
				const id = this.createMessageIdentifier(history[i])
				if (toRemoveSet.has(id)) {
					toRemoveSet.delete(id)
					kept++
				}
			}
		}

		// 转换回消息对象
		const result: Message[] = []
		for (const msg of history) {
			if (toRemoveSet.has(this.createMessageIdentifier(msg))) {
				result.push(msg)
			}
		}

		return result
	}

	/**
	 * 创建消息唯一标识符
	 * @param msg - 消息对象
	 * @returns 消息标识符
	 */
	private createMessageIdentifier(msg: Message): string {
		return `${msg.role}:${msg.content.substring(0, 50)}:${msg.timestamp || 0}`
	}

	/**
	 * 估算对话的token数量
	 * @param history - 对话历史
	 * @returns 估算的token数量
	 */
	private estimateTokens(history: Message[]): number {
		let totalChars = 0
		for (const msg of history) {
			totalChars += msg.content.length
			// 估算元数据的token开销
			totalChars += 100 // 角色和其他元数据
		}
		return Math.ceil(totalChars / this.config.charsPerToken)
	}

	/**
	 * 获取清理统计信息
	 * @returns 统计信息
	 */
	public getStatistics(): {
		totalCleanups: number
		totalMessagesRemoved: number
		strategiesUsed: Record<CleanupStrategy, number>
		averageRemovalRate: number
	} {
		const totalCleanups = this.cleanupHistory.length
		const totalMessagesRemoved = this.cleanupHistory.reduce((sum, entry) => sum + entry.removedCount, 0)

		const strategiesUsed: Record<CleanupStrategy, number> = {
			[CleanupStrategy.RemoveLastAssistant]: 0,
			[CleanupStrategy.RemoveErrorCause]: 0,
			[CleanupStrategy.RemoveRecentPair]: 0,
			[CleanupStrategy.RemoveMiddleSegment]: 0,
			[CleanupStrategy.RemoveFailedSequence]: 0,
			[CleanupStrategy.ReduceContext]: 0,
		}

		for (const entry of this.cleanupHistory) {
			strategiesUsed[entry.strategy]++
		}

		const averageRemovalRate =
			totalCleanups > 0
				? this.cleanupHistory.reduce((sum, entry) => sum + entry.removedCount / entry.originalLength, 0) /
					totalCleanups
				: 0

		return {
			totalCleanups,
			totalMessagesRemoved,
			strategiesUsed,
			averageRemovalRate,
		}
	}

	/**
	 * 重置清理器状态
	 */
	public reset(): void {
		this.cleanupHistory = []
	}
}
