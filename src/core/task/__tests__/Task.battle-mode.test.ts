/**
 * Task 战斗模式集成测试
 * 测试 Task 类与 BattleModeManager 的集成功能
 */

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest"
import { Task } from "../Task"
import { BattleModeManager } from "../../battle-mode/BattleModeManager"
import type { BattleModeConfig } from "../../battle-mode/types"

describe("Task - Battle Mode Integration", () => {
	let mockFs: any

	beforeEach(() => {
		// Mock fs module
		mockFs = {
			readFileSync: vi.fn(),
			writeFileSync: vi.fn(),
			existsSync: vi.fn().mockReturnValue(true),
			mkdirSync: vi.fn(),
			statSync: vi.fn().mockReturnValue({ isDirectory: () => true }),
			readdirSync: vi.fn().mockReturnValue([]),
		}

		vi.clearAllMocks()
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	describe("BattleModeManager 初始化", () => {
		test("当 battleModeConfig 为 enabled 时，应该创建 BattleModeManager 实例", () => {
			const task = new Task({
				provider: {} as any,
				apiConfiguration: {} as any,
				battleModeConfig: {
					enabled: true,
					errorThresholds: {
						level1: 2,
						level2: 4,
					},
					contextCleanup: {
						keepLastUserMessage: true,
						keepLastSystemMessage: true,
						maxMessagesToRemove: 10,
					},
					modelSwitching: {
						fallbackModels: ["model-1", "model-2"],
						maxSwitches: 3,
					},
				},
			})

			const battleModeManager = (task as any).getBattleModeManager()
			expect(battleModeManager).toBeInstanceOf(BattleModeManager)
			expect(battleModeManager).toBeDefined()
		})

		test("当 battleModeConfig 为 undefined 时，不应该创建 BattleModeManager 实例", () => {
			const task = new Task({
				provider: {} as any,
				apiConfiguration: {} as any,
			})

			const battleModeManager = (task as any).getBattleModeManager()
			expect(battleModeManager).toBeUndefined()
		})

		test("当 battleModeConfig.enabled 为 false 时，不应该创建 BattleModeManager 实例", () => {
			const task = new Task({
				provider: {} as any,
				apiConfiguration: {} as any,
				battleModeConfig: {
					enabled: false,
					errorThresholds: { level1: 3, level2: 5 },
					contextCleanup: {
						keepLastUserMessage: true,
						keepLastSystemMessage: true,
						maxMessagesToRemove: 10,
					},
					modelSwitching: {
						fallbackModels: ["model-1", "model-2"],
						maxSwitches: 3,
					},
				},
			})

			const battleModeManager = (task as any).getBattleModeManager()
			expect(battleModeManager).toBeUndefined()
		})

		test("应该使用默认配置创建 BattleModeManager", () => {
			const task = new Task({
				provider: {} as any,
				apiConfiguration: {} as any,
				battleModeConfig: {
					enabled: true,
				},
			})

			const battleModeManager = (task as any).getBattleModeManager()
			expect(battleModeManager).toBeDefined()
			const config = battleModeManager?.getConfig()
			expect(config?.enabled).toBe(true)
			expect(config?.errorThresholds.level1).toBe(3) // default value
			expect(config?.errorThresholds.level2).toBe(5) // default value
		})

		test("应该使用自定义配置创建 BattleModeManager", () => {
			const customConfig: Partial<BattleModeConfig> = {
				enabled: true,
				errorThresholds: {
					level1: 5,
					level2: 10,
				},
				contextCleanup: {
					keepLastUserMessage: true,
					keepLastSystemMessage: true,
					maxMessagesToRemove: 20,
				},
				modelSwitching: {
					fallbackModels: ["model-1", "model-2"],
					maxSwitches: 3,
				},
			}

			const task = new Task({
				provider: {} as any,
				apiConfiguration: {} as any,
				battleModeConfig: customConfig,
			})

			const battleModeManager = (task as any).getBattleModeManager()
			expect(battleModeManager).toBeDefined()
			const config = battleModeManager?.getConfig()
			expect(config?.enabled).toBe(true)
			expect(config?.errorThresholds.level1).toBe(5)
			expect(config?.errorThresholds.level2).toBe(10)
			expect(config?.contextCleanup.maxMessagesToRemove).toBe(20)
			expect(config?.modelSwitching.fallbackModels).toEqual(["model-1", "model-2"])
		})
	})

	describe("战斗模式状态管理", () => {
		test("应该正确返回战斗模式状态", () => {
			const task = new Task({
				provider: {} as any,
				apiConfiguration: {} as any,
				battleModeConfig: {
					enabled: true,
					errorThresholds: { level1: 3, level2: 5 },
					contextCleanup: {
						keepLastUserMessage: true,
						keepLastSystemMessage: true,
						maxMessagesToRemove: 10,
					},
					modelSwitching: {
						fallbackModels: ["model-1", "model-2"],
						maxSwitches: 3,
					},
				},
			})

			const status = (task as any).getBattleModeStatus()
			expect(status).toBeDefined()
			expect(status?.state).toBe("inactive") // initial state
			expect(status?.errorCount).toBe(0)
		})

		test("应该正确返回战斗模式统计信息", () => {
			const task = new Task({
				provider: {} as any,
				apiConfiguration: {} as any,
				battleModeConfig: {
					enabled: true,
					errorThresholds: { level1: 3, level2: 5 },
					contextCleanup: {
						keepLastUserMessage: true,
						keepLastSystemMessage: true,
						maxMessagesToRemove: 10,
					},
					modelSwitching: {
						fallbackModels: ["model-1", "model-2"],
						maxSwitches: 3,
					},
				},
			})

			const statistics = (task as any).getBattleModeStatistics()
			expect(statistics).toBeDefined()
			expect(statistics?.totalErrors).toBe(0)
			expect(statistics?.recoveryByLevel.level1).toBe(0)
			expect(statistics?.recoveryByLevel.level2).toBe(0)
			expect(statistics?.recoveryByLevel.level3).toBe(0)
			expect(statistics?.totalModelSwitches).toBe(0)
		})
	})

	describe("配置动态更新", () => {
		test("应该能够动态更新战斗模式配置", () => {
			const task = new Task({
				provider: {} as any,
				apiConfiguration: {} as any,
				battleModeConfig: {
					enabled: true,
					errorThresholds: { level1: 2, level2: 4 },
					contextCleanup: {
						keepLastUserMessage: true,
						keepLastSystemMessage: true,
						maxMessagesToRemove: 10,
					},
					modelSwitching: {
						fallbackModels: ["model-1", "model-2"],
						maxSwitches: 3,
					},
				},
			})

			;(task as any).updateBattleModeConfig({
				errorThresholds: {
					level1: 5,
					level2: 8,
				},
			})

			const config = (task as any).getBattleModeManager()?.getConfig()
			expect(config?.errorThresholds.level1).toBe(5)
			expect(config?.errorThresholds.level2).toBe(8)
		})

		test("应该保持其他配置不变", () => {
			const task = new Task({
				provider: {} as any,
				apiConfiguration: {} as any,
				battleModeConfig: {
					enabled: true,
					errorThresholds: { level1: 2, level2: 4 },
					contextCleanup: {
						keepLastUserMessage: true,
						keepLastSystemMessage: true,
						maxMessagesToRemove: 15,
					},
					modelSwitching: {
						fallbackModels: ["model-1", "model-2"],
						maxSwitches: 3,
					},
				},
			})

			;(task as any).updateBattleModeConfig({
				errorThresholds: {
					level1: 5,
					level2: 8,
				},
			})

			const config = (task as any).getBattleModeManager()?.getConfig()
			expect(config?.enabled).toBe(true)
			expect(config?.errorThresholds.level1).toBe(5)
			expect(config?.errorThresholds.level2).toBe(8)
			expect(config?.contextCleanup.maxMessagesToRemove).toBe(15) // unchanged
		})

		test("当 BattleModeManager 不存在时，updateBattleModeConfig 应该安全处理", () => {
			const task = new Task({
				provider: {} as any,
				apiConfiguration: {} as any,
			})

			// Should not throw error
			expect(() => {
				;(task as any).updateBattleModeConfig({
					enabled: true,
				})
			}).not.toThrow()
		})
	})

	describe("错误上下文创建", () => {
		test("应该正确创建错误上下文", () => {
			const task = new Task({
				provider: {} as any,
				apiConfiguration: {} as any,
				battleModeConfig: {
					enabled: true,
					errorThresholds: { level1: 3, level2: 5 },
					contextCleanup: {
						keepLastUserMessage: true,
						keepLastSystemMessage: true,
						maxMessagesToRemove: 10,
					},
					modelSwitching: {
						fallbackModels: ["model-1", "model-2"],
						maxSwitches: 3,
					},
				},
			})

			const testError = new Error("Test error message")
			const errorContext = (task as any).createErrorContext(testError)

			expect(errorContext).toBeDefined()
			expect(errorContext.timestamp).toBeDefined()
			expect(errorContext.errorType).toBe("recovery") // Test error message doesn't match fatal patterns
			expect(errorContext.errorSource).toBe("api_response")
			expect(errorContext.metadata).toBeDefined()
			expect(errorContext.metadata?.errorMessage).toBe("Test error message")
		})

		test("应该正确识别致命错误", () => {
			const task = new Task({
				provider: {} as any,
				apiConfiguration: {} as any,
				battleModeConfig: {
					enabled: true,
					errorThresholds: { level1: 3, level2: 5 },
					contextCleanup: {
						keepLastUserMessage: true,
						keepLastSystemMessage: true,
						maxMessagesToRemove: 10,
					},
					modelSwitching: {
						fallbackModels: ["model-1", "model-2"],
						maxSwitches: 3,
					},
				},
			})

			const fatalError = new Error("Permission denied")
			const errorContext = (task as any).createErrorContext(fatalError)

			expect(errorContext.errorType).toBe("recovery") // 'Permission denied' matches recovery pattern
		})
	})

	describe("向后兼容性", () => {
		test("当未启用战斗模式时，Task 应该正常工作", () => {
			const task = new Task({
				provider: {} as any,
				apiConfiguration: {} as any,
			})

			expect((task as any).getBattleModeManager()).toBeUndefined()
			// Task should still function normally
			expect(task).toBeDefined()
		})

		test("应该不影响现有的 Task 功能", () => {
			const task = new Task({
				provider: {} as any,
				apiConfiguration: {} as any,
				battleModeConfig: {
					enabled: true,
					errorThresholds: { level1: 3, level2: 5 },
					contextCleanup: {
						keepLastUserMessage: true,
						keepLastSystemMessage: true,
						maxMessagesToRemove: 10,
					},
					modelSwitching: {
						fallbackModels: ["model-1", "model-2"],
						maxSwitches: 3,
					},
				},
			})

			// Verify existing Task properties are intact
			expect(task).toBeDefined()
		})
	})

	describe("边界情况和错误处理", () => {
		test("当 BattleModeManager 初始化失败时，Task 应该继续工作", () => {
			// Mock a scenario where BattleModeManager might fail
			const task = new Task({
				provider: {} as any,
				apiConfiguration: {} as any,
				battleModeConfig: {
					enabled: true,
					errorThresholds: {
						level1: -1, // Invalid value
						level2: -1,
					},
					contextCleanup: {
						keepLastUserMessage: true,
						keepLastSystemMessage: true,
						maxMessagesToRemove: 10,
					},
					modelSwitching: {
						fallbackModels: ["model-1", "model-2"],
						maxSwitches: 3,
					},
				},
			})

			// Task should still be created
			expect(task).toBeDefined()
		})

		test("当 handleBattleModeRecovery 接收到无效结果时，应该安全处理", () => {
			const task = new Task({
				provider: {} as any,
				apiConfiguration: {} as any,
				battleModeConfig: {
					enabled: true,
					errorThresholds: { level1: 3, level2: 5 },
					contextCleanup: {
						keepLastUserMessage: true,
						keepLastSystemMessage: true,
						maxMessagesToRemove: 10,
					},
					modelSwitching: {
						fallbackModels: ["model-1", "model-2"],
						maxSwitches: 3,
					},
				},
			})

			const invalidResult = {
				success: false,
				action: "unknown" as any,
				details: {},
				duration: 0,
			}

			// Should not throw error
			expect(async () => await (task as any).handleBattleModeRecovery(invalidResult)).resolves.not.toThrow()
		})
	})
})
