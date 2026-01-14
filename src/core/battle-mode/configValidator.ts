/**
 * 战斗模式配置验证器
 * 提供战斗模式配置的验证功能
 */
import { BATTLE_MODE_CONST } from "../costrict/base/common/constant"
import type { BattleModeConfig } from "./types/BattleModeConfig"

/**
 * 配置验证结果
 */
export interface ValidationResult {
	/** 是否有效 */
	isValid: boolean
	/** 错误信息列表 */
	errors: string[]
	/** 警告信息列表 */
	warnings: string[]
}

/**
 * 配置验证器类
 */
export class BattleModeConfigValidator {
	/**
	 * 验证完整的战斗模式配置
	 * @param config - 待验证的配置
	 * @returns 验证结果
	 */
	public static validate(config: BattleModeConfig): ValidationResult {
		const errors: string[] = []
		const warnings: string[] = []

		// 验证 enabled 字段
		if (typeof config.enabled !== "boolean") {
			errors.push("enabled 字段必须是布尔值")
		}

		// 验证 errorThresholds 配置
		this.validateErrorThresholds(config.errorThresholds, errors, warnings)

		// 验证 contextCleanup 配置
		this.validateContextCleanup(config.contextCleanup, errors, warnings)

		// 验证 modelSwitching 配置
		this.validateModelSwitching(config.modelSwitching, errors, warnings)

		return {
			isValid: errors.length === 0,
			errors,
			warnings,
		}
	}

	/**
	 * 验证错误阈值配置
	 * @param thresholds - 错误阈值配置
	 * @param errors - 错误列表
	 * @param warnings - 警告列表
	 */
	private static validateErrorThresholds(
		thresholds: { level1: number; level2: number },
		errors: string[],
		warnings: string[],
	): void {
		const { minLevel1Threshold, maxLevel1Threshold, minLevel2Threshold, maxLevel2Threshold } =
			BATTLE_MODE_CONST.validation

		// 验证 level1 阈值
		if (typeof thresholds.level1 !== "number") {
			errors.push("errorThresholds.level1 必须是数字")
		} else if (thresholds.level1 < minLevel1Threshold) {
			errors.push(`errorThresholds.level1 不能小于 ${minLevel1Threshold}`)
		} else if (thresholds.level1 > maxLevel1Threshold) {
			errors.push(`errorThresholds.level1 不能大于 ${maxLevel1Threshold}`)
		} else if (thresholds.level1 <= 0) {
			errors.push("errorThresholds.level1 必须大于 0")
		}

		// 验证 level2 阈值
		if (typeof thresholds.level2 !== "number") {
			errors.push("errorThresholds.level2 必须是数字")
		} else if (thresholds.level2 < minLevel2Threshold) {
			errors.push(`errorThresholds.level2 不能小于 ${minLevel2Threshold}`)
		} else if (thresholds.level2 > maxLevel2Threshold) {
			errors.push(`errorThresholds.level2 不能大于 ${maxLevel2Threshold}`)
		} else if (thresholds.level2 <= 0) {
			errors.push("errorThresholds.level2 必须大于 0")
		}

		// 验证阈值关系
		if (typeof thresholds.level1 === "number" && typeof thresholds.level2 === "number") {
			if (thresholds.level1 >= thresholds.level2) {
				errors.push("errorThresholds.level1 必须小于 errorThresholds.level2")
			}
		}
	}

	/**
	 * 验证上下文清理配置
	 * @param cleanup - 上下文清理配置
	 * @param errors - 错误列表
	 * @param warnings - 警告列表
	 */
	private static validateContextCleanup(
		cleanup: {
			keepLastUserMessage: boolean
			keepLastSystemMessage: boolean
			maxMessagesToRemove: number
		},
		errors: string[],
		warnings: string[],
	): void {
		const { minMaxMessagesToRemove, maxMaxMessagesToRemove } = BATTLE_MODE_CONST.validation

		// 验证 keepLastUserMessage
		if (typeof cleanup.keepLastUserMessage !== "boolean") {
			errors.push("contextCleanup.keepLastUserMessage 必须是布尔值")
		}

		// 验证 keepLastSystemMessage
		if (typeof cleanup.keepLastSystemMessage !== "boolean") {
			errors.push("contextCleanup.keepLastSystemMessage 必须是布尔值")
		}

		// 验证 maxMessagesToRemove
		if (typeof cleanup.maxMessagesToRemove !== "number") {
			errors.push("contextCleanup.maxMessagesToRemove 必须是数字")
		} else if (cleanup.maxMessagesToRemove < minMaxMessagesToRemove) {
			errors.push(`contextCleanup.maxMessagesToRemove 不能小于 ${minMaxMessagesToRemove}`)
		} else if (cleanup.maxMessagesToRemove > maxMaxMessagesToRemove) {
			errors.push(`contextCleanup.maxMessagesToRemove 不能大于 ${maxMaxMessagesToRemove}`)
		} else if (cleanup.maxMessagesToRemove <= 0) {
			errors.push("contextCleanup.maxMessagesToRemove 必须大于 0")
		} else if (cleanup.maxMessagesToRemove > 100) {
			warnings.push("contextCleanup.maxMessagesToRemove 建议不超过 100")
		}

		// 验证保留配置的合理性
		if (
			typeof cleanup.keepLastUserMessage === "boolean" &&
			typeof cleanup.keepLastSystemMessage === "boolean" &&
			!cleanup.keepLastUserMessage &&
			!cleanup.keepLastSystemMessage
		) {
			warnings.push("同时禁用 keepLastUserMessage 和 keepLastSystemMessage 可能导致上下文丢失")
		}
	}

	/**
	 * 验证模型切换配置
	 * @param switching - 模型切换配置
	 * @param errors - 错误列表
	 * @param warnings - 警告列表
	 */
	private static validateModelSwitching(
		switching: {
			fallbackModels: string[]
			maxSwitches: number
		},
		errors: string[],
		warnings: string[],
	): void {
		const { minMaxSwitches, maxMaxSwitches } = BATTLE_MODE_CONST.validation

		// 验证 fallbackModels
		if (!Array.isArray(switching.fallbackModels)) {
			errors.push("modelSwitching.fallbackModels 必须是数组")
		} else if (switching.fallbackModels.length === 0) {
			errors.push("modelSwitching.fallbackModels 不能为空数组")
		} else {
			// 验证每个模型 ID
			switching.fallbackModels.forEach((model, index) => {
				if (typeof model !== "string") {
					errors.push(`modelSwitching.fallbackModels[${index}] 必须是字符串`)
				} else if (model.trim().length === 0) {
					errors.push(`modelSwitching.fallbackModels[${index}] 不能为空字符串`)
				}
			})

			// 检查重复的模型 ID
			const uniqueModels = new Set(switching.fallbackModels)
			if (uniqueModels.size !== switching.fallbackModels.length) {
				errors.push("modelSwitching.fallbackModels 包含重复的模型 ID")
			}
		}

		// 验证 maxSwitches
		if (typeof switching.maxSwitches !== "number") {
			errors.push("modelSwitching.maxSwitches 必须是数字")
		} else if (switching.maxSwitches < minMaxSwitches) {
			errors.push(`modelSwitching.maxSwitches 不能小于 ${minMaxSwitches}`)
		} else if (switching.maxSwitches > maxMaxSwitches) {
			errors.push(`modelSwitching.maxSwitches 不能大于 ${maxMaxSwitches}`)
		} else if (switching.maxSwitches <= 0) {
			errors.push("modelSwitching.maxSwitches 必须大于 0")
		}

		// 验证切换次数与备用模型数量的关系
		if (
			Array.isArray(switching.fallbackModels) &&
			typeof switching.maxSwitches === "number" &&
			switching.maxSwitches > switching.fallbackModels.length
		) {
			warnings.push(
				`modelSwitching.maxSwitches (${switching.maxSwitches}) 大于备用模型数量 (${switching.fallbackModels.length})，可能无法完成所有切换`,
			)
		}
	}

	/**
	 * 验证 L1 策略配置
	 * @param config - L1 策略配置
	 * @returns 验证结果
	 */
	public static validateL1Strategy(config: {
		maxErrorCount: number
		toleratedErrorTypes: string[]
		logToleratedErrors: boolean
		retryDelay?: number
	}): ValidationResult {
		const errors: string[] = []
		const warnings: string[] = []

		// 验证 maxErrorCount
		if (typeof config.maxErrorCount !== "number") {
			errors.push("maxErrorCount 必须是数字")
		} else if (config.maxErrorCount <= 0) {
			errors.push("maxErrorCount 必须大于 0")
		} else if (config.maxErrorCount > 20) {
			warnings.push("maxErrorCount 建议不超过 20")
		}

		// 验证 toleratedErrorTypes
		if (!Array.isArray(config.toleratedErrorTypes)) {
			errors.push("toleratedErrorTypes 必须是数组")
		} else if (config.toleratedErrorTypes.length === 0) {
			warnings.push("toleratedErrorTypes 为空，所有错误都将被忽略")
		} else {
			// 验证每个错误类型
			config.toleratedErrorTypes.forEach((type, index) => {
				if (typeof type !== "string") {
					errors.push(`toleratedErrorTypes[${index}] 必须是字符串`)
				} else if (type.trim().length === 0) {
					errors.push(`toleratedErrorTypes[${index}] 不能为空字符串`)
				}
			})

			// 检查重复的错误类型
			const uniqueTypes = new Set(config.toleratedErrorTypes)
			if (uniqueTypes.size !== config.toleratedErrorTypes.length) {
				warnings.push("toleratedErrorTypes 包含重复的错误类型")
			}
		}

		// 验证 logToleratedErrors
		if (typeof config.logToleratedErrors !== "boolean") {
			errors.push("logToleratedErrors 必须是布尔值")
		}

		// 验证 retryDelay
		if (config.retryDelay !== undefined) {
			if (typeof config.retryDelay !== "number") {
				errors.push("retryDelay 必须是数字")
			} else if (config.retryDelay < 0) {
				errors.push("retryDelay 不能为负数")
			} else if (config.retryDelay > 10000) {
				warnings.push("retryDelay 建议不超过 10000ms")
			}
		}

		return {
			isValid: errors.length === 0,
			errors,
			warnings,
		}
	}

	/**
	 * 验证 L2 策略配置
	 * @param config - L2 策略配置
	 * @returns 验证结果
	 */
	public static validateL2Strategy(config: {
		minErrorCount: number
		maxErrorCount: number
		triggerErrorTypes: string[]
		keepLastUserMessage: boolean
		keepSystemMessages: boolean
		maxMessagesToRemove: number
		retryDelay?: number
	}): ValidationResult {
		const errors: string[] = []
		const warnings: string[] = []

		// 验证 minErrorCount
		if (typeof config.minErrorCount !== "number") {
			errors.push("minErrorCount 必须是数字")
		} else if (config.minErrorCount <= 0) {
			errors.push("minErrorCount 必须大于 0")
		}

		// 验证 maxErrorCount
		if (typeof config.maxErrorCount !== "number") {
			errors.push("maxErrorCount 必须是数字")
		} else if (config.maxErrorCount <= 0) {
			errors.push("maxErrorCount 必须大于 0")
		}

		// 验证阈值关系
		if (typeof config.minErrorCount === "number" && typeof config.maxErrorCount === "number") {
			if (config.minErrorCount >= config.maxErrorCount) {
				errors.push("minErrorCount 必须小于 maxErrorCount")
			}
		}

		// 验证 triggerErrorTypes
		if (!Array.isArray(config.triggerErrorTypes)) {
			errors.push("triggerErrorTypes 必须是数组")
		} else if (config.triggerErrorTypes.length === 0) {
			errors.push("triggerErrorTypes 不能为空数组")
		} else {
			// 验证每个错误类型
			config.triggerErrorTypes.forEach((type, index) => {
				if (typeof type !== "string") {
					errors.push(`triggerErrorTypes[${index}] 必须是字符串`)
				} else if (type.trim().length === 0) {
					errors.push(`triggerErrorTypes[${index}] 不能为空字符串`)
				}
			})
		}

		// 验证 keepLastUserMessage
		if (typeof config.keepLastUserMessage !== "boolean") {
			errors.push("keepLastUserMessage 必须是布尔值")
		}

		// 验证 keepSystemMessages
		if (typeof config.keepSystemMessages !== "boolean") {
			errors.push("keepSystemMessages 必须是布尔值")
		}

		// 验证 maxMessagesToRemove
		if (typeof config.maxMessagesToRemove !== "number") {
			errors.push("maxMessagesToRemove 必须是数字")
		} else if (config.maxMessagesToRemove <= 0) {
			errors.push("maxMessagesToRemove 必须大于 0")
		} else if (config.maxMessagesToRemove > 100) {
			warnings.push("maxMessagesToRemove 建议不超过 100")
		}

		// 验证保留配置的合理性
		if (
			typeof config.keepLastUserMessage === "boolean" &&
			typeof config.keepSystemMessages === "boolean" &&
			!config.keepLastUserMessage &&
			!config.keepSystemMessages
		) {
			warnings.push("同时禁用 keepLastUserMessage 和 keepSystemMessages 可能导致上下文丢失")
		}

		// 验证 retryDelay
		if (config.retryDelay !== undefined) {
			if (typeof config.retryDelay !== "number") {
				errors.push("retryDelay 必须是数字")
			} else if (config.retryDelay < 0) {
				errors.push("retryDelay 不能为负数")
			} else if (config.retryDelay > 10000) {
				warnings.push("retryDelay 建议不超过 10000ms")
			}
		}

		return {
			isValid: errors.length === 0,
			errors,
			warnings,
		}
	}

	/**
	 * 验证 L3 策略配置
	 * @param config - L3 策略配置
	 * @returns 验证结果
	 */
	public static validateL3Strategy(config: {
		minErrorCount: number
		maxSwitches: number
		triggerErrorTypes: string[]
		fallbackModels: string[]
		retryDelay?: number
		validateBeforeSwitch: boolean
	}): ValidationResult {
		const errors: string[] = []
		const warnings: string[] = []

		// 验证 minErrorCount
		if (typeof config.minErrorCount !== "number") {
			errors.push("minErrorCount 必须是数字")
		} else if (config.minErrorCount <= 0) {
			errors.push("minErrorCount 必须大于 0")
		}

		// 验证 maxSwitches
		if (typeof config.maxSwitches !== "number") {
			errors.push("maxSwitches 必须是数字")
		} else if (config.maxSwitches <= 0) {
			errors.push("maxSwitches 必须大于 0")
		} else if (config.maxSwitches > 10) {
			warnings.push("maxSwitches 建议不超过 10")
		}

		// 验证 triggerErrorTypes
		if (!Array.isArray(config.triggerErrorTypes)) {
			errors.push("triggerErrorTypes 必须是数组")
		} else if (config.triggerErrorTypes.length === 0) {
			errors.push("triggerErrorTypes 不能为空数组")
		} else {
			// 验证每个错误类型
			config.triggerErrorTypes.forEach((type, index) => {
				if (typeof type !== "string") {
					errors.push(`triggerErrorTypes[${index}] 必须是字符串`)
				} else if (type.trim().length === 0) {
					errors.push(`triggerErrorTypes[${index}] 不能为空字符串`)
				}
			})
		}

		// 验证 fallbackModels
		if (!Array.isArray(config.fallbackModels)) {
			errors.push("fallbackModels 必须是数组")
		} else if (config.fallbackModels.length === 0) {
			errors.push("fallbackModels 不能为空数组")
		} else {
			// 验证每个模型 ID
			config.fallbackModels.forEach((model, index) => {
				if (typeof model !== "string") {
					errors.push(`fallbackModels[${index}] 必须是字符串`)
				} else if (model.trim().length === 0) {
					errors.push(`fallbackModels[${index}] 不能为空字符串`)
				}
			})

			// 检查重复的模型 ID
			const uniqueModels = new Set(config.fallbackModels)
			if (uniqueModels.size !== config.fallbackModels.length) {
				warnings.push("fallbackModels 包含重复的模型 ID")
			}
		}

		// 验证切换次数与备用模型数量的关系
		if (
			Array.isArray(config.fallbackModels) &&
			typeof config.maxSwitches === "number" &&
			config.maxSwitches > config.fallbackModels.length
		) {
			warnings.push(
				`maxSwitches (${config.maxSwitches}) 大于备用模型数量 (${config.fallbackModels.length})，可能无法完成所有切换`,
			)
		}

		// 验证 retryDelay
		if (config.retryDelay !== undefined) {
			if (typeof config.retryDelay !== "number") {
				errors.push("retryDelay 必须是数字")
			} else if (config.retryDelay < 0) {
				errors.push("retryDelay 不能为负数")
			} else if (config.retryDelay > 10000) {
				warnings.push("retryDelay 建议不超过 10000ms")
			}
		}

		// 验证 validateBeforeSwitch
		if (typeof config.validateBeforeSwitch !== "boolean") {
			errors.push("validateBeforeSwitch 必须是布尔值")
		}

		return {
			isValid: errors.length === 0,
			errors,
			warnings,
		}
	}

	/**
	 * 格式化验证错误信息
	 * @param result - 验证结果
	 * @returns 格式化的错误信息字符串
	 */
	public static formatValidationErrors(result: ValidationResult): string {
		const messages: string[] = []

		if (result.errors.length > 0) {
			messages.push("错误:")
			result.errors.forEach((error) => {
				messages.push(`  - ${error}`)
			})
		}

		if (result.warnings.length > 0) {
			messages.push("警告:")
			result.warnings.forEach((warning) => {
				messages.push(`  - ${warning}`)
			})
		}

		return messages.join("\n")
	}

	/**
	 * 抛出验证错误（如果存在）
	 * @param result - 验证结果
	 * @throws 如果验证失败，抛出错误
	 */
	public static throwIfInvalid(result: ValidationResult): void {
		if (!result.isValid) {
			throw new Error(this.formatValidationErrors(result))
		}
	}
}
