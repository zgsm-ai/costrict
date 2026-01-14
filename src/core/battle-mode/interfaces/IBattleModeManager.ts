import { BattleModeConfig, BattleModeStatus, RecoveryResult } from "../types"
import type { ErrorContext } from "../types/ErrorContext"

/**
 * 战斗模式管理器接口
 * 负责管理战斗模式的生命周期、错误处理和策略协调
 */
export interface IBattleModeManager {
	/**
	 * 检查战斗模式是否处于激活状态
	 */
	isActive(): boolean

	/**
	 * 激活战斗模式
	 */
	activate(): void

	/**
	 * 禁用战斗模式
	 */
	deactivate(): void

	/**
	 * 暂停战斗模式
	 */
	pause(): void

	/**
	 * 恢复战斗模式
	 */
	resume(): void

	/**
	 * 处理错误并返回恢复结果
	 * @param error - 发生的错误
	 * @param context - 错误上下文信息
	 * @returns 恢复结果
	 */
	handleError(error: Error, context: ErrorContext): Promise<RecoveryResult>

	/**
	 * 获取当前错误计数
	 */
	getErrorCount(): number

	/**
	 * 重置错误计数
	 */
	resetErrorCount(): void

	/**
	 * 更新战斗模式配置
	 * @param config - 部分或完整的配置更新
	 */
	updateConfig(config: Partial<BattleModeConfig>): void

	/**
	 * 获取当前配置
	 */
	getConfig(): BattleModeConfig

	/**
	 * 获取当前状态
	 */
	getStatus(): BattleModeStatus

	/**
	 * 获取恢复统计数据
	 */
	getRecoveryStats(): {
		totalRecoveries: number
		level1Count: number
		level2Count: number
		level3Count: number
		successRate: number
	}
}
