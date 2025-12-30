import type { AutoCleanupSettings, CleanupStrategy, CleanupResult } from "@roo-code/types"
import * as fs from "fs/promises"
import * as path from "path"
import getFolderSize from "get-folder-size"

import type { HistoryItem } from "@roo-code/types"
import { safeWriteJson } from "../../utils/safeWriteJson"
import { t } from "../../i18n"

// 清理日志文件名
const CLEANUP_LOG_FILE = "cleanup-log.json"

/**
 * 清理日志条目
 */
interface CleanupLogEntry {
	timestamp: number
	strategy: CleanupStrategy
	tasksRemoved: number
	spaceFreed: number
	tasksKept: number
}

/**
 * AutoCleanupService 处理任务历史记录的自动清理
 */
export class AutoCleanupService {
	private cleanupLogPath: string

	constructor(private globalStoragePath: string) {
		this.cleanupLogPath = path.join(globalStoragePath, CLEANUP_LOG_FILE)
	}

	/**
	 * 执行自动清理
	 * @param taskHistory 当前任务历史
	 * @param settings 清理配置
	 * @param currentTaskId 当前活跃任务ID（可选）
	 * @returns 清理结果
	 */
	async performCleanup(
		taskHistory: HistoryItem[],
		settings: AutoCleanupSettings,
		currentTaskId?: string,
	): Promise<CleanupResult> {
		// 如果未启用自动清理，直接返回
		if (!settings.enabled) {
			return this.createEmptyResult()
		}

		// 获取实际配置值
		const excludeActive = settings.excludeActive ?? true
		const strategy = settings.strategy ?? "based_on_time"

		let tasksToKeep: HistoryItem[] = []
		let tasksToRemove: string[] = []
		let totalSizeFreed = 0

		// 根据策略确定需要删除的任务
		switch (settings.strategy) {
			case "based_on_time":
				;[tasksToKeep, tasksToRemove] = this.filterByTime(
					taskHistory,
					settings.retentionDays || 7,
					settings.excludeActive ?? true,
					currentTaskId,
				)
				break
			case "based_on_count":
				;[tasksToKeep, tasksToRemove] = this.filterByCount(
					taskHistory,
					settings.maxHistoryCount || 50,
					settings.excludeActive ?? true,
					currentTaskId,
				)
				break
			default:
				// 默认使用基于时间的策略
				;[tasksToKeep, tasksToRemove] = this.filterByTime(
					taskHistory,
					settings.retentionDays || 7,
					settings.excludeActive ?? true,
					currentTaskId,
				)
				break
		}

		// 性能优化：使用 Set 来快速查找需要删除的任务ID
		const removeSet = new Set(tasksToRemove)

		// 计算需要释放的空间
		for (const task of taskHistory) {
			if (removeSet.has(task.id)) {
				// 使用 task.size 或基于任务内容估算大小
				totalSizeFreed += task.size || 0
			}
		}

		const result: CleanupResult = {
			timestamp: Date.now(),
			strategy: (settings.strategy as CleanupStrategy) || "based_on_time",
			tasksRemoved: tasksToRemove.length,
			spaceFreed: totalSizeFreed,
			tasksKept: tasksToKeep.length,
			removedTaskIds: tasksToRemove,
		}

		// 记录清理日志
		await this.logCleanup(result)

		return result
	}

	/**
	 * 基于时间过滤任务
	 */
	private filterByTime(
		taskHistory: HistoryItem[],
		retentionDays: number,
		excludeActive?: boolean,
		currentTaskId?: string,
	): [HistoryItem[], string[]] {
		const cutoffTime = Date.now() - retentionDays * 24 * 60 * 60 * 1000
		const keep: HistoryItem[] = []
		const remove: string[] = []

		for (const task of taskHistory) {
			// 保护当前活跃任务
			if ((excludeActive ?? true) && task.id === currentTaskId) {
				keep.push(task)
				continue
			}

			// 检查任务时间
			if (task.ts >= cutoffTime) {
				keep.push(task)
			} else {
				remove.push(task.id)
			}
		}

		return [keep, remove]
	}

	/**
	 * 基于数量过滤任务
	 * 注意：maxCount 包含活跃任务在内的总数量
	 */
	private filterByCount(
		taskHistory: HistoryItem[],
		maxCount: number,
		excludeActive?: boolean,
		currentTaskId?: string,
	): [HistoryItem[], string[]] {
		// 按时间排序（最新的在前）
		const sortedHistory = [...taskHistory].sort((a, b) => b.ts - a.ts)

		const shouldExcludeActive = excludeActive ?? true

		if (shouldExcludeActive && currentTaskId) {
			// 找到活跃任务
			const activeTask = sortedHistory.find(t => t.id === currentTaskId)
			// 其他任务
			const otherTasks = sortedHistory.filter(t => t.id !== currentTaskId)

			if (activeTask) {
				// 保留活跃任务 + (maxCount - 1) 个其他最新任务
				// 这样总共保留 maxCount 个任务
				const keepOthers = otherTasks.slice(0, Math.max(0, maxCount - 1))
				const removeOthers = otherTasks.slice(Math.max(0, maxCount - 1))

				return [
					[activeTask, ...keepOthers],
					removeOthers.map(t => t.id)
				]
			}
			// 如果活跃任务不存在，正常保留 maxCount 个
			return [
				otherTasks.slice(0, maxCount),
				otherTasks.slice(maxCount).map(t => t.id)
			]
		}

		// 不需要保护活跃任务，直接保留最新的 maxCount 个
		return [
			sortedHistory.slice(0, maxCount),
			sortedHistory.slice(maxCount).map(t => t.id)
		]
	}

	/**
	 * 创建空的清理结果
	 */
	private createEmptyResult(): CleanupResult {
		return {
			timestamp: Date.now(),
			strategy: "based_on_time" as CleanupStrategy,
			tasksRemoved: 0,
			spaceFreed: 0,
			tasksKept: 0,
			removedTaskIds: [],
		}
	}

	/**
	 * 记录清理操作日志
	 */
	private async logCleanup(result: CleanupResult): Promise<void> {
		try {
			const log: CleanupLogEntry = {
				timestamp: result.timestamp,
				strategy: result.strategy,
				tasksRemoved: result.tasksRemoved,
				spaceFreed: result.spaceFreed,
				tasksKept: result.tasksKept,
			}

			// 读取现有日志
			let logs: CleanupLogEntry[] = []
			try {
				const logContent = await fs.readFile(this.cleanupLogPath, "utf8")
				logs = JSON.parse(logContent)
			} catch {
				// 文件不存在或解析失败，使用空数组
			}

			// 添加新日志并保留最近100条
			logs.unshift(log)
			logs = logs.slice(0, 100)

			// 保存日志
			await safeWriteJson(this.cleanupLogPath, logs)
		} catch (error) {
			// 日志记录失败不影响清理操作
			console.error(`[AutoCleanup] Failed to log cleanup: ${error}`)
		}
	}

	/**
	 * 获取清理日志
	 */
	async getCleanupLogs(): Promise<CleanupLogEntry[]> {
		try {
			const logContent = await fs.readFile(this.cleanupLogPath, "utf8")
			const parsed = JSON.parse(logContent)
			return Array.isArray(parsed) ? parsed : []
		} catch {
			return []
		}
	}

	/**
	 * 清除清理日志
	 */
	async clearCleanupLogs(): Promise<void> {
		try {
			await fs.rm(this.cleanupLogPath, { force: true })
		} catch (error) {
			console.error(`[AutoCleanup] Failed to clear cleanup logs: ${error}`)
		}
	}

	/**
	 * 格式化文件大小显示
	 */
	static formatBytes(bytes: number): string {
		if (bytes === 0) return "0 B"
		const k = 1024
		const sizes = ["B", "KB", "MB", "GB"]
		const i = Math.floor(Math.log(bytes) / Math.log(k))
		return `${Number((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
	}
}
