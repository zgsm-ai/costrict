/**
 * L3 级别错误恢复策略：模型切换
 * 适用于错误计数较高的情况，通过切换到备用模型后重试
 */
import { ErrorRecoveryStrategy } from "../ErrorRecoveryStrategy"
import type { ErrorContext } from "../types/ErrorContext"
import type { RecoveryResult } from "../types/RecoveryResult"
import type { IModelSwitcher } from "../interfaces/IModelSwitcher"
import type { ModelSwitchHistory } from "../interfaces/IModelSwitcher"
import { RecoveryStrategyLevel } from "../interfaces/IErrorRecoveryStrategy"

/**
 * L3 模型切换策略配置
 */
export interface L3ModelSwitchStrategyConfig {
	/** 最小错误计数阈值（低于此值不适用此策略） */
	minErrorCount: number

	/** 最大切换次数 */
	maxSwitches: number

	/** 触发切换的错误类型列表 */
	triggerErrorTypes: string[]

	/** 默认备用模型列表 */
	fallbackModels: string[]

	/** 是否在切换后添加延迟（毫秒） */
	retryDelay?: number

	/** 是否验证新模型可用性 */
	validateBeforeSwitch: boolean
}

/**
 * 默认 L3 策略配置
 */
export const DEFAULT_L3_CONFIG: L3ModelSwitchStrategyConfig = {
	minErrorCount: 5,
	maxSwitches: 3,
	triggerErrorTypes: ["internal error", "model unavailable", "service error", "unavailable", "failed"],
	fallbackModels: ["gpt-4o", "claude-3-5-sonnet", "gemini-1.5-pro"],
	retryDelay: 3000, // 3秒延迟
	validateBeforeSwitch: true,
}

/**
 * L3 模型切换策略
 * 通过调用模型切换器切换到备用模型后重试
 */
export class L3ModelSwitchStrategy extends ErrorRecoveryStrategy {
	/** 策略配置 */
	private config: L3ModelSwitchStrategyConfig

	/** 当前错误计数 */
	private currentErrorCount: number = 0

	/** 模型切换器 */
	private modelSwitcher: IModelSwitcher | null = null

	/** 切换历史 */
	private switchHistory: Array<ModelSwitchHistory & { error: Error }> = []

	/**
	 * 构造函数
	 * @param config - 策略配置
	 * @param modelSwitcher - 模型切换器（可选）
	 */
	constructor(config?: Partial<L3ModelSwitchStrategyConfig>, modelSwitcher?: IModelSwitcher) {
		super(
			"L3ModelSwitchStrategy",
			"L3级别策略：切换到备用模型后重试，适用于错误计数较高的情况",
			3, // 最低优先级
			RecoveryStrategyLevel.Level3,
		)

		this.config = { ...DEFAULT_L3_CONFIG, ...config }
		this.modelSwitcher = modelSwitcher || null
	}

	/**
	 * 设置模型切换器
	 * @param switcher - 模型切换器
	 */
	public setModelSwitcher(switcher: IModelSwitcher): void {
		this.modelSwitcher = switcher
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

		// 检查错误计数是否达到最小阈值
		if (this.currentErrorCount < this.config.minErrorCount) {
			return false
		}

		// 检查是否达到最大切换次数
		if (this.modelSwitcher && this.modelSwitcher.isMaxSwitchesReached()) {
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

		// 检查是否有模型切换器
		if (!this.modelSwitcher) {
			return this.createAbortResult(`未配置模型切换器，无法进行模型切换。当前错误计数: ${this.currentErrorCount}`)
		}

		// 获取备用模型列表
		const fallbackModels = this.modelSwitcher.getFallbackModels()
		if (fallbackModels.length === 0) {
			fallbackModels.push(...this.config.fallbackModels)
		}

		const currentModel = this.modelSwitcher.getCurrentModel()

		try {
			// 执行模型切换
			const newModel = await this.modelSwitcher.switchModel(currentModel, fallbackModels)

			// 如果配置了验证，验证新模型
			if (this.config.validateBeforeSwitch && !(await this.modelSwitcher.validateModel(newModel))) {
				throw new Error(`切换后的模型 ${newModel} 验证失败`)
			}

			// 获取切换历史并记录错误
			const history = this.modelSwitcher.getSwitchHistory()
			const lastSwitch = history[history.length - 1]
			if (lastSwitch) {
				this.switchHistory.push({
					...lastSwitch,
					error,
				})
			}

			// 保持切换历史不超过 20 条
			if (this.switchHistory.length > 20) {
				this.switchHistory.shift()
			}

			// 如果配置了延迟，等待指定时间
			if (this.config.retryDelay && this.config.retryDelay > 0) {
				await this.delay(this.config.retryDelay)
			}

			// 返回模型切换结果
			return this.createSwitchModelResult(
				newModel,
				`已从 ${currentModel} 切换到 ${newModel} 后重试。当前错误计数: ${this.currentErrorCount}，切换次数: ${this.modelSwitcher.getSwitchCount()}`,
			)
		} catch (switchError) {
			// 切换失败，返回错误结果
			throw new Error(`模型切换失败: ${switchError instanceof Error ? switchError.message : String(switchError)}`)
		}
	}

	/**
	 * 检查错误是否触发切换
	 * @param error - 错误对象
	 * @returns 是否触发切换
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
	 * 获取切换历史
	 * @returns 切换历史数组
	 */
	public getSwitchHistory(): Array<ModelSwitchHistory & { error: Error }> {
		return [...this.switchHistory]
	}

	/**
	 * 清除切换历史
	 */
	public clearSwitchHistory(): void {
		this.switchHistory = []
	}

	/**
	 * 更新策略配置
	 * @param config - 新的配置（部分）
	 */
	public updateConfig(config: Partial<L3ModelSwitchStrategyConfig>): void {
		this.config = { ...this.config, ...config }
	}

	/**
	 * 获取当前配置
	 * @returns 当前配置
	 */
	public getConfig(): L3ModelSwitchStrategyConfig {
		return { ...this.config }
	}

	/**
	 * 重置策略状态（包括计数和历史）
	 */
	public override resetStatistics(): void {
		super.resetStatistics()
		this.currentErrorCount = 0
		this.switchHistory = []
	}

	/**
	 * 获取策略是否达到最小错误计数
	 * @returns 是否达到最小值
	 */
	public isMinErrorCountReached(): boolean {
		return this.currentErrorCount >= this.config.minErrorCount
	}

	/**
	 * 获取是否已达到最大切换次数
	 * @returns 是否达到最大次数
	 */
	public isMaxSwitchesReached(): boolean {
		return this.modelSwitcher ? this.modelSwitcher.isMaxSwitchesReached() : false
	}

	/**
	 * 获取当前切换次数
	 * @returns 切换次数
	 */
	public getSwitchCount(): number {
		return this.modelSwitcher ? this.modelSwitcher.getSwitchCount() : 0
	}

	/**
	 * 获取当前模型
	 * @returns 当前模型ID
	 */
	public getCurrentModel(): string {
		return this.modelSwitcher ? this.modelSwitcher.getCurrentModel() : ""
	}
}
