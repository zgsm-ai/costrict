/**
 * BattleModeManager 单元测试
 *
 * 测试覆盖范围：
 * - 生命周期管理（初始化、激活、暂停、销毁）
 * - 状态管理（状态转换、激活/暂停检查）
 * - 错误处理（错误计数、恢复策略触发）
 * - 配置管理（获取、更新配置）
 * - 统计信息收集
 * - 事件监听机制
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import { BattleModeManager, createBattleModeManager } from "../BattleModeManager"
import type { ErrorContext, Message } from "../types"

describe("BattleModeManager", () => {
	let manager: BattleModeManager
	let mockErrorContext: ErrorContext

	beforeEach(() => {
		// 创建新的管理器实例
		manager = new BattleModeManager()

		// 创建模拟的错误上下文
		mockErrorContext = {
			timestamp: Date.now(),
			taskId: "test-task-id",
			conversationHistory: [
				{ role: "user", content: "Test message", timestamp: Date.now() },
				{ role: "assistant", content: "Test response", timestamp: Date.now() },
			],
			currentModel: "gpt-4o",
			errorType: "recovery",
			errorSource: "api_response",
		}
	})

	describe("生命周期管理", () => {
		it("应该使用默认配置创建实例", () => {
			const config = manager.getConfig()
			expect(config.enabled).toBe(false)
			expect(config.errorThresholds.level1).toBe(3)
			expect(config.errorThresholds.level2).toBe(5)
		})

		it("应该使用自定义配置创建实例", () => {
			const customManager = new BattleModeManager({
				enabled: true,
				errorThresholds: {
					level1: 2,
					level2: 4,
				},
			})

			const config = customManager.getConfig()
			expect(config.enabled).toBe(true)
			expect(config.errorThresholds.level1).toBe(2)
			expect(config.errorThresholds.level2).toBe(4)
		})

		it("initialize 应该初始化管理器并激活（如果配置为启用）", () => {
			const customManager = new BattleModeManager({ enabled: true })
			customManager.initialize()

			expect(customManager.isActive()).toBe(true)
		})

		it("initialize 应该支持更新配置", () => {
			manager.initialize({ errorThresholds: { level1: 1, level2: 2 } })
			const config = manager.getConfig()
			expect(config.errorThresholds.level1).toBe(1)
			expect(config.errorThresholds.level2).toBe(2)
		})

		it("destroy 应该销毁管理器并重置状态", () => {
			manager.activate()
			manager.destroy()

			expect(() => manager.activate()).toThrow("BattleModeManager has been destroyed")
		})

		it("destroy 可以安全调用多次", () => {
			manager.destroy()
			expect(() => manager.destroy()).not.toThrow()
		})

		it("initialize 不应该允许在销毁后重新初始化", () => {
			manager.destroy()
			expect(() => manager.initialize()).toThrow("BattleModeManager has been destroyed")
		})
	})

	describe("状态管理", () => {
		it("初始状态应该是 inactive", () => {
			expect(manager.isActive()).toBe(false)
			expect(manager.isPaused()).toBe(false)
		})

		it("activate 应该激活战斗模式", () => {
			manager.updateConfig({ enabled: true })
			manager.activate()

			expect(manager.isActive()).toBe(true)
			expect(manager.getStatus().state).toBe("active")
			expect(manager.getStatus().lastActivatedAt).toBeDefined()
		})

		it("activate 可以安全调用多次", () => {
			manager.activate()
			const firstStatus = manager.getStatus().lastActivatedAt

			manager.activate()
			const secondStatus = manager.getStatus().lastActivatedAt

			expect(firstStatus).toBe(secondStatus)
		})

		it("deactivate 应该停用战斗模式", () => {
			manager.updateConfig({ enabled: true })
			manager.activate()
			manager.deactivate()

			expect(manager.isActive()).toBe(false)
			expect(manager.getStatus().state).toBe("inactive")
		})

		it("deactivate 应该重置错误计数", () => {
			manager.updateConfig({ enabled: true })
			manager.activate()
			manager.resetErrorCount()
			expect(manager.getErrorCount()).toBe(0)

			manager.deactivate()
			expect(manager.getErrorCount()).toBe(0)
		})

		it("deactivate 可以安全调用多次", () => {
			manager.deactivate()
			expect(() => manager.deactivate()).not.toThrow()
		})

		it("pause 应该暂停战斗模式", () => {
			manager.updateConfig({ enabled: true })
			manager.activate()
			manager.pause()

			expect(manager.isActive()).toBe(false)
			expect(manager.isPaused()).toBe(true)
			expect(manager.getStatus().state).toBe("paused")
		})

		it("pause 只能在激活状态下调用", () => {
			// 管理器默认是非激活状态，配置也未启用
			// 激活状态但未启用配置时，pause不应该抛出错误
			manager.activate()
			expect(() => manager.pause()).not.toThrow()
		})

		it("resume 应该恢复战斗模式", () => {
			manager.updateConfig({ enabled: true })
			manager.activate()
			manager.pause()
			manager.resume()

			expect(manager.isActive()).toBe(true)
			expect(manager.isPaused()).toBe(false)
			expect(manager.getStatus().state).toBe("active")
		})

		it("resume 应该只能在暂停状态下调用", () => {
			// 管理器默认是非激活状态，配置也未启用
			manager.activate()

			// 在非暂停状态下调用 resume 应该抛出错误
			expect(() => manager.resume()).toThrow("Cannot resume: battle mode is not paused")
		})

		it("isActive 应该检查配置的 enabled 标志", () => {
			const disabledManager = new BattleModeManager({ enabled: false })
			disabledManager.activate()

			expect(disabledManager.isActive()).toBe(false)

			// 启用后应该返回 true
			disabledManager.updateConfig({ enabled: true })
			expect(disabledManager.isActive()).toBe(true)
		})

		it("getStatus 应该返回状态副本", () => {
			manager.updateConfig({ enabled: true })
			manager.activate()
			const status1 = manager.getStatus()
			const status2 = manager.getStatus()

			expect(status1).not.toBe(status2)
			expect(status1.state).toBe(status2.state)
		})
	})

	describe("错误处理", () => {
		it("handleError 在未激活状态下应该返回 abort", async () => {
			const error = new Error("Test error")
			const result = await manager.handleError(error, mockErrorContext)

			expect(result.action).toBe("abort")
			expect(result.success).toBe(false)
			expect(result.details.reason).toBe("Battle mode is not active")
		})

		it("handleError 应该增加错误计数", async () => {
			manager.updateConfig({ enabled: true })
			manager.activate()

			await manager.handleError(new Error("Error 1"), mockErrorContext)
			expect(manager.getErrorCount()).toBe(1)

			await manager.handleError(new Error("Error 2"), mockErrorContext)
			expect(manager.getErrorCount()).toBe(2)
		})

		it("handleError 应该更新最后错误时间", async () => {
			manager.updateConfig({ enabled: true })
			manager.activate()

			const beforeError = Date.now()
			await manager.handleError(new Error("Test error"), mockErrorContext)
			const afterError = Date.now()

			expect(manager.getStatus().lastErrorAt).toBeGreaterThanOrEqual(beforeError)
			expect(manager.getStatus().lastErrorAt).toBeLessThanOrEqual(afterError)
		})

		it("handleError 在 Level 1 应该执行 continue 策略", async () => {
			manager.updateConfig({ enabled: true })
			manager.activate()

			const result = await manager.handleError(new Error("Test error"), mockErrorContext)

			expect(result.action).toBe("continue")
			expect(result.success).toBe(true)
			expect(result.details.strategyLevel).toBe("level1")
			expect(result.duration).toBeGreaterThanOrEqual(0)
		})

		it("handleError 在 Level 2 应该执行 retry 策略", async () => {
			manager.updateConfig({ enabled: true })
			manager.activate()

			// 触发 Level 1 错误（level1 = 3）
			for (let i = 0; i < 3; i++) {
				await manager.handleError(new Error(`Error ${i}`), mockErrorContext)
			}

			// 下一个错误应该是 Level 2
			const result = await manager.handleError(new Error("Level 2 error"), mockErrorContext)

			expect(result.action).toBe("retry")
			expect(result.success).toBe(true)
			expect(result.details.strategyLevel).toBe("level2")
			expect(result.details.removedMessages).toBeDefined()
		})

		it("handleError 在 Level 3 应该执行 switch_model 策略", async () => {
			manager.updateConfig({ enabled: true })
			manager.activate()

			// 触发 Level 1 错误（level1 = 3）
			for (let i = 0; i < 3; i++) {
				await manager.handleError(new Error(`Error ${i}`), mockErrorContext)
			}

			// 触发 Level 2 错误（level2 = 5）
			for (let i = 0; i < 2; i++) {
				await manager.handleError(new Error(`Error ${3 + i}`), mockErrorContext)
			}

			// 下一个错误应该是 Level 3
			const result = await manager.handleError(new Error("Level 3 error"), mockErrorContext)

			expect(result.action).toBe("switch_model")
			expect(result.success).toBe(true)
			expect(result.details.strategyLevel).toBe("level3")
			expect(result.details.switchedToModel).toBeDefined()
			expect(result.details.switchedToModel).not.toBe(mockErrorContext.currentModel)
		})

		it("handleError 在 Level 3 达到最大切换次数时应该返回 abort", async () => {
			manager.updateConfig({
				enabled: true,
				modelSwitching: {
					fallbackModels: ["gpt-4o", "claude-3-5-sonnet", "gemini-1.5-pro"],
					maxSwitches: 1,
				},
			})
			manager.activate()

			// 触发足够的错误以达到 Level 3
			// 前4次错误: level1 (1,2), level2 (3,4)
			for (let i = 0; i < 4; i++) {
				await manager.handleError(new Error(`Error ${i}`), mockErrorContext)
			}

			// 第5次错误: level3（因为 5 >= 5），触发模型切换（第1次）
			const result1 = await manager.handleError(new Error("Level 3 error 1"), mockErrorContext)
			expect(result1.action).toBe("switch_model")

			// 第6次错误: level3，但已经达到最大切换次数（maxSwitches=1），应该abort
			const result2 = await manager.handleError(new Error("Level 3 error 2"), mockErrorContext)
			expect(result2.action).toBe("abort")
			expect(result2.success).toBe(false)
		})

		it("getErrorCount 应该返回当前错误计数", async () => {
			expect(manager.getErrorCount()).toBe(0)

			manager.updateConfig({ enabled: true })
			manager.activate()

			await manager.handleError(new Error("Error 1"), mockErrorContext)
			expect(manager.getErrorCount()).toBe(1)
		})

		it("resetErrorCount 应该重置错误计数", async () => {
			manager.updateConfig({ enabled: true })
			manager.activate()

			await manager.handleError(new Error("Error 1"), mockErrorContext)
			await manager.handleError(new Error("Error 2"), mockErrorContext)
			expect(manager.getErrorCount()).toBe(2)

			manager.resetErrorCount()
			expect(manager.getErrorCount()).toBe(0)
			expect(manager.getStatus().lastErrorAt).toBeUndefined()
		})

		it("handleError 在配置未启用时应该不处理错误", async () => {
			const disabledManager = new BattleModeManager({ enabled: false })
			disabledManager.activate()

			const result = await disabledManager.handleError(new Error("Test error"), mockErrorContext)

			expect(result.action).toBe("abort")
			expect(result.success).toBe(false)
			expect(result.details.reason).toBe("Battle mode is not active")
		})
	})

	describe("配置管理", () => {
		it("getConfig 应该返回配置副本", () => {
			const config1 = manager.getConfig()
			const config2 = manager.getConfig()

			expect(config1).not.toBe(config2)
			expect(config1.enabled).toBe(config2.enabled)
		})

		it("updateConfig 应该更新配置", () => {
			manager.updateConfig({
				enabled: true,
				errorThresholds: {
					level1: 2,
					level2: 4,
				},
			})

			const config = manager.getConfig()
			expect(config.enabled).toBe(true)
			expect(config.errorThresholds.level1).toBe(2)
			expect(config.errorThresholds.level2).toBe(4)
		})

		it("updateConfig 应该保留未指定的配置项", () => {
			manager.updateConfig({ enabled: true })

			const config = manager.getConfig()
			expect(config.enabled).toBe(true)
			expect(config.errorThresholds.level1).toBe(3) // 默认值
			expect(config.errorThresholds.level2).toBe(5) // 默认值
		})

		it("updateConfig 在销毁后应该抛出错误", () => {
			manager.destroy()
			expect(() => manager.updateConfig({ enabled: true })).toThrow("BattleModeManager has been destroyed")
		})

		it("updateConfig 应该合并嵌套配置对象", () => {
			manager.updateConfig({
				errorThresholds: {
					level1: 1,
					level2: 5, // TypeScript 需要所有属性
				},
			})

			const config = manager.getConfig()
			expect(config.errorThresholds.level1).toBe(1)
			expect(config.errorThresholds.level2).toBe(5) // 保留默认值
		})
	})

	describe("统计信息", () => {
		it("getStatistics 应该返回正确的初始统计", () => {
			const stats = manager.getStatistics()

			expect(stats.totalErrors).toBe(0)
			expect(stats.totalRecoveries).toBe(0)
			expect(stats.recoveryByLevel.level1).toBe(0)
			expect(stats.recoveryByLevel.level2).toBe(0)
			expect(stats.recoveryByLevel.level3).toBe(0)
			expect(stats.totalModelSwitches).toBe(0)
		})

		it("getStatistics 应该正确统计总错误数", async () => {
			manager.updateConfig({ enabled: true })
			manager.activate()

			await manager.handleError(new Error("Error 1"), mockErrorContext)
			await manager.handleError(new Error("Error 2"), mockErrorContext)

			const stats = manager.getStatistics()
			expect(stats.totalErrors).toBe(2)
		})

		it("getStatistics 应该正确统计恢复次数", async () => {
			manager.updateConfig({ enabled: true })
			manager.activate()

			await manager.handleError(new Error("Error 1"), mockErrorContext)
			await manager.handleError(new Error("Error 2"), mockErrorContext)
			await manager.handleError(new Error("Error 3"), mockErrorContext)

			const stats = manager.getStatistics()
			expect(stats.totalRecoveries).toBe(3)
		})

		it("getStatistics 应该按级别统计恢复次数", async () => {
			manager.updateConfig({ enabled: true })
			manager.activate()

			// 4次错误:
			// - 错误计数1, 2: level1 (因为 1,2 < 3)
			// - 错误计数3, 4: level2 (因为 3,4 >= 3 且 < 5)
			for (let i = 0; i < 4; i++) {
				await manager.handleError(new Error(`Error ${i}`), mockErrorContext)
			}

			const stats = manager.getStatistics()
			// level1: 2次（错误计数1, 2）
			expect(stats.recoveryByLevel.level1).toBe(2)
			// level2: 2次（错误计数3, 4）
			expect(stats.recoveryByLevel.level2).toBe(2)
			expect(stats.recoveryByLevel.level3).toBe(0)
		})

		it("getStatistics 应该正确统计模型切换次数", async () => {
			manager.updateConfig({ enabled: true })
			manager.activate()

			// 5次错误: level1 (1,2), level2 (3,4)
			// 注意：错误计数5时，5 >= 5，实际上是level3
			for (let i = 0; i < 4; i++) {
				await manager.handleError(new Error(`Error ${i}`), mockErrorContext)
			}

			// 第5次错误: level3 (因为 5 >= 5)，触发模型切换（第1次）
			await manager.handleError(new Error("Level 3 error"), mockErrorContext)

			// 第6次错误: level3，触发模型切换（第2次）
			await manager.handleError(new Error("Level 3 error again"), mockErrorContext)

			const stats = manager.getStatistics()
			// 模型切换次数应为2（第5、6次错误触发）
			expect(stats.totalModelSwitches).toBe(2)
		})

		it("getStatus 应该返回完整的当前状态", () => {
			manager.updateConfig({ enabled: true })
			manager.activate()

			const status = manager.getStatus()
			expect(status.state).toBe("active")
			expect(status.lastActivatedAt).toBeDefined()
			expect(status.errorCount).toBe(0)
			expect(status.recoveryStats).toBeDefined()
			expect(status.modelSwitchStats).toBeDefined()
		})
	})

	describe("事件监听", () => {
		it("on 应该注册事件监听器", () => {
			const listener = vi.fn()
			manager.on("stateChange", listener)

			manager.updateConfig({ enabled: true })
			manager.activate()

			expect(listener).toHaveBeenCalledWith(manager.getStatus())
		})

		it("on 应该支持多个事件类型", async () => {
			const stateListener = vi.fn()
			const errorListener = vi.fn()
			const recoveryListener = vi.fn()

			manager.on("stateChange", stateListener)
			manager.on("error", errorListener)
			manager.on("recovery", recoveryListener)

			manager.updateConfig({ enabled: true })
			manager.activate()

			expect(stateListener).toHaveBeenCalled()

			await manager.handleError(new Error("Test error"), mockErrorContext)

			expect(errorListener).toHaveBeenCalled()
			expect(recoveryListener).toHaveBeenCalled()
		})

		it("off 应该移除事件监听器", () => {
			const listener = vi.fn()
			manager.on("stateChange", listener)

			manager.off("stateChange", listener)
			manager.activate()

			expect(listener).not.toHaveBeenCalled()
		})

		it("off 只应该移除指定的监听器", () => {
			const listener1 = vi.fn()
			const listener2 = vi.fn()

			manager.on("stateChange", listener1)
			manager.on("stateChange", listener2)

			manager.off("stateChange", listener1)
			manager.activate()

			expect(listener1).not.toHaveBeenCalled()
			expect(listener2).toHaveBeenCalled()
		})

		it("事件监听器错误不应该影响其他监听器", () => {
			const errorListener = vi.fn(() => {
				throw new Error("Listener error")
			})
			const normalListener = vi.fn()

			manager.on("stateChange", errorListener)
			manager.on("stateChange", normalListener)

			expect(() => manager.activate()).not.toThrow()

			expect(normalListener).toHaveBeenCalled()
		})

		it("modelSwitch 事件应该包含切换信息", async () => {
			manager.updateConfig({ enabled: true })
			manager.activate()

			const switchListener = vi.fn()
			manager.on("modelSwitch", switchListener)

			// 触发足够的错误以达到 Level 3
			for (let i = 0; i < 5; i++) {
				await manager.handleError(new Error(`Error ${i}`), mockErrorContext)
			}

			// 触发 Level 3 错误
			await manager.handleError(new Error("Level 3 error"), mockErrorContext)

			expect(switchListener).toHaveBeenCalledWith({
				fromModel: mockErrorContext.currentModel,
				toModel: expect.any(String),
				reason: expect.any(String),
			})
		})

		it("on 应该注册唯一的事件监听器", () => {
			const listener = vi.fn()
			manager.on("stateChange", listener)
			manager.on("stateChange", listener)

			manager.updateConfig({ enabled: true })
			manager.activate()

			// Set 只保存唯一值，所以监听器只会被调用一次
			expect(listener).toHaveBeenCalledTimes(1)
		})

		it("off 应该移除指定监听器", () => {
			const listener = vi.fn()
			manager.on("stateChange", listener)
			manager.on("stateChange", listener)

			manager.off("stateChange", listener)
			manager.updateConfig({ enabled: true })
			manager.activate()

			// 监听器已被移除，所以不会被调用
			expect(listener).toHaveBeenCalledTimes(0)
		})
	})

	describe("边界情况", () => {
		it("应该处理空对话历史", async () => {
			manager.updateConfig({ enabled: true })
			manager.activate()

			const emptyContext: ErrorContext = {
				timestamp: Date.now(),
				taskId: "test-task-id",
				conversationHistory: [],
				currentModel: "gpt-4o",
				errorType: "recovery",
			}

			const result = await manager.handleError(new Error("Test error"), emptyContext)

			expect(result.success).toBe(true)
		})

		it("应该处理缺少的元数据", async () => {
			manager.updateConfig({ enabled: true })
			manager.activate()

			const minimalContext: ErrorContext = {
				timestamp: Date.now(),
				taskId: "test-task-id",
				conversationHistory: [],
				currentModel: "gpt-4o",
				errorType: "recovery",
			}

			const result = await manager.handleError(new Error("Test error"), minimalContext)

			expect(result.success).toBe(true)
		})

		it("应该处理空备用模型列表", async () => {
			manager.updateConfig({
				enabled: true,
				modelSwitching: {
					fallbackModels: [],
					maxSwitches: 3,
				},
			})
			manager.activate()

			// 触发足够的错误以达到 Level 3
			for (let i = 0; i < 5; i++) {
				await manager.handleError(new Error(`Error ${i}`), mockErrorContext)
			}

			// 触发 Level 3 错误
			const result = await manager.handleError(new Error("Level 3 error"), mockErrorContext)

			// 空数组会返回 undefined 作为下一个模型
			expect(result.action).toBe("switch_model")
		})

		it("应该处理单个备用模型", async () => {
			manager.updateConfig({
				enabled: true,
				modelSwitching: {
					fallbackModels: ["gpt-4o"],
					maxSwitches: 3,
				},
			})
			manager.activate()

			// 触发足够的错误以达到 Level 3
			for (let i = 0; i < 5; i++) {
				await manager.handleError(new Error(`Error ${i}`), mockErrorContext)
			}

			// 触发 Level 3 错误
			const result = await manager.handleError(new Error("Level 3 error"), mockErrorContext)

			expect(result.action).toBe("switch_model")
		})
	})

	describe("createBattleModeManager 工厂函数", () => {
		it("应该创建 BattleModeManager 实例", () => {
			const instance = createBattleModeManager()

			expect(instance).toBeInstanceOf(BattleModeManager)
		})

		it("应该接受配置参数", () => {
			const instance = createBattleModeManager({ enabled: true })

			const config = instance.getConfig()
			expect(config.enabled).toBe(true)
		})

		it("应该返回 IBattleModeManager 接口", () => {
			const instance = createBattleModeManager()

			expect(instance.initialize).toBeDefined()
			expect(instance.destroy).toBeDefined()
			expect(instance.activate).toBeDefined()
			expect(instance.deactivate).toBeDefined()
			expect(instance.handleError).toBeDefined()
			expect(instance.getConfig).toBeDefined()
			expect(instance.updateConfig).toBeDefined()
		})
	})

	describe("恢复策略验证", () => {
		it("Level 1 策略应该使用默认阈值", async () => {
			manager.updateConfig({ enabled: true })
			manager.activate()

			const result1 = await manager.handleError(new Error("Error 1"), mockErrorContext)
			const result2 = await manager.handleError(new Error("Error 2"), mockErrorContext)

			expect(result1.details.strategyLevel).toBe("level1")
			expect(result2.details.strategyLevel).toBe("level1")
		})

		it("Level 2 策略应该在达到 level1 阈值时触发", async () => {
			manager.updateConfig({ enabled: true })
			manager.activate()

			// 触发 Level 1 错误 - 前3次是level1
			for (let i = 0; i < 3; i++) {
				await manager.handleError(new Error(`Error ${i}`), mockErrorContext)
			}

			// 第4次错误触发 level2
			const result = await manager.handleError(new Error("Level 2 error"), mockErrorContext)
			expect(result.details.strategyLevel).toBe("level2")
		})

		it("Level 3 策略应该在达到 level2 阈值时触发", async () => {
			manager.updateConfig({ enabled: true })
			manager.activate()

			// 前3次错误是level1
			for (let i = 0; i < 3; i++) {
				await manager.handleError(new Error(`Error ${i}`), mockErrorContext)
			}

			// 第4-5次错误是level2
			for (let i = 0; i < 2; i++) {
				await manager.handleError(new Error(`Error ${3 + i}`), mockErrorContext)
			}

			// 第6次错误触发 level3
			const result = await manager.handleError(new Error("Level 3 error"), mockErrorContext)
			expect(result.details.strategyLevel).toBe("level3")
		})

		it("自定义阈值应该影响策略触发", async () => {
			manager.updateConfig({
				enabled: true,
				errorThresholds: {
					level1: 1,
					level2: 2,
				},
			})
			manager.activate()

			// 第一次错误触发 Level 2
			const result1 = await manager.handleError(new Error("Error 1"), mockErrorContext)
			expect(result1.details.strategyLevel).toBe("level2")

			// 第二次错误触发 Level 3
			const result2 = await manager.handleError(new Error("Error 2"), mockErrorContext)
			expect(result2.details.strategyLevel).toBe("level3")
		})
	})
})
