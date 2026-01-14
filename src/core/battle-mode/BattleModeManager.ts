/**
 * 战斗模式管理器
 *
 * 核心职责：
 * - 管理战斗模式的生命周期（初始化、启动、停止、销毁）
 * - 跟踪错误计数和状态
 * - 协调错误恢复策略的执行
 * - 提供配置管理和统计信息收集
 */

import type {
	BattleModeConfig,
	BattleModeState,
	BattleModeStatus,
	ErrorContext,
	Message,
	RecoveryResult,
} from "./types"

/**
 * 事件监听器类型
 */
type EventListener = (data: unknown) => void

/**
 * 战斗模式管理器接口
 */
export interface IBattleModeManager {
	// 生命周期管理
	initialize(config?: Partial<BattleModeConfig>): void
	destroy(): void

	// 状态管理
	activate(): void
	deactivate(): void
	pause(): void
	resume(): void
	isActive(): boolean
	isPaused(): boolean

	// 错误处理
	handleError(error: Error, context: ErrorContext): Promise<RecoveryResult>
	getErrorCount(): number
	resetErrorCount(): void

	// 配置管理
	getConfig(): BattleModeConfig
	updateConfig(config: Partial<BattleModeConfig>): void

	// 统计信息
	getStatus(): BattleModeStatus
	getStatistics(): {
		totalErrors: number
		totalRecoveries: number
		recoveryByLevel: { level1: number; level2: number; level3: number }
		totalModelSwitches: number
	}

	// 事件监听
	on(event: "stateChange" | "error" | "recovery" | "modelSwitch", listener: EventListener): void
	off(event: "stateChange" | "error" | "recovery" | "modelSwitch", listener: EventListener): void

	// 清理功能（Phase 3 和 Phase 4 实现）
	// cleanupConversation(context: ErrorContext): Promise<Message[]>;
	// switchModel(currentModel: string, fallbackModels: string[]): Promise<string>;
}

/**
 * 战斗模式管理器实现
 */
export class BattleModeManager implements IBattleModeManager {
	private config: BattleModeConfig
	private status: BattleModeStatus
	private listeners: Map<string, Set<EventListener>>
	private isDestroyed: boolean = false

	constructor(config?: Partial<BattleModeConfig>) {
		this.config = this.mergeConfig(config)
		this.status = this.createInitialStatus()
		this.listeners = new Map()
	}

	// ==================== 生命周期管理 ====================

	/**
	 * 初始化战斗模式
	 */
	initialize(config?: Partial<BattleModeConfig>): void {
		if (this.isDestroyed) {
			throw new Error("BattleModeManager has been destroyed and cannot be reinitialized")
		}

		if (config) {
			this.updateConfig(config)
		}

		if (this.config.enabled) {
			this.activate()
		}
	}

	/**
	 * 销毁战斗模式管理器
	 */
	destroy(): void {
		if (this.isDestroyed) {
			return
		}

		this.deactivate()
		this.listeners.clear()
		this.isDestroyed = true
	}

	// ==================== 状态管理 ====================

	/**
	 * 激活战斗模式
	 */
	activate(): void {
		this.checkNotDestroyed()

		if (this.status.state === "active") {
			return
		}

		this.status.state = "active"
		this.status.lastActivatedAt = Date.now()
		this.emit("stateChange", this.status)
	}

	/**
	 * 停用战斗模式
	 */
	deactivate(): void {
		this.checkNotDestroyed()

		if (this.status.state === "inactive") {
			return
		}

		this.status.state = "inactive"
		this.resetErrorCount()
		this.emit("stateChange", this.status)
	}

	/**
	 * 暂停战斗模式
	 */
	pause(): void {
		this.checkNotDestroyed()

		if (this.status.state !== "active") {
			throw new Error("Cannot pause: battle mode is not active")
		}

		this.status.state = "paused"
		this.emit("stateChange", this.status)
	}

	/**
	 * 恢复战斗模式
	 */
	resume(): void {
		this.checkNotDestroyed()

		if (this.status.state !== "paused") {
			throw new Error("Cannot resume: battle mode is not paused")
		}

		this.status.state = "active"
		this.emit("stateChange", this.status)
	}

	/**
	 * 检查战斗模式是否激活
	 */
	isActive(): boolean {
		return this.status.state === "active" && this.config.enabled
	}

	/**
	 * 检查战斗模式是否暂停
	 */
	isPaused(): boolean {
		return this.status.state === "paused"
	}

	// ==================== 错误处理 ====================

	/**
	 * 处理错误
	 */
	async handleError(error: Error, context: ErrorContext): Promise<RecoveryResult> {
		this.checkNotDestroyed()

		// 如果战斗模式未激活，不处理错误
		if (!this.isActive()) {
			return {
				action: "abort",
				details: {
					reason: "Battle mode is not active",
				},
				success: false,
			}
		}

		// 更新错误计数
		this.incrementErrorCount()
		this.status.lastErrorAt = Date.now()
		this.emit("error", { error, context })

		// 确定恢复策略级别
		const strategyLevel = this.determineStrategyLevel(this.status.errorCount)

		const startTime = Date.now()
		let result: RecoveryResult

		try {
			switch (strategyLevel) {
				case "level1":
					result = await this.executeLevel1Strategy(error, context)
					break
				case "level2":
					result = await this.executeLevel2Strategy(error, context)
					break
				case "level3":
					result = await this.executeLevel3Strategy(error, context)
					break
				default:
					result = {
						action: "abort",
						details: {
							reason: "Unknown strategy level",
						},
						success: false,
					}
			}
		} catch (recoveryError) {
			result = {
				action: "abort",
				details: {
					reason: `Recovery failed: ${recoveryError instanceof Error ? recoveryError.message : "Unknown error"}`,
				},
				success: false,
			}
		}

		result.duration = Date.now() - startTime
		result.details.strategyLevel = strategyLevel

		// 更新统计信息
		if (result.success) {
			this.updateRecoveryStats(strategyLevel)
			this.emit("recovery", result)
		}

		return result
	}

	/**
	 * 获取错误计数
	 */
	getErrorCount(): number {
		return this.status.errorCount
	}

	/**
	 * 重置错误计数
	 */
	resetErrorCount(): void {
		this.status.errorCount = 0
		this.status.lastErrorAt = undefined
	}

	// ==================== 配置管理 ====================

	/**
	 * 获取配置
	 */
	getConfig(): BattleModeConfig {
		return { ...this.config }
	}

	/**
	 * 更新配置
	 */
	updateConfig(config: Partial<BattleModeConfig>): void {
		this.checkNotDestroyed()

		this.config = this.mergeConfig(config)
	}

	// ==================== 统计信息 ====================

	/**
	 * 获取状态
	 */
	getStatus(): BattleModeStatus {
		return { ...this.status }
	}

	/**
	 * 获取统计信息
	 */
	getStatistics() {
		return {
			totalErrors: this.status.errorCount,
			totalRecoveries:
				this.status.recoveryStats.level1Count +
				this.status.recoveryStats.level2Count +
				this.status.recoveryStats.level3Count,
			recoveryByLevel: {
				level1: this.status.recoveryStats.level1Count,
				level2: this.status.recoveryStats.level2Count,
				level3: this.status.recoveryStats.level3Count,
			},
			totalModelSwitches: this.status.modelSwitchStats.totalSwitches,
		}
	}

	// ==================== 事件监听 ====================

	/**
	 * 注册事件监听器
	 */
	on(event: "stateChange" | "error" | "recovery" | "modelSwitch", listener: EventListener): void {
		if (!this.listeners.has(event)) {
			this.listeners.set(event, new Set())
		}
		this.listeners.get(event)!.add(listener)
	}

	/**
	 * 移除事件监听器
	 */
	off(event: "stateChange" | "error" | "recovery" | "modelSwitch", listener: EventListener): void {
		const eventListeners = this.listeners.get(event)
		if (eventListeners) {
			eventListeners.delete(listener)
		}
	}

	/**
	 * 触发事件
	 */
	private emit(event: "stateChange" | "error" | "recovery" | "modelSwitch", data: unknown): void {
		const eventListeners = this.listeners.get(event)
		if (eventListeners) {
			eventListeners.forEach((listener) => {
				try {
					listener(data)
				} catch (error) {
					// 防止监听器错误影响主流程
					console.error(`Error in ${event} listener:`, error)
				}
			})
		}
	}

	// ==================== 私有辅助方法 ====================

	/**
	 * 合并配置
	 */
	private mergeConfig(config?: Partial<BattleModeConfig>): BattleModeConfig {
		return {
			enabled: config?.enabled ?? false,
			errorThresholds: {
				level1: config?.errorThresholds?.level1 ?? 3,
				level2: config?.errorThresholds?.level2 ?? 5,
			},
			contextCleanup: {
				keepLastUserMessage: config?.contextCleanup?.keepLastUserMessage ?? true,
				keepLastSystemMessage: config?.contextCleanup?.keepLastSystemMessage ?? true,
				maxMessagesToRemove: config?.contextCleanup?.maxMessagesToRemove ?? 10,
			},
			modelSwitching: {
				fallbackModels: config?.modelSwitching?.fallbackModels ?? [
					"gpt-4o",
					"claude-3-5-sonnet",
					"gemini-1.5-pro",
				],
				maxSwitches: config?.modelSwitching?.maxSwitches ?? 3,
			},
		}
	}

	/**
	 * 创建初始状态
	 */
	private createInitialStatus(): BattleModeStatus {
		return {
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
	}

	/**
	 * 增加错误计数
	 */
	private incrementErrorCount(): void {
		this.status.errorCount++
	}

	/**
	 * 确定恢复策略级别
	 */
	private determineStrategyLevel(errorCount: number): "level1" | "level2" | "level3" {
		if (errorCount < this.config.errorThresholds.level1) {
			return "level1"
		} else if (errorCount < this.config.errorThresholds.level2) {
			return "level2"
		} else {
			return "level3"
		}
	}

	/**
	 * 执行 Level 1 恢复策略（忽略继续）
	 */
	private async executeLevel1Strategy(error: Error, context: ErrorContext): Promise<RecoveryResult> {
		// Level 1: 记录错误，继续执行
		return {
			action: "continue",
			details: {
				reason: `Error count (${this.status.errorCount}) below level 1 threshold (${this.config.errorThresholds.level1}), continuing execution`,
			},
			success: true,
		}
	}

	/**
	 * 执行 Level 2 恢复策略（上下文清理）
	 */
	private async executeLevel2Strategy(error: Error, context: ErrorContext): Promise<RecoveryResult> {
		// Level 2: 清理上下文并重试
		// 注意：实际的上下文清理将在 Phase 4 实现
		// 这里返回一个模拟的结果
		const messagesToRemove = Math.min(
			this.config.contextCleanup.maxMessagesToRemove,
			context.conversationHistory.length,
		)

		return {
			action: "retry",
			details: {
				reason: `Error count (${this.status.errorCount}) reached level 2 threshold, cleaning context and retrying`,
				removedMessages: messagesToRemove,
			},
			success: true,
		}
	}

	/**
	 * 执行 Level 3 恢复策略（模型切换）
	 */
	private async executeLevel3Strategy(error: Error, context: ErrorContext): Promise<RecoveryResult> {
		// Level 3: 切换模型并重试
		// 注意：实际的模型切换将在 Phase 3 实现
		// 这里返回一个模拟的结果
		const { fallbackModels, maxSwitches } = this.config.modelSwitching

		if (this.status.modelSwitchStats.totalSwitches >= maxSwitches) {
			return {
				action: "abort",
				details: {
					reason: `Maximum model switches (${maxSwitches}) reached, aborting`,
				},
				success: false,
			}
		}

		// 使用内部状态中跟踪的当前模型，而不是外部上下文中的
		// 这样可以确保连续切换时使用正确的当前模型
		const currentModel = this.status.modelSwitchStats.currentModel || context.currentModel
		const currentIndex = fallbackModels.indexOf(currentModel)
		const nextModelIndex = (currentIndex + 1) % fallbackModels.length
		const nextModel = fallbackModels[nextModelIndex]

		// 更新模型切换统计
		this.status.modelSwitchStats.totalSwitches++
		this.status.modelSwitchStats.currentModel = nextModel
		this.status.modelSwitchStats.lastSwitchedAt = Date.now()

		this.emit("modelSwitch", {
			fromModel: context.currentModel,
			toModel: nextModel,
			reason: `Error count (${this.status.errorCount}) reached level 3 threshold, switching to fallback model`,
		})

		return {
			action: "switch_model",
			details: {
				reason: `Error count (${this.status.errorCount}) reached level 3 threshold, switching to fallback model`,
				switchedToModel: nextModel,
			},
			success: true,
		}
	}

	/**
	 * 更新恢复统计
	 */
	private updateRecoveryStats(strategyLevel: "level1" | "level2" | "level3"): void {
		switch (strategyLevel) {
			case "level1":
				this.status.recoveryStats.level1Count++
				break
			case "level2":
				this.status.recoveryStats.level2Count++
				break
			case "level3":
				this.status.recoveryStats.level3Count++
				break
		}
	}

	/**
	 * 检查管理器是否已销毁
	 */
	private checkNotDestroyed(): void {
		if (this.isDestroyed) {
			throw new Error("BattleModeManager has been destroyed")
		}
	}
}

/**
 * 创建战斗模式管理器实例
 */
export function createBattleModeManager(config?: Partial<BattleModeConfig>): IBattleModeManager {
	return new BattleModeManager(config)
}
