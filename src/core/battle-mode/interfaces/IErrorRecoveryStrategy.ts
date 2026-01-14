import type { ErrorContext } from "../types/ErrorContext"
import type { RecoveryResult } from "../types/RecoveryResult"

/**
 * 错误恢复策略接口
 * 定义错误恢复策略的基本契约
 */
export interface IErrorRecoveryStrategy {
	/**
	 * 检查是否可以恢复此错误
	 * @param error - 发生的错误
	 * @param context - 错误上下文
	 * @returns 是否可以恢复
	 */
	canRecover(error: Error, context: ErrorContext): boolean

	/**
	 * 执行恢复操作
	 * @param error - 发生的错误
	 * @param context - 错误上下文
	 * @returns 恢复结果
	 */
	recover(error: Error, context: ErrorContext): Promise<RecoveryResult>

	/**
	 * 策略优先级（数字越小优先级越高）
	 */
	readonly priority: number

	/**
	 * 策略名称
	 */
	readonly name: string

	/**
	 * 策略描述
	 */
	readonly description: string
}

/**
 * 策略级别枚举
 */
export enum RecoveryStrategyLevel {
	/** Level1: 忽略继续（错误计数 < threshold1） */
	Level1 = "level1",

	/** Level2: 上下文清理（threshold1 ≤ count < threshold2） */
	Level2 = "level2",

	/** Level3: 模型切换（count ≥ threshold2） */
	Level3 = "level3",
}

/**
 * 策略接口扩展
 * 包含特定级别的策略能力
 */
export interface ILevelBasedRecoveryStrategy extends IErrorRecoveryStrategy {
	/**
	 * 获取策略级别
	 */
	getLevel(): RecoveryStrategyLevel
}
