import { z } from "zod"

/**
 * 自动清理策略
 */
export enum CleanupStrategy {
	/** 基于时间：清理N天前的记录 */
	BASED_ON_TIME = "based_on_time",
	/** 基于数量：保留最近N条 */
	BASED_ON_COUNT = "based_on_count",
}

/**
 * 自动清理配置
 */
export const autoCleanupSettingsSchema = z.object({
	/** 是否启用自动清理 */
	enabled: z.boolean().optional(),
	/** 清理策略 */
	strategy: z.nativeEnum(CleanupStrategy).optional(),
	/** 保留天数（默认7天） */
	retentionDays: z.number().min(1).max(365).optional(),
	/** 最大历史记录数（默认50条） */
	maxHistoryCount: z.number().min(10).max(500).optional(),
	/** 是否排除当前活跃任务 */
	excludeActive: z.boolean().optional(),
	/** 清理频率：启动时清理 */
	cleanupOnStartup: z.boolean().optional(),
})

export type AutoCleanupSettings = z.infer<typeof autoCleanupSettingsSchema>

/**
 * 清理结果
 */
export interface CleanupResult {
	/** 清理时间 */
	timestamp: number
	/** 使用的策略 */
	strategy: CleanupStrategy
	/** 删除的任务数 */
	tasksRemoved: number
	/** 释放的空间（字节） */
	spaceFreed: number
	/** 保留的任务数 */
	tasksKept: number
	/** 删除的任务ID列表 */
	removedTaskIds: string[]
}

/**
 * 默认自动清理配置
 */
export const DEFAULT_AUTO_CLEANUP_SETTINGS: AutoCleanupSettings = {
	enabled: false,
	strategy: CleanupStrategy.BASED_ON_TIME,
	retentionDays: 7,
	maxHistoryCount: 100,
	excludeActive: true,
	cleanupOnStartup: true,
}
