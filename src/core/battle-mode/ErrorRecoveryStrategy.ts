/**
 * 错误恢复策略抽象基类
 * 提供错误恢复策略的通用实现
 */
import type { ErrorContext } from "./types/ErrorContext"
import type { RecoveryResult } from "./types/RecoveryResult"
import {
	IErrorRecoveryStrategy,
	ILevelBasedRecoveryStrategy,
	RecoveryStrategyLevel,
} from "./interfaces/IErrorRecoveryStrategy"

/**
 * 策略统计信息
 */
export interface StrategyStatistics {
	/** 总执行次数 */
	totalExecutions: number

	/** 成功次数 */
	successCount: number

	/** 失败次数 */
	failureCount: number

	/** 平均执行时间（毫秒） */
	averageDuration: number

	/** 最后执行时间戳 */
	lastExecutionTime?: number
}

/**
 * 错误恢复策略抽象基类
 * 实现通用的错误恢复逻辑和统计追踪
 */
export abstract class ErrorRecoveryStrategy implements ILevelBasedRecoveryStrategy {
	/** 策略名称 */
	public readonly name: string

	/** 策略描述 */
	public readonly description: string

	/** 策略优先级 */
	public readonly priority: number

	/** 策略级别 */
	protected readonly level: RecoveryStrategyLevel

	/** 策略统计信息 */
	protected statistics: StrategyStatistics

	/** 用于计算平均执行时间的累积和 */
	private durationSum: number = 0

	/**
	 * 构造函数
	 * @param name - 策略名称
	 * @param description - 策略描述
	 * @param priority - 策略优先级（数字越小优先级越高）
	 * @param level - 策略级别
	 */
	constructor(name: string, description: string, priority: number, level: RecoveryStrategyLevel) {
		this.name = name
		this.description = description
		this.priority = priority
		this.level = level
		this.statistics = {
			totalExecutions: 0,
			successCount: 0,
			failureCount: 0,
			averageDuration: 0,
		}
	}

	/**
	 * 获取策略级别
	 * @returns 策略级别枚举值
	 */
	public getLevel(): RecoveryStrategyLevel {
		return this.level
	}

	/**
	 * 检查是否可以恢复此错误
	 * 子类可以覆盖此方法以提供特定的适用性判断逻辑
	 * @param error - 发生的错误
	 * @param context - 错误上下文
	 * @returns 是否可以恢复
	 */
	public canRecover(error: Error, context: ErrorContext): boolean {
		// 默认实现：所有错误类型都是可恢复的
		// 子类可以根据错误类型、来源等添加更具体的判断
		if (context.errorType === "fatal") {
			return false
		}

		// 检查错误消息是否包含不可恢复的关键词
		const unrecoverablePatterns = [
			"authentication failed",
			"invalid api key",
			"quota exceeded",
			"insufficient credits",
		]

		const errorMessage = error.message.toLowerCase()
		return !unrecoverablePatterns.some((pattern) => errorMessage.includes(pattern))
	}

	/**
	 * 执行恢复操作
	 * 包含统计信息追踪和错误处理
	 * @param error - 发生的错误
	 * @param context - 错误上下文
	 * @returns 恢复结果
	 */
	public async recover(error: Error, context: ErrorContext): Promise<RecoveryResult> {
		const startTime = Date.now()
		this.statistics.totalExecutions++

		try {
			// 执行具体的恢复逻辑
			const result = await this.doRecover(error, context)

			// 记录成功统计
			this.statistics.successCount++
			this.statistics.lastExecutionTime = Date.now()

			// 计算平均执行时间
			const duration = Date.now() - startTime
			this.updateAverageDuration(duration)

			// 添加执行时间到结果中
			return {
				...result,
				duration,
			}
		} catch (recoveryError) {
			// 记录失败统计
			this.statistics.failureCount++
			this.statistics.lastExecutionTime = Date.now()

			// 计算平均执行时间
			this.updateAverageDuration(Date.now() - startTime)

			// 返回失败结果
			return {
				action: "abort",
				details: {
					reason: `策略执行失败: ${recoveryError instanceof Error ? recoveryError.message : String(recoveryError)}`,
					strategyLevel: this.level,
				},
				success: false,
				duration: Date.now() - startTime,
			}
		}
	}

	/**
	 * 执行具体的恢复逻辑（由子类实现）
	 * @param error - 发生的错误
	 * @param context - 错误上下文
	 * @returns 恢复结果
	 */
	protected abstract doRecover(error: Error, context: ErrorContext): Promise<RecoveryResult>

	/**
	 * 获取策略统计信息
	 * @returns 统计信息副本
	 */
	public getStatistics(): StrategyStatistics {
		return { ...this.statistics }
	}

	/**
	 * 重置策略统计信息
	 */
	public resetStatistics(): void {
		this.statistics = {
			totalExecutions: 0,
			successCount: 0,
			failureCount: 0,
			averageDuration: 0,
		}
		this.durationSum = 0
	}

	/**
	 * 获取策略成功率
	 * @returns 成功率百分比（0-100）
	 */
	public getSuccessRate(): number {
		if (this.statistics.totalExecutions === 0) {
			return 100
		}
		return (this.statistics.successCount / this.statistics.totalExecutions) * 100
	}

	/**
	 * 更新平均执行时间
	 * @param duration - 当前执行时间（毫秒）
	 */
	private updateAverageDuration(duration: number): void {
		const { totalExecutions, averageDuration } = this.statistics

		// 使用累积和的方式计算平均值，避免第一次执行时的问题
		if (!this.durationSum) {
			this.durationSum = 0
		}
		this.durationSum += duration

		this.statistics.averageDuration = this.durationSum / totalExecutions
	}

	/**
	 * 创建继续执行的恢复结果
	 * @param reason - 恢复原因
	 * @returns 恢复结果
	 */
	protected createContinueResult(reason: string): RecoveryResult {
		return {
			action: "continue",
			details: {
				reason,
				strategyLevel: this.level,
			},
			success: true,
		}
	}

	/**
	 * 创建重试的恢复结果
	 * @param reason - 恢复原因
	 * @returns 恢复结果
	 */
	protected createRetryResult(reason: string): RecoveryResult {
		return {
			action: "retry",
			details: {
				reason,
				strategyLevel: this.level,
			},
			success: true,
		}
	}

	/**
	 * 创建模型切换的恢复结果
	 * @param newModel - 新模型ID
	 * @param reason - 恢复原因
	 * @returns 恢复结果
	 */
	protected createSwitchModelResult(newModel: string, reason: string): RecoveryResult {
		return {
			action: "switch_model",
			details: {
				reason,
				switchedToModel: newModel,
				strategyLevel: this.level,
			},
			success: true,
		}
	}

	/**
	 * 创建中止的恢复结果
	 * @param reason - 中止原因
	 * @returns 恢复结果
	 */
	protected createAbortResult(reason: string): RecoveryResult {
		return {
			action: "abort",
			details: {
				reason,
				strategyLevel: this.level,
			},
			success: false,
		}
	}
}
