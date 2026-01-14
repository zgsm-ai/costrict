/**
 * 战斗模式状态类型
 * 定义战斗模式的当前状态和统计信息
 */
export type BattleModeState = "inactive" | "active" | "paused"

/**
 * 战斗模式状态信息
 * 包含当前状态和相关的统计数据
 */
export interface BattleModeStatus {
	/** 当前状态 */
	state: BattleModeState

	/** 错误计数 */
	errorCount: number

	/** 上次激活时间 */
	lastActivatedAt?: number

	/** 上次错误时间 */
	lastErrorAt?: number

	/** 执行的恢复次数（按级别） */
	recoveryStats: {
		/** Level1 恢复次数 */
		level1Count: number
		/** Level2 恢复次数 */
		level2Count: number
		/** Level3 恢复次数 */
		level3Count: number
	}

	/** 模型切换统计 */
	modelSwitchStats: {
		/** 总切换次数 */
		totalSwitches: number
		/** 当前模型 */
		currentModel: string
		/** 上次切换时间 */
		lastSwitchedAt?: number
	}
}

/**
 * 默认战斗模式状态
 */
export const DEFAULT_BATTLE_MODE_STATUS: BattleModeStatus = {
	state: "inactive",
	errorCount: 0,
	recoveryStats: {
		level1Count: 0,
		level2Count: 0,
		level3Count: 0,
	},
	modelSwitchStats: {
		totalSwitches: 0,
		currentModel: "",
	},
}
