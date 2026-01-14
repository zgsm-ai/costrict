/**
 * 战斗模式配置类型
 * 定义战斗模式的行为和阈值
 */
export interface BattleModeConfig {
	/** 是否启用战斗模式 */
	enabled: boolean

	/** 错误阈值配置 */
	errorThresholds: {
		/** 第一级阈值：错误计数小于此值时，忽略继续 */
		level1: number
		/** 第二级阈值：错误计数达到此值时，执行上下文清理 */
		level2: number
	}

	/** 上下文清理配置 */
	contextCleanup: {
		/** 是否保留最后的用户消息 */
		keepLastUserMessage: boolean
		/** 是否保留系统消息 */
		keepLastSystemMessage: boolean
		/** 最多移除的消息数量 */
		maxMessagesToRemove: number
	}

	/** 模型切换配置 */
	modelSwitching: {
		/** 备用模型列表 */
		fallbackModels: string[]
		/** 最大切换次数 */
		maxSwitches: number
	}
}

/**
 * 默认战斗模式配置
 */
export const DEFAULT_BATTLE_MODE_CONFIG: BattleModeConfig = {
	enabled: false,
	errorThresholds: {
		level1: 3,
		level2: 5,
	},
	contextCleanup: {
		keepLastUserMessage: true,
		keepLastSystemMessage: true,
		maxMessagesToRemove: 10,
	},
	modelSwitching: {
		fallbackModels: ["gpt-4o", "claude-3-5-sonnet", "gemini-1.5-pro"],
		maxSwitches: 3,
	},
}
