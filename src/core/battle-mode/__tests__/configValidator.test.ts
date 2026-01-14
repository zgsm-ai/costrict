/**
 * 配置验证器单元测试
 * 测试战斗模式配置的各种验证场景
 */
import { describe, test, expect, beforeEach } from "vitest"
import { BattleModeConfigValidator, type ValidationResult } from "../configValidator"
import { BATTLE_MODE_CONST } from "../../costrict/base/common/constant"
import type { BattleModeConfig } from "../types/BattleModeConfig"

describe("BattleModeConfigValidator", () => {
	describe("validate - 完整配置验证", () => {
		test("应该接受有效的默认配置", () => {
			const config: BattleModeConfig = {
				enabled: true,
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
					fallbackModels: ["gpt-4o", "claude-3-5-sonnet"],
					maxSwitches: 3,
				},
			}

			const result: ValidationResult = BattleModeConfigValidator.validate(config)

			expect(result.isValid).toBe(true)
			expect(result.errors).toHaveLength(0)
		})

		test("应该拒绝无效的 enabled 类型", () => {
			const config: any = {
				enabled: "true",
				errorThresholds: { level1: 3, level2: 5 },
				contextCleanup: {
					keepLastUserMessage: true,
					keepLastSystemMessage: true,
					maxMessagesToRemove: 10,
				},
				modelSwitching: {
					fallbackModels: ["gpt-4o"],
					maxSwitches: 3,
				},
			}

			const result: ValidationResult = BattleModeConfigValidator.validate(config)

			expect(result.isValid).toBe(false)
			expect(result.errors).toContain("enabled 字段必须是布尔值")
		})

		test("应该拒绝 level1 阈值小于最小值", () => {
			const config: BattleModeConfig = {
				enabled: true,
				errorThresholds: {
					level1: 0,
					level2: 5,
				},
				contextCleanup: {
					keepLastUserMessage: true,
					keepLastSystemMessage: true,
					maxMessagesToRemove: 10,
				},
				modelSwitching: {
					fallbackModels: ["gpt-4o"],
					maxSwitches: 3,
				},
			}

			const result: ValidationResult = BattleModeConfigValidator.validate(config)

			expect(result.isValid).toBe(false)
			expect(result.errors.some((e) => e.includes("errorThresholds.level1"))).toBe(true)
		})

		test("应该拒绝 level1 大于 level2", () => {
			const config: BattleModeConfig = {
				enabled: true,
				errorThresholds: {
					level1: 5,
					level2: 3,
				},
				contextCleanup: {
					keepLastUserMessage: true,
					keepLastSystemMessage: true,
					maxMessagesToRemove: 10,
				},
				modelSwitching: {
					fallbackModels: ["gpt-4o"],
					maxSwitches: 3,
				},
			}

			const result: ValidationResult = BattleModeConfigValidator.validate(config)

			expect(result.isValid).toBe(false)
			expect(result.errors).toContain("errorThresholds.level1 必须小于 errorThresholds.level2")
		})

		test("应该拒绝空备用模型列表", () => {
			const config: BattleModeConfig = {
				enabled: true,
				errorThresholds: { level1: 3, level2: 5 },
				contextCleanup: {
					keepLastUserMessage: true,
					keepLastSystemMessage: true,
					maxMessagesToRemove: 10,
				},
				modelSwitching: {
					fallbackModels: [],
					maxSwitches: 3,
				},
			}

			const result: ValidationResult = BattleModeConfigValidator.validate(config)

			expect(result.isValid).toBe(false)
			expect(result.errors).toContain("modelSwitching.fallbackModels 不能为空数组")
		})

		test("应该检测重复的备用模型", () => {
			const config: BattleModeConfig = {
				enabled: true,
				errorThresholds: { level1: 3, level2: 5 },
				contextCleanup: {
					keepLastUserMessage: true,
					keepLastSystemMessage: true,
					maxMessagesToRemove: 10,
				},
				modelSwitching: {
					fallbackModels: ["gpt-4o", "gpt-4o", "claude-3-5-sonnet"],
					maxSwitches: 3,
				},
			}

			const result: ValidationResult = BattleModeConfigValidator.validate(config)

			expect(result.isValid).toBe(false)
			expect(result.errors).toContain("modelSwitching.fallbackModels 包含重复的模型 ID")
		})

		test("应该警告 maxSwitches 大于备用模型数量", () => {
			const config: BattleModeConfig = {
				enabled: true,
				errorThresholds: { level1: 3, level2: 5 },
				contextCleanup: {
					keepLastUserMessage: true,
					keepLastSystemMessage: true,
					maxMessagesToRemove: 10,
				},
				modelSwitching: {
					fallbackModels: ["gpt-4o"],
					maxSwitches: 3,
				},
			}

			const result: ValidationResult = BattleModeConfigValidator.validate(config)

			expect(result.warnings).toContain(
				"modelSwitching.maxSwitches (3) 大于备用模型数量 (1)，可能无法完成所有切换",
			)
		})
	})

	describe("validateL1Strategy - L1 策略验证", () => {
		test("应该接受有效的 L1 策略配置", () => {
			const config = {
				maxErrorCount: 3,
				toleratedErrorTypes: ["timeout", "network error"],
				logToleratedErrors: true,
				retryDelay: 1000,
			}

			const result: ValidationResult = BattleModeConfigValidator.validateL1Strategy(config)

			expect(result.isValid).toBe(true)
			expect(result.errors).toHaveLength(0)
		})

		test("应该拒绝 maxErrorCount 小于等于 0", () => {
			const config = {
				maxErrorCount: 0,
				toleratedErrorTypes: ["timeout"],
				logToleratedErrors: true,
			}

			const result: ValidationResult = BattleModeConfigValidator.validateL1Strategy(config)

			expect(result.isValid).toBe(false)
			expect(result.errors).toContain("maxErrorCount 必须大于 0")
		})

		test("应该警告空错误类型列表", () => {
			const config = {
				maxErrorCount: 3,
				toleratedErrorTypes: [],
				logToleratedErrors: true,
			}

			const result: ValidationResult = BattleModeConfigValidator.validateL1Strategy(config)

			expect(result.warnings).toContain("toleratedErrorTypes 为空，所有错误都将被忽略")
		})

		test("应该检测重复的错误类型", () => {
			const config = {
				maxErrorCount: 3,
				toleratedErrorTypes: ["timeout", "timeout", "network error"],
				logToleratedErrors: true,
			}

			const result: ValidationResult = BattleModeConfigValidator.validateL1Strategy(config)

			expect(result.warnings).toContain("toleratedErrorTypes 包含重复的错误类型")
		})

		test("应该拒绝负数的 retryDelay", () => {
			const config = {
				maxErrorCount: 3,
				toleratedErrorTypes: ["timeout"],
				logToleratedErrors: true,
				retryDelay: -100,
			}

			const result: ValidationResult = BattleModeConfigValidator.validateL1Strategy(config)

			expect(result.isValid).toBe(false)
			expect(result.errors).toContain("retryDelay 不能为负数")
		})
	})

	describe("validateL2Strategy - L2 策略验证", () => {
		test("应该接受有效的 L2 策略配置", () => {
			const config = {
				minErrorCount: 3,
				maxErrorCount: 5,
				triggerErrorTypes: ["context window", "token limit"],
				keepLastUserMessage: true,
				keepSystemMessages: true,
				maxMessagesToRemove: 10,
				retryDelay: 2000,
			}

			const result: ValidationResult = BattleModeConfigValidator.validateL2Strategy(config)

			expect(result.isValid).toBe(true)
			expect(result.errors).toHaveLength(0)
		})

		test("应该拒绝 minErrorCount 大于等于 maxErrorCount", () => {
			const config = {
				minErrorCount: 5,
				maxErrorCount: 5,
				triggerErrorTypes: ["context window"],
				keepLastUserMessage: true,
				keepSystemMessages: true,
				maxMessagesToRemove: 10,
			}

			const result: ValidationResult = BattleModeConfigValidator.validateL2Strategy(config)

			expect(result.isValid).toBe(false)
			expect(result.errors).toContain("minErrorCount 必须小于 maxErrorCount")
		})

		test("应该拒绝空的 triggerErrorTypes", () => {
			const config = {
				minErrorCount: 3,
				maxErrorCount: 5,
				triggerErrorTypes: [],
				keepLastUserMessage: true,
				keepSystemMessages: true,
				maxMessagesToRemove: 10,
			}

			const result: ValidationResult = BattleModeConfigValidator.validateL2Strategy(config)

			expect(result.isValid).toBe(false)
			expect(result.errors).toContain("triggerErrorTypes 不能为空数组")
		})

		test("应该警告同时禁用保留选项", () => {
			const config = {
				minErrorCount: 3,
				maxErrorCount: 5,
				triggerErrorTypes: ["context window"],
				keepLastUserMessage: false,
				keepSystemMessages: false,
				maxMessagesToRemove: 10,
			}

			const result: ValidationResult = BattleModeConfigValidator.validateL2Strategy(config)

			expect(result.warnings).toContain("同时禁用 keepLastUserMessage 和 keepSystemMessages 可能导致上下文丢失")
		})

		test("应该警告过大的 maxMessagesToRemove", () => {
			const config = {
				minErrorCount: 3,
				maxErrorCount: 5,
				triggerErrorTypes: ["context window"],
				keepLastUserMessage: true,
				keepSystemMessages: true,
				maxMessagesToRemove: 150,
			}

			const result: ValidationResult = BattleModeConfigValidator.validateL2Strategy(config)

			expect(result.warnings).toContain("maxMessagesToRemove 建议不超过 100")
		})
	})

	describe("validateL3Strategy - L3 策略验证", () => {
		test("应该接受有效的 L3 策略配置", () => {
			const config = {
				minErrorCount: 5,
				maxSwitches: 3,
				triggerErrorTypes: ["internal error", "model unavailable"],
				fallbackModels: ["gpt-4o", "claude-3-5-sonnet", "gemini-1.5-pro"],
				retryDelay: 3000,
				validateBeforeSwitch: true,
			}

			const result: ValidationResult = BattleModeConfigValidator.validateL3Strategy(config)

			expect(result.isValid).toBe(true)
			expect(result.errors).toHaveLength(0)
		})

		test("应该拒绝空的 fallbackModels", () => {
			const config = {
				minErrorCount: 5,
				maxSwitches: 3,
				triggerErrorTypes: ["internal error"],
				fallbackModels: [],
				validateBeforeSwitch: true,
			}

			const result: ValidationResult = BattleModeConfigValidator.validateL3Strategy(config)

			expect(result.isValid).toBe(false)
			expect(result.errors).toContain("fallbackModels 不能为空数组")
		})

		test("应该检测重复的备用模型", () => {
			const config = {
				minErrorCount: 5,
				maxSwitches: 3,
				triggerErrorTypes: ["internal error"],
				fallbackModels: ["gpt-4o", "gpt-4o", "claude-3-5-sonnet"],
				validateBeforeSwitch: true,
			}

			const result: ValidationResult = BattleModeConfigValidator.validateL3Strategy(config)

			expect(result.warnings).toContain("fallbackModels 包含重复的模型 ID")
		})

		test("应该警告 maxSwitches 大于备用模型数量", () => {
			const config = {
				minErrorCount: 5,
				maxSwitches: 5,
				triggerErrorTypes: ["internal error"],
				fallbackModels: ["gpt-4o", "claude-3-5-sonnet"],
				validateBeforeSwitch: true,
			}

			const result: ValidationResult = BattleModeConfigValidator.validateL3Strategy(config)

			expect(result.warnings).toContain("maxSwitches (5) 大于备用模型数量 (2)，可能无法完成所有切换")
		})

		test("应该拒绝过大的 maxSwitches", () => {
			const config = {
				minErrorCount: 5,
				maxSwitches: 15,
				triggerErrorTypes: ["internal error"],
				fallbackModels: ["gpt-4o"],
				validateBeforeSwitch: true,
			}

			const result: ValidationResult = BattleModeConfigValidator.validateL3Strategy(config)

			expect(result.warnings).toContain("maxSwitches 建议不超过 10")
		})
	})

	describe("formatValidationErrors - 格式化错误信息", () => {
		test("应该正确格式化错误和警告", () => {
			const result: ValidationResult = {
				isValid: false,
				errors: ["错误1", "错误2"],
				warnings: ["警告1"],
			}

			const formatted = BattleModeConfigValidator.formatValidationErrors(result)

			expect(formatted).toContain("错误:")
			expect(formatted).toContain("  - 错误1")
			expect(formatted).toContain("  - 错误2")
			expect(formatted).toContain("警告:")
			expect(formatted).toContain("  - 警告1")
		})

		test("应该正确处理只有错误的情况", () => {
			const result: ValidationResult = {
				isValid: false,
				errors: ["错误1"],
				warnings: [],
			}

			const formatted = BattleModeConfigValidator.formatValidationErrors(result)

			expect(formatted).toContain("错误:")
			expect(formatted).toContain("  - 错误1")
			expect(formatted).not.toContain("警告:")
		})

		test("应该正确处理只有警告的情况", () => {
			const result: ValidationResult = {
				isValid: true,
				errors: [],
				warnings: ["警告1"],
			}

			const formatted = BattleModeConfigValidator.formatValidationErrors(result)

			expect(formatted).not.toContain("错误:")
			expect(formatted).toContain("警告:")
			expect(formatted).toContain("  - 警告1")
		})
	})

	describe("throwIfInvalid - 抛出验证错误", () => {
		test("应该在配置无效时抛出错误", () => {
			const result: ValidationResult = {
				isValid: false,
				errors: ["错误1", "错误2"],
				warnings: ["警告1"],
			}

			expect(() => {
				BattleModeConfigValidator.throwIfInvalid(result)
			}).toThrow()
		})

		test("应该在配置有效时不抛出错误", () => {
			const result: ValidationResult = {
				isValid: true,
				errors: [],
				warnings: [],
			}

			expect(() => {
				BattleModeConfigValidator.throwIfInvalid(result)
			}).not.toThrow()
		})

		test("抛出的错误应包含格式化的错误信息", () => {
			const result: ValidationResult = {
				isValid: false,
				errors: ["配置错误"],
				warnings: [],
			}

			expect(() => {
				BattleModeConfigValidator.throwIfInvalid(result)
			}).toThrow()

			try {
				BattleModeConfigValidator.throwIfInvalid(result)
			} catch (error) {
				expect(error).toBeInstanceOf(Error)
				expect((error as Error).message).toContain("错误:")
			}
		})
	})

	describe("边缘情况测试", () => {
		test("应该处理非布尔值类型的 keepLastUserMessage", () => {
			const config: any = {
				enabled: true,
				errorThresholds: { level1: 3, level2: 5 },
				contextCleanup: {
					keepLastUserMessage: "true",
					keepLastSystemMessage: true,
					maxMessagesToRemove: 10,
				},
				modelSwitching: {
					fallbackModels: ["gpt-4o"],
					maxSwitches: 3,
				},
			}

			const result: ValidationResult = BattleModeConfigValidator.validate(config)

			expect(result.isValid).toBe(false)
			expect(result.errors).toContain("contextCleanup.keepLastUserMessage 必须是布尔值")
		})

		test("应该处理非数字类型的阈值", () => {
			const config: any = {
				enabled: true,
				errorThresholds: { level1: "3", level2: 5 },
				contextCleanup: {
					keepLastUserMessage: true,
					keepLastSystemMessage: true,
					maxMessagesToRemove: 10,
				},
				modelSwitching: {
					fallbackModels: ["gpt-4o"],
					maxSwitches: 3,
				},
			}

			const result: ValidationResult = BattleModeConfigValidator.validate(config)

			expect(result.isValid).toBe(false)
			expect(result.errors).toContain("errorThresholds.level1 必须是数字")
		})

		test("应该处理空字符串模型 ID", () => {
			const config: BattleModeConfig = {
				enabled: true,
				errorThresholds: { level1: 3, level2: 5 },
				contextCleanup: {
					keepLastUserMessage: true,
					keepLastSystemMessage: true,
					maxMessagesToRemove: 10,
				},
				modelSwitching: {
					fallbackModels: ["gpt-4o", "", "claude-3-5-sonnet"],
					maxSwitches: 3,
				},
			}

			const result: ValidationResult = BattleModeConfigValidator.validate(config)

			expect(result.isValid).toBe(false)
			expect(result.errors).toContain("modelSwitching.fallbackModels[1] 不能为空字符串")
		})

		test("应该处理非字符串类型的模型 ID", () => {
			const config: any = {
				enabled: true,
				errorThresholds: { level1: 3, level2: 5 },
				contextCleanup: {
					keepLastUserMessage: true,
					keepLastSystemMessage: true,
					maxMessagesToRemove: 10,
				},
				modelSwitching: {
					fallbackModels: ["gpt-4o", 123, "claude-3-5-sonnet"],
					maxSwitches: 3,
				},
			}

			const result: ValidationResult = BattleModeConfigValidator.validate(config)

			expect(result.isValid).toBe(false)
			expect(result.errors).toContain("modelSwitching.fallbackModels[1] 必须是字符串")
		})
	})

	describe("常量验证范围测试", () => {
		test("应该使用 BATTLE_MODE_CONST 中的验证限制", () => {
			const { validation } = BATTLE_MODE_CONST

			expect(validation.minLevel1Threshold).toBeDefined()
			expect(validation.maxLevel1Threshold).toBeDefined()
			expect(validation.minLevel2Threshold).toBeDefined()
			expect(validation.maxLevel2Threshold).toBeDefined()
			expect(validation.minMaxSwitches).toBeDefined()
			expect(validation.maxMaxSwitches).toBeDefined()
			expect(validation.minMaxMessagesToRemove).toBeDefined()
			expect(validation.maxMaxMessagesToRemove).toBeDefined()
		})

		test("验证限制应该具有合理的范围", () => {
			const { validation } = BATTLE_MODE_CONST

			expect(validation.minLevel1Threshold).toBeGreaterThan(0)
			expect(validation.maxLevel1Threshold).toBeGreaterThan(validation.minLevel1Threshold)
			expect(validation.minLevel2Threshold).toBeGreaterThan(validation.minLevel1Threshold)
			expect(validation.maxLevel2Threshold).toBeGreaterThan(validation.minLevel2Threshold)
			expect(validation.minMaxSwitches).toBeGreaterThan(0)
			expect(validation.maxMaxSwitches).toBeGreaterThan(validation.minMaxSwitches)
		})
	})
})
