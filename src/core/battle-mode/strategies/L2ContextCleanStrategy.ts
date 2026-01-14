/**
 * L2 级别错误恢复策略：上下文清理
 * 适用于中等错误计数的情况，通过清理对话上下文后重试
 */
import { ErrorRecoveryStrategy } from "../ErrorRecoveryStrategy"
import type { ErrorContext } from "../types/ErrorContext"
import type { RecoveryResult } from "../types/RecoveryResult"
import type { IConversationCleaner } from "../interfaces/IConversationCleaner"
import type { Message } from "../types/ErrorContext"
import { RecoveryStrategyLevel } from "../interfaces/IErrorRecoveryStrategy"

/**
 * L2 上下文清理策略配置
 */
export interface L2ContextCleanStrategyConfig {
	/** 最小错误计数阈值（低于此值不适用此策略） */
	minErrorCount: number

	/** 最大错误计数阈值（超过此值不适用此策略） */
	maxErrorCount: number

	/** 触发清理的错误类型列表 */
	triggerErrorTypes: string[]

	/** 是否保留最后的用户消息 */
	keepLastUserMessage: boolean

	/** 是否保留系统消息 */
	keepSystemMessages: boolean

	/** 最多移除的消息数量 */
	maxMessagesToRemove: number

	/** 是否在清理后添加延迟（毫秒） */
	retryDelay?: number
}

/**
 * 默认 L2 策略配置
 */
export const DEFAULT_L2_CONFIG: L2ContextCleanStrategyConfig = {
	minErrorCount: 3,
	maxErrorCount: 5,
	triggerErrorTypes: ["context window", "token limit", "memory", "too long", "size limit"],
	keepLastUserMessage: true,
	keepSystemMessages: true,
	maxMessagesToRemove: 10,
	retryDelay: 2000, // 2秒延迟
}

/**
 * L2 上下文清理策略
 * 通过调用对话清理器清理上下文后重试
 */
export class L2ContextCleanStrategy extends ErrorRecoveryStrategy {
	/** 策略配置 */
	private config: L2ContextCleanStrategyConfig

	/** 当前错误计数 */
	private currentErrorCount: number = 0

	/** 对话清理器 */
	private conversationCleaner: IConversationCleaner | null = null

	/** 清理历史 */
	private cleanupHistory: Array<{
		timestamp: number
		error: Error
		removedCount: number
		cleanedHistory: Message[]
	}> = []

	/**
	 * 构造函数
	 * @param config - 策略配置
	 * @param conversationCleaner - 对话清理器（可选）
	 */
	constructor(config?: Partial<L2ContextCleanStrategyConfig>, conversationCleaner?: IConversationCleaner) {
		super(
			"L2ContextCleanStrategy",
			"L2级别策略：清理对话上下文后重试，适用于中等错误计数的情况",
			2, // 中等优先级
			RecoveryStrategyLevel.Level2,
		)

		this.config = { ...DEFAULT_L2_CONFIG, ...config }
		this.conversationCleaner = conversationCleaner || null
	}

	/**
	 * 设置对话清理器
	 * @param cleaner - 对话清理器
	 */
	public setConversationCleaner(cleaner: IConversationCleaner): void {
		this.conversationCleaner = cleaner
	}

	/**
	 * 检查是否可以恢复此错误
	 * @param error - 发生的错误
	 * @param context - 错误上下文
	 * @returns 是否可以恢复
	 */
	public override canRecover(error: Error, context: ErrorContext): boolean {
		// 检查错误类型是否为 fatal
		if (context.errorType === "fatal") {
			return false
		}

		// 检查错误计数是否在阈值范围内
		if (this.currentErrorCount < this.config.minErrorCount || this.currentErrorCount >= this.config.maxErrorCount) {
			return false
		}

		// 调用父类的检查
		if (!super.canRecover(error, context)) {
			return false
		}

		// 检查错误消息是否匹配触发类型
		return this.isErrorTriggered(error)
	}

	/**
	 * 执行具体的恢复逻辑
	 * @param error - 发生的错误
	 * @param context - 错误上下文
	 * @returns 恢复结果
	 */
	protected async doRecover(error: Error, context: ErrorContext): Promise<RecoveryResult> {
		// 增加错误计数
		this.currentErrorCount++

		// 检查是否有对话清理器
		if (!this.conversationCleaner) {
			return this.createRetryResult(`未配置对话清理器，直接重试。当前错误计数: ${this.currentErrorCount}`)
		}

		try {
			// 执行对话清理
			const { cleanedHistory, removedCount } = await this.conversationCleaner.cleanConversation(
				context.conversationHistory,
				error,
				context,
			)

			// 验证清理结果
			if (!this.conversationCleaner.validateCleanedHistory(cleanedHistory)) {
				throw new Error("清理后的对话历史验证失败")
			}

			// 记录清理历史
			this.cleanupHistory.push({
				timestamp: Date.now(),
				error,
				removedCount,
				cleanedHistory,
			})

			// 保持清理历史不超过 50 条
			if (this.cleanupHistory.length > 50) {
				this.cleanupHistory.shift()
			}

			// 如果配置了延迟，等待指定时间
			if (this.config.retryDelay && this.config.retryDelay > 0) {
				await this.delay(this.config.retryDelay)
			}

			// 返回重试结果
			return this.createRetryResult(
				`已清理 ${removedCount} 条消息后重试。当前错误计数: ${this.currentErrorCount}`,
			)
		} catch (cleanupError) {
			// 清理失败，返回错误结果
			throw new Error(
				`上下文清理失败: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`,
			)
		}
	}

	/**
	 * 检查错误是否触发清理
	 * @param error - 错误对象
	 * @returns 是否触发清理
	 */
	private isErrorTriggered(error: Error): boolean {
		const errorMessage = error.message.toLowerCase()

		// 检查是否匹配任何触发错误类型
		return this.config.triggerErrorTypes.some((type) => errorMessage.includes(type.toLowerCase()))
	}

	/**
	 * 延迟执行
	 * @param ms - 延迟毫秒数
	 * @returns Promise
	 */
	private delay(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms))
	}

	/**
	 * 获取当前错误计数
	 * @returns 当前错误计数
	 */
	public getCurrentErrorCount(): number {
		return this.currentErrorCount
	}

	/**
	 * 重置错误计数
	 */
	public resetErrorCount(): void {
		this.currentErrorCount = 0
	}

	/**
	 * 获取清理历史
	 * @returns 清理历史数组
	 */
	public getCleanupHistory(): Array<{
		timestamp: number
		error: Error
		removedCount: number
		cleanedHistory: Message[]
	}> {
		return [...this.cleanupHistory]
	}

	/**
	 * 清除清理历史
	 */
	public clearCleanupHistory(): void {
		this.cleanupHistory = []
	}

	/**
	 * 更新策略配置
	 * @param config - 新的配置（部分）
	 */
	public updateConfig(config: Partial<L2ContextCleanStrategyConfig>): void {
		this.config = { ...this.config, ...config }
	}

	/**
	 * 获取当前配置
	 * @returns 当前配置
	 */
	public getConfig(): L2ContextCleanStrategyConfig {
		return { ...this.config }
	}

	/**
	 * 重置策略状态（包括计数和历史）
	 */
	public override resetStatistics(): void {
		super.resetStatistics()
		this.currentErrorCount = 0
		this.cleanupHistory = []
	}

	/**
	 * 获取策略是否达到错误计数上限
	 * @returns 是否达到上限
	 */
	public isMaxErrorCountReached(): boolean {
		return this.currentErrorCount >= this.config.maxErrorCount
	}

	/**
	 * 获取策略是否达到最小错误计数
	 * @returns 是否达到最小值
	 */
	public isMinErrorCountReached(): boolean {
		return this.currentErrorCount >= this.config.minErrorCount
	}
}
