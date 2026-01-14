/**
 * L1 级别错误恢复策略：忽略继续
 * 适用于错误计数较低的情况，通过容忍错误继续执行
 */
import { ErrorRecoveryStrategy } from "../ErrorRecoveryStrategy"
import type { ErrorContext } from "../types/ErrorContext"
import type { RecoveryResult } from "../types/RecoveryResult"
import { RecoveryStrategyLevel } from "../interfaces/IErrorRecoveryStrategy"

/**
 * L1 忽略继续策略配置
 */
export interface L1ContinueStrategyConfig {
	/** 最大错误计数阈值（超过此阈值将不再适用此策略） */
	maxErrorCount: number

	/** 可容忍的错误类型列表 */
	toleratedErrorTypes: string[]

	/** 是否记录容忍的错误 */
	logToleratedErrors: boolean

	/** 是否在容忍错误后添加短暂延迟（毫秒） */
	retryDelay?: number
}

/**
 * 默认 L1 策略配置
 */
export const DEFAULT_L1_CONFIG: L1ContinueStrategyConfig = {
	maxErrorCount: 3,
	toleratedErrorTypes: ["timeout", "rate limit", "network error", "temporary error", "service unavailable"],
	logToleratedErrors: true,
	retryDelay: 1000, // 1秒延迟
}

/**
 * L1 忽略继续策略
 * 适用于错误计数较低的情况，通过容忍错误继续执行
 */
export class L1ContinueStrategy extends ErrorRecoveryStrategy {
	/** 策略配置 */
	private config: L1ContinueStrategyConfig

	/** 当前错误计数 */
	private currentErrorCount: number = 0

	/** 容忍的错误历史 */
	private toleratedErrors: Array<{
		error: Error
		timestamp: number
		context: ErrorContext
	}> = []

	/**
	 * 构造函数
	 * @param config - 策略配置
	 */
	constructor(config?: Partial<L1ContinueStrategyConfig>) {
		super(
			"L1ContinueStrategy",
			"L1级别策略：忽略错误继续执行，适用于错误计数较低的情况",
			1, // 最高优先级
			RecoveryStrategyLevel.Level1,
		)

		this.config = { ...DEFAULT_L1_CONFIG, ...config }
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

		// 检查错误计数是否超过阈值
		if (this.currentErrorCount >= this.config.maxErrorCount) {
			return false
		}

		// 调用父类的检查
		if (!super.canRecover(error, context)) {
			return false
		}

		// 检查错误消息是否包含可容忍的错误类型
		return this.isErrorTolerated(error)
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

		// 记录容忍的错误
		if (this.config.logToleratedErrors) {
			this.toleratedErrors.push({
				error,
				timestamp: Date.now(),
				context,
			})

			// 保持错误历史不超过 100 条
			if (this.toleratedErrors.length > 100) {
				this.toleratedErrors.shift()
			}
		}

		// 如果配置了延迟，等待指定时间
		if (this.config.retryDelay && this.config.retryDelay > 0) {
			await this.delay(this.config.retryDelay)
		}

		// 返回继续执行的结果
		return this.createContinueResult(
			`错误已容忍并忽略，继续执行。当前错误计数: ${this.currentErrorCount}/${this.config.maxErrorCount}`,
		)
	}

	/**
	 * 检查错误是否可容忍
	 * @param error - 错误对象
	 * @returns 是否可容忍
	 */
	private isErrorTolerated(error: Error): boolean {
		const errorMessage = error.message.toLowerCase()

		// 检查是否匹配任何可容忍的错误类型
		return this.config.toleratedErrorTypes.some((type) => errorMessage.includes(type.toLowerCase()))
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
	 * 获取容忍的错误历史
	 * @returns 错误历史数组
	 */
	public getToleratedErrors(): Array<{
		error: Error
		timestamp: number
		context: ErrorContext
	}> {
		return [...this.toleratedErrors]
	}

	/**
	 * 清除错误历史
	 */
	public clearErrorHistory(): void {
		this.toleratedErrors = []
	}

	/**
	 * 更新策略配置
	 * @param config - 新的配置（部分）
	 */
	public updateConfig(config: Partial<L1ContinueStrategyConfig>): void {
		this.config = { ...this.config, ...config }
	}

	/**
	 * 获取当前配置
	 * @returns 当前配置
	 */
	public getConfig(): L1ContinueStrategyConfig {
		return { ...this.config }
	}

	/**
	 * 重置策略状态（包括计数和历史）
	 */
	public override resetStatistics(): void {
		super.resetStatistics()
		this.currentErrorCount = 0
		this.toleratedErrors = []
	}

	/**
	 * 获取策略是否已达到错误计数阈值
	 * @returns 是否达到阈值
	 */
	public isThresholdReached(): boolean {
		return this.currentErrorCount >= this.config.maxErrorCount
	}
}
