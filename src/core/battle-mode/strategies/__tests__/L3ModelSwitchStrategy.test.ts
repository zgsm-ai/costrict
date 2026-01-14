/**
 * L3ModelSwitchStrategy 单元测试
 * 测试 L3 级别错误恢复策略的功能
 */
import { describe, test, expect, beforeEach, vi } from "vitest"
import { L3ModelSwitchStrategy, DEFAULT_L3_CONFIG, type L3ModelSwitchStrategyConfig } from "../L3ModelSwitchStrategy"
import type { ErrorContext } from "../../types/ErrorContext"
import type { IModelSwitcher } from "../../interfaces/IModelSwitcher"

describe("L3ModelSwitchStrategy", () => {
	let mockErrorContext: ErrorContext

	beforeEach(() => {
		mockErrorContext = {
			timestamp: Date.now(),
			taskId: "test-task-id",
			conversationHistory: [
				{ role: "user", content: "Hello" },
				{ role: "assistant", content: "Hi" },
			],
			currentModel: "gpt-4",
			errorType: "recovery",
		}
	})

	describe("构造函数和初始化", () => {
		test("应该使用默认配置创建策略", () => {
			const mockModelSwitcher: IModelSwitcher = {
				switchModel: vi.fn().mockResolvedValue("claude-3-5-sonnet"),
				validateModel: vi.fn().mockResolvedValue(true),
				getFallbackModels: vi.fn().mockReturnValue(["gpt-4o", "claude-3-5-sonnet"]),
				resetSwitchCount: vi.fn(),
				getSwitchCount: vi.fn().mockReturnValue(0),
				getCurrentModel: vi.fn().mockReturnValue("gpt-4"),
				setCurrentModel: vi.fn(),
				isMaxSwitchesReached: vi.fn().mockReturnValue(false),
				getSwitchHistory: vi.fn().mockReturnValue([]),
			}

			const strategy = new L3ModelSwitchStrategy(undefined, mockModelSwitcher)

			expect(strategy.name).toBe("L3ModelSwitchStrategy")
			expect(strategy.description).toContain("切换到备用模型后重试")
			expect(strategy.priority).toBe(3)
			expect(strategy.getCurrentErrorCount()).toBe(0)
		})

		test("应该接受自定义配置", () => {
			const mockModelSwitcher: IModelSwitcher = {
				switchModel: vi.fn().mockResolvedValue("model"),
				validateModel: vi.fn().mockResolvedValue(true),
				getFallbackModels: vi.fn().mockReturnValue(["model1", "model2"]),
				resetSwitchCount: vi.fn(),
				getSwitchCount: vi.fn().mockReturnValue(0),
				getCurrentModel: vi.fn().mockReturnValue("gpt-4"),
				setCurrentModel: vi.fn(),
				isMaxSwitchesReached: vi.fn().mockReturnValue(false),
				getSwitchHistory: vi.fn().mockReturnValue([]),
			}

			const customConfig: L3ModelSwitchStrategyConfig = {
				minErrorCount: 6,
				maxSwitches: 5,
				triggerErrorTypes: ["service error", "unavailable"],
				fallbackModels: ["model1", "model2"],
				retryDelay: 4000,
				validateBeforeSwitch: false,
			}
			const customStrategy = new L3ModelSwitchStrategy(customConfig, mockModelSwitcher)

			expect(customStrategy.getCurrentErrorCount()).toBe(0)
			expect(customStrategy.getConfig().minErrorCount).toBe(6)
			expect(customStrategy.getConfig().retryDelay).toBe(4000)
		})

		test("应该使用 DEFAULT_L3_CONFIG 作为默认值", () => {
			expect(DEFAULT_L3_CONFIG.minErrorCount).toBe(5)
			expect(DEFAULT_L3_CONFIG.maxSwitches).toBe(3)
			expect(DEFAULT_L3_CONFIG.validateBeforeSwitch).toBe(true)
			expect(DEFAULT_L3_CONFIG.fallbackModels).toContain("gpt-4o")
		})
	})

	describe("setModelSwitcher", () => {
		test("应该设置模型切换器", () => {
			const mockModelSwitcher: IModelSwitcher = {
				switchModel: vi.fn().mockResolvedValue("model"),
				validateModel: vi.fn().mockResolvedValue(true),
				getFallbackModels: vi.fn().mockReturnValue(["model1", "model2"]),
				resetSwitchCount: vi.fn(),
				getSwitchCount: vi.fn().mockReturnValue(0),
				getCurrentModel: vi.fn().mockReturnValue("gpt-4"),
				setCurrentModel: vi.fn(),
				isMaxSwitchesReached: vi.fn().mockReturnValue(false),
				getSwitchHistory: vi.fn().mockReturnValue([]),
			}

			const strategy = new L3ModelSwitchStrategy(undefined, mockModelSwitcher)

			const newSwitcher: IModelSwitcher = {
				switchModel: vi.fn().mockResolvedValue("new-model"),
				validateModel: vi.fn().mockResolvedValue(true),
				getFallbackModels: vi.fn().mockReturnValue(["model3", "model4"]),
				resetSwitchCount: vi.fn(),
				getSwitchCount: vi.fn().mockReturnValue(0),
				getCurrentModel: vi.fn().mockReturnValue("gpt-4"),
				setCurrentModel: vi.fn(),
				isMaxSwitchesReached: vi.fn().mockReturnValue(false),
				getSwitchHistory: vi.fn().mockReturnValue([]),
			}

			strategy.setModelSwitcher(newSwitcher)
			expect(strategy.getCurrentModel()).toBe("gpt-4")
		})
	})

	describe("canRecover", () => {
		test("应该对可恢复错误返回 true", async () => {
			const mockModelSwitcher: IModelSwitcher = {
				switchModel: vi.fn().mockResolvedValue("model"),
				validateModel: vi.fn().mockResolvedValue(true),
				getFallbackModels: vi.fn().mockReturnValue(["model1", "model2"]),
				resetSwitchCount: vi.fn(),
				getSwitchCount: vi.fn().mockReturnValue(0),
				getCurrentModel: vi.fn().mockReturnValue("gpt-4"),
				setCurrentModel: vi.fn(),
				isMaxSwitchesReached: vi.fn().mockReturnValue(false),
				getSwitchHistory: vi.fn().mockReturnValue([]),
			}

			const strategy = new L3ModelSwitchStrategy(undefined, mockModelSwitcher)

			const error = new Error("Service unavailable")
			const canRecover = await strategy.canRecover(error, mockErrorContext)
			expect(canRecover).toBe(true)
		})

		test("应该对致命错误返回 false", async () => {
			const mockModelSwitcher: IModelSwitcher = {
				switchModel: vi.fn().mockResolvedValue("model"),
				validateModel: vi.fn().mockResolvedValue(true),
				getFallbackModels: vi.fn().mockReturnValue(["model1", "model2"]),
				resetSwitchCount: vi.fn(),
				getSwitchCount: vi.fn().mockReturnValue(0),
				getCurrentModel: vi.fn().mockReturnValue("gpt-4"),
				setCurrentModel: vi.fn(),
				isMaxSwitchesReached: vi.fn().mockReturnValue(false),
				getSwitchHistory: vi.fn().mockReturnValue([]),
			}

			const strategy = new L3ModelSwitchStrategy(undefined, mockModelSwitcher)

			const error = new Error("fatal error")
			const canRecover = await strategy.canRecover(error, mockErrorContext)
			expect(canRecover).toBe(false)
		})
	})

	describe("recover", () => {
		test("应该成功切换模型并重试", async () => {
			const mockModelSwitcher: IModelSwitcher = {
				switchModel: vi.fn().mockResolvedValue("claude-3-5-sonnet"),
				validateModel: vi.fn().mockResolvedValue(true),
				getFallbackModels: vi.fn().mockReturnValue(["gpt-4o", "claude-3-5-sonnet"]),
				resetSwitchCount: vi.fn(),
				getSwitchCount: vi.fn().mockReturnValue(0),
				getCurrentModel: vi.fn().mockReturnValue("gpt-4"),
				setCurrentModel: vi.fn(),
				isMaxSwitchesReached: vi.fn().mockReturnValue(false),
				getSwitchHistory: vi.fn().mockReturnValue([]),
			}

			const strategy = new L3ModelSwitchStrategy(undefined, mockModelSwitcher)

			// 触发 5 次错误以达到阈值
			const error = new Error("Model error")
			for (let i = 0; i < 5; i++) {
				await strategy.canRecover(error, mockErrorContext)
			}

			const result = await strategy.recover(error, mockErrorContext)

			expect(result.success).toBe(true)
			expect(result.action).toBe("switch_model")
			expect(result.details.switchedToModel).toContain("claude-3-5-sonnet")
		})

		test("应该在达到最大切换次数时终止", async () => {
			const mockModelSwitcher: IModelSwitcher = {
				switchModel: vi.fn().mockResolvedValue("claude-3-5-sonnet"),
				validateModel: vi.fn().mockResolvedValue(true),
				getFallbackModels: vi.fn().mockReturnValue(["gpt-4o", "claude-3-5-sonnet"]),
				resetSwitchCount: vi.fn(),
				getSwitchCount: vi.fn().mockReturnValue(3),
				getCurrentModel: vi.fn().mockReturnValue("gpt-4"),
				setCurrentModel: vi.fn(),
				isMaxSwitchesReached: vi.fn().mockReturnValue(true),
				getSwitchHistory: vi.fn().mockReturnValue([]),
			}

			const strategy = new L3ModelSwitchStrategy(undefined, mockModelSwitcher)

			// 触发 5 次错误以达到阈值
			const error = new Error("Model error")
			for (let i = 0; i < 5; i++) {
				await strategy.canRecover(error, mockErrorContext)
			}

			const result = await strategy.recover(error, mockErrorContext)

			expect(result.success).toBe(false)
			expect(result.action).toBe("abort")
			expect(result.details.reason).toContain("达到最大切换次数")
		})

		test("应该在没有可用模型时终止", async () => {
			const mockModelSwitcher: IModelSwitcher = {
				switchModel: vi.fn().mockResolvedValue("model"),
				validateModel: vi.fn().mockResolvedValue(true),
				getFallbackModels: vi.fn().mockReturnValue([]),
				resetSwitchCount: vi.fn(),
				getSwitchCount: vi.fn().mockReturnValue(0),
				getCurrentModel: vi.fn().mockReturnValue("gpt-4"),
				setCurrentModel: vi.fn(),
				isMaxSwitchesReached: vi.fn().mockReturnValue(false),
				getSwitchHistory: vi.fn().mockReturnValue([]),
			}

			const strategy = new L3ModelSwitchStrategy(undefined, mockModelSwitcher)

			// 触发 5 次错误以达到阈值
			const error = new Error("Model error")
			for (let i = 0; i < 5; i++) {
				await strategy.canRecover(error, mockErrorContext)
			}

			const result = await strategy.recover(error, mockErrorContext)

			expect(result.success).toBe(false)
			expect(result.action).toBe("abort")
			expect(result.details.reason).toContain("没有可用的备用模型")
		})

		test("应该处理模型切换失败", async () => {
			const mockModelSwitcher: IModelSwitcher = {
				switchModel: vi.fn().mockRejectedValue(new Error("Switch failed")),
				validateModel: vi.fn().mockResolvedValue(true),
				getFallbackModels: vi.fn().mockReturnValue(["gpt-4o", "claude-3-5-sonnet"]),
				resetSwitchCount: vi.fn(),
				getSwitchCount: vi.fn().mockReturnValue(0),
				getCurrentModel: vi.fn().mockReturnValue("gpt-4"),
				setCurrentModel: vi.fn(),
				isMaxSwitchesReached: vi.fn().mockReturnValue(false),
				getSwitchHistory: vi.fn().mockReturnValue([]),
			}

			const strategy = new L3ModelSwitchStrategy(undefined, mockModelSwitcher)

			// 触发 5 次错误以达到阈值
			const error = new Error("Test error")
			for (let i = 0; i < 5; i++) {
				await strategy.canRecover(error, mockErrorContext)
			}

			const result = await strategy.recover(error, mockErrorContext)

			expect(result.success).toBe(false)
			expect(result.action).toBe("abort")
			expect(result.details.reason).toContain("模型切换失败")
		})

		test("应该处理模型验证失败", async () => {
			const mockModelSwitcher: IModelSwitcher = {
				switchModel: vi.fn().mockResolvedValue("model"),
				validateModel: vi.fn().mockResolvedValue(false),
				getFallbackModels: vi.fn().mockReturnValue(["gpt-4o", "claude-3-5-sonnet"]),
				resetSwitchCount: vi.fn(),
				getSwitchCount: vi.fn().mockReturnValue(0),
				getCurrentModel: vi.fn().mockReturnValue("gpt-4"),
				setCurrentModel: vi.fn(),
				isMaxSwitchesReached: vi.fn().mockReturnValue(false),
				getSwitchHistory: vi.fn().mockReturnValue([]),
			}

			const strategy = new L3ModelSwitchStrategy(undefined, mockModelSwitcher)

			// 触发 5 次错误以达到阈值
			const error = new Error("Test error")
			for (let i = 0; i < 5; i++) {
				await strategy.canRecover(error, mockErrorContext)
			}

			const result = await strategy.recover(error, mockErrorContext)

			expect(result.success).toBe(false)
			expect(result.action).toBe("abort")
			expect(result.details.reason).toContain("验证失败")
		})

		test("应该更新统计信息", async () => {
			const mockModelSwitcher: IModelSwitcher = {
				switchModel: vi.fn().mockResolvedValue("claude-3-5-sonnet"),
				validateModel: vi.fn().mockResolvedValue(true),
				getFallbackModels: vi.fn().mockReturnValue(["gpt-4o", "claude-3-5-sonnet"]),
				resetSwitchCount: vi.fn(),
				getSwitchCount: vi.fn().mockReturnValue(0),
				getCurrentModel: vi.fn().mockReturnValue("gpt-4"),
				setCurrentModel: vi.fn(),
				isMaxSwitchesReached: vi.fn().mockReturnValue(false),
				getSwitchHistory: vi.fn().mockReturnValue([]),
			}

			const strategy = new L3ModelSwitchStrategy(undefined, mockModelSwitcher)

			// 触发 5 次错误以达到阈值
			const error = new Error("Test error")
			for (let i = 0; i < 5; i++) {
				await strategy.canRecover(error, mockErrorContext)
			}

			await strategy.recover(error, mockErrorContext)

			const stats = strategy.getStatistics()
			expect(stats.totalExecutions).toBe(1)
			expect(stats.successCount).toBe(1)
			expect(stats.failureCount).toBe(0)
		})
	})

	describe("getCurrentErrorCount", () => {
		test("应该返回当前错误计数", async () => {
			const mockModelSwitcher: IModelSwitcher = {
				switchModel: vi.fn().mockResolvedValue("model"),
				validateModel: vi.fn().mockResolvedValue(true),
				getFallbackModels: vi.fn().mockReturnValue(["model1", "model2"]),
				resetSwitchCount: vi.fn(),
				getSwitchCount: vi.fn().mockReturnValue(0),
				getCurrentModel: vi.fn().mockReturnValue("gpt-4"),
				setCurrentModel: vi.fn(),
				isMaxSwitchesReached: vi.fn().mockReturnValue(false),
				getSwitchHistory: vi.fn().mockReturnValue([]),
			}

			const strategy = new L3ModelSwitchStrategy(undefined, mockModelSwitcher)

			const error = new Error("Test error")
			for (let i = 0; i < 3; i++) {
				await strategy.canRecover(error, mockErrorContext)
			}

			expect(strategy.getCurrentErrorCount()).toBe(3)
		})

		test("应该在重置后返回 0", async () => {
			const mockModelSwitcher: IModelSwitcher = {
				switchModel: vi.fn().mockResolvedValue("model"),
				validateModel: vi.fn().mockResolvedValue(true),
				getFallbackModels: vi.fn().mockReturnValue(["model1", "model2"]),
				resetSwitchCount: vi.fn(),
				getSwitchCount: vi.fn().mockReturnValue(0),
				getCurrentModel: vi.fn().mockReturnValue("gpt-4"),
				setCurrentModel: vi.fn(),
				isMaxSwitchesReached: vi.fn().mockReturnValue(false),
				getSwitchHistory: vi.fn().mockReturnValue([]),
			}

			const strategy = new L3ModelSwitchStrategy(undefined, mockModelSwitcher)

			const error = new Error("Test error")
			for (let i = 0; i < 3; i++) {
				await strategy.canRecover(error, mockErrorContext)
			}

			strategy.resetErrorCount()
			expect(strategy.getCurrentErrorCount()).toBe(0)
		})
	})

	describe("resetErrorCount", () => {
		test("应该重置错误计数", async () => {
			const mockModelSwitcher: IModelSwitcher = {
				switchModel: vi.fn().mockResolvedValue("model"),
				validateModel: vi.fn().mockResolvedValue(true),
				getFallbackModels: vi.fn().mockReturnValue(["model1", "model2"]),
				resetSwitchCount: vi.fn(),
				getSwitchCount: vi.fn().mockReturnValue(0),
				getCurrentModel: vi.fn().mockReturnValue("gpt-4"),
				setCurrentModel: vi.fn(),
				isMaxSwitchesReached: vi.fn().mockReturnValue(false),
				getSwitchHistory: vi.fn().mockReturnValue([]),
			}

			const strategy = new L3ModelSwitchStrategy(undefined, mockModelSwitcher)

			const error = new Error("Test error")
			for (let i = 0; i < 5; i++) {
				await strategy.canRecover(error, mockErrorContext)
			}

			strategy.resetErrorCount()
			expect(strategy.getCurrentErrorCount()).toBe(0)
		})
	})

	describe("getConfig", () => {
		test("应该返回当前配置", () => {
			const mockModelSwitcher: IModelSwitcher = {
				switchModel: vi.fn().mockResolvedValue("model"),
				validateModel: vi.fn().mockResolvedValue(true),
				getFallbackModels: vi.fn().mockReturnValue(["model1", "model2"]),
				resetSwitchCount: vi.fn(),
				getSwitchCount: vi.fn().mockReturnValue(0),
				getCurrentModel: vi.fn().mockReturnValue("gpt-4"),
				setCurrentModel: vi.fn(),
				isMaxSwitchesReached: vi.fn().mockReturnValue(false),
				getSwitchHistory: vi.fn().mockReturnValue([]),
			}

			const strategy = new L3ModelSwitchStrategy(undefined, mockModelSwitcher)

			const config = strategy.getConfig()
			expect(config.minErrorCount).toBe(5)
			expect(config.maxSwitches).toBe(3)
		})
	})

	describe("updateConfig", () => {
		test("应该更新配置", () => {
			const mockModelSwitcher: IModelSwitcher = {
				switchModel: vi.fn().mockResolvedValue("model"),
				validateModel: vi.fn().mockResolvedValue(true),
				getFallbackModels: vi.fn().mockReturnValue(["model1", "model2"]),
				resetSwitchCount: vi.fn(),
				getSwitchCount: vi.fn().mockReturnValue(0),
				getCurrentModel: vi.fn().mockReturnValue("gpt-4"),
				setCurrentModel: vi.fn(),
				isMaxSwitchesReached: vi.fn().mockReturnValue(false),
				getSwitchHistory: vi.fn().mockReturnValue([]),
			}

			const strategy = new L3ModelSwitchStrategy(undefined, mockModelSwitcher)

			const newConfig: L3ModelSwitchStrategyConfig = {
				minErrorCount: 6,
				maxSwitches: 5,
				triggerErrorTypes: ["new_type"],
				fallbackModels: ["model1", "model2"],
				retryDelay: 4000,
				validateBeforeSwitch: false,
			}

			strategy.updateConfig(newConfig)

			const config = strategy.getConfig()
			expect(config.minErrorCount).toBe(6)
			expect(config.maxSwitches).toBe(5)
			expect(config.triggerErrorTypes).toEqual(["new_type"])
			expect(config.retryDelay).toBe(4000)
		})
	})

	describe("getStatistics", () => {
		test("应该返回统计信息", async () => {
			const mockModelSwitcher: IModelSwitcher = {
				switchModel: vi.fn().mockResolvedValue("claude-3-5-sonnet"),
				validateModel: vi.fn().mockResolvedValue(true),
				getFallbackModels: vi.fn().mockReturnValue(["gpt-4o", "claude-3-5-sonnet"]),
				resetSwitchCount: vi.fn(),
				getSwitchCount: vi.fn().mockReturnValue(0),
				getCurrentModel: vi.fn().mockReturnValue("gpt-4"),
				setCurrentModel: vi.fn(),
				isMaxSwitchesReached: vi.fn().mockReturnValue(false),
				getSwitchHistory: vi.fn().mockReturnValue([]),
			}

			const strategy = new L3ModelSwitchStrategy(undefined, mockModelSwitcher)

			// 触发 5 次错误以达到阈值
			const error = new Error("Test error")
			for (let i = 0; i < 5; i++) {
				await strategy.canRecover(error, mockErrorContext)
			}

			await strategy.recover(error, mockErrorContext)

			const stats = strategy.getStatistics()
			expect(stats.totalExecutions).toBe(1)
			expect(stats.successCount).toBe(1)
			expect(stats.failureCount).toBe(0)
			expect(stats.averageDuration).toBeGreaterThan(0)
		})

		test("应该在多次执行后正确计算平均值", async () => {
			const mockModelSwitcher: IModelSwitcher = {
				switchModel: vi.fn().mockResolvedValue("claude-3-5-sonnet"),
				validateModel: vi.fn().mockResolvedValue(true),
				getFallbackModels: vi.fn().mockReturnValue(["gpt-4o", "claude-3-5-sonnet"]),
				resetSwitchCount: vi.fn(),
				getSwitchCount: vi.fn().mockReturnValue(0),
				getCurrentModel: vi.fn().mockReturnValue("gpt-4"),
				setCurrentModel: vi.fn(),
				isMaxSwitchesReached: vi.fn().mockReturnValue(false),
				getSwitchHistory: vi.fn().mockReturnValue([]),
			}

			const strategy = new L3ModelSwitchStrategy(undefined, mockModelSwitcher)

			// 触发 5 次错误以达到阈值
			const error = new Error("Test error")
			for (let i = 0; i < 5; i++) {
				await strategy.canRecover(error, mockErrorContext)
			}

			await strategy.recover(error, mockErrorContext)
			await strategy.recover(error, mockErrorContext)

			const stats = strategy.getStatistics()
			expect(stats.totalExecutions).toBe(2)
			expect(stats.successCount).toBe(2)
		})
	})

	describe("getSwitchHistory", () => {
		test("应该返回切换历史", async () => {
			const mockModelSwitcher: IModelSwitcher = {
				switchModel: vi.fn().mockResolvedValue("claude-3-5-sonnet"),
				validateModel: vi.fn().mockResolvedValue(true),
				getFallbackModels: vi.fn().mockReturnValue(["gpt-4o", "claude-3-5-sonnet"]),
				resetSwitchCount: vi.fn(),
				getSwitchCount: vi.fn().mockReturnValue(0),
				getCurrentModel: vi.fn().mockReturnValue("gpt-4"),
				setCurrentModel: vi.fn(),
				isMaxSwitchesReached: vi.fn().mockReturnValue(false),
				getSwitchHistory: vi.fn().mockReturnValue([]),
			}

			const strategy = new L3ModelSwitchStrategy(undefined, mockModelSwitcher)

			// 触发 5 次错误以达到阈值
			const error = new Error("Test error")
			for (let i = 0; i < 5; i++) {
				await strategy.canRecover(error, mockErrorContext)
			}

			await strategy.recover(error, mockErrorContext)

			const history = strategy.getSwitchHistory()
			expect(history.length).toBe(1)
			expect(history[0].fromModel).toBe("gpt-4")
			expect(history[0].toModel).toContain("claude-3-5-sonnet")
		})
	})

	describe("isMinErrorCountReached", () => {
		test("应该在达到最小错误计数时返回 true", async () => {
			const mockModelSwitcher: IModelSwitcher = {
				switchModel: vi.fn().mockResolvedValue("model"),
				validateModel: vi.fn().mockResolvedValue(true),
				getFallbackModels: vi.fn().mockReturnValue(["model1", "model2"]),
				resetSwitchCount: vi.fn(),
				getSwitchCount: vi.fn().mockReturnValue(0),
				getCurrentModel: vi.fn().mockReturnValue("gpt-4"),
				setCurrentModel: vi.fn(),
				isMaxSwitchesReached: vi.fn().mockReturnValue(false),
				getSwitchHistory: vi.fn().mockReturnValue([]),
			}

			const strategy = new L3ModelSwitchStrategy(undefined, mockModelSwitcher)

			const error = new Error("Test error")
			for (let i = 0; i < 5; i++) {
				await strategy.canRecover(error, mockErrorContext)
			}

			expect(strategy.isMinErrorCountReached()).toBe(true)
		})

		test("应该在未达到最小错误计数时返回 false", async () => {
			const mockModelSwitcher: IModelSwitcher = {
				switchModel: vi.fn().mockResolvedValue("model"),
				validateModel: vi.fn().mockResolvedValue(true),
				getFallbackModels: vi.fn().mockReturnValue(["model1", "model2"]),
				resetSwitchCount: vi.fn(),
				getSwitchCount: vi.fn().mockReturnValue(0),
				getCurrentModel: vi.fn().mockReturnValue("gpt-4"),
				setCurrentModel: vi.fn(),
				isMaxSwitchesReached: vi.fn().mockReturnValue(false),
				getSwitchHistory: vi.fn().mockReturnValue([]),
			}

			const strategy = new L3ModelSwitchStrategy(undefined, mockModelSwitcher)

			const error = new Error("Test error")
			for (let i = 0; i < 3; i++) {
				await strategy.canRecover(error, mockErrorContext)
			}

			expect(strategy.isMinErrorCountReached()).toBe(false)
		})
	})

	describe("isMaxSwitchesReached", () => {
		test("应该在达到最大切换次数时返回 true", () => {
			const mockModelSwitcher: IModelSwitcher = {
				switchModel: vi.fn().mockResolvedValue("model"),
				validateModel: vi.fn().mockResolvedValue(true),
				getFallbackModels: vi.fn().mockReturnValue(["model1", "model2"]),
				resetSwitchCount: vi.fn(),
				getSwitchCount: vi.fn().mockReturnValue(3),
				getCurrentModel: vi.fn().mockReturnValue("gpt-4"),
				setCurrentModel: vi.fn(),
				isMaxSwitchesReached: vi.fn().mockReturnValue(true),
				getSwitchHistory: vi.fn().mockReturnValue([]),
			}

			const strategy = new L3ModelSwitchStrategy(undefined, mockModelSwitcher)
			expect(strategy.isMaxSwitchesReached()).toBe(true)
		})

		test("应该在未达到最大切换次数时返回 false", () => {
			const mockModelSwitcher: IModelSwitcher = {
				switchModel: vi.fn().mockResolvedValue("model"),
				validateModel: vi.fn().mockResolvedValue(true),
				getFallbackModels: vi.fn().mockReturnValue(["model1", "model2"]),
				resetSwitchCount: vi.fn(),
				getSwitchCount: vi.fn().mockReturnValue(1),
				getCurrentModel: vi.fn().mockReturnValue("gpt-4"),
				setCurrentModel: vi.fn(),
				isMaxSwitchesReached: vi.fn().mockReturnValue(false),
				getSwitchHistory: vi.fn().mockReturnValue([]),
			}

			const strategy = new L3ModelSwitchStrategy(undefined, mockModelSwitcher)
			expect(strategy.isMaxSwitchesReached()).toBe(false)
		})

		test("应该在没有模型切换器时返回 false", () => {
			const strategyWithoutSwitcher = new L3ModelSwitchStrategy(undefined, undefined)
			expect(strategyWithoutSwitcher.isMaxSwitchesReached()).toBe(false)
		})
	})

	describe("getSwitchCount", () => {
		test("应该返回切换次数", () => {
			const mockModelSwitcher: IModelSwitcher = {
				switchModel: vi.fn().mockResolvedValue("model"),
				validateModel: vi.fn().mockResolvedValue(true),
				getFallbackModels: vi.fn().mockReturnValue(["model1", "model2"]),
				resetSwitchCount: vi.fn(),
				getSwitchCount: vi.fn().mockReturnValue(3),
				getCurrentModel: vi.fn().mockReturnValue("gpt-4"),
				setCurrentModel: vi.fn(),
				isMaxSwitchesReached: vi.fn().mockReturnValue(false),
				getSwitchHistory: vi.fn().mockReturnValue([]),
			}

			const strategy = new L3ModelSwitchStrategy(undefined, mockModelSwitcher)
			expect(strategy.getSwitchCount()).toBe(3)
		})

		test("应该在没有模型切换器时返回 0", () => {
			const strategyWithoutSwitcher = new L3ModelSwitchStrategy(undefined, undefined)
			expect(strategyWithoutSwitcher.getSwitchCount()).toBe(0)
		})
	})

	describe("getCurrentModel", () => {
		test("应该返回当前模型", () => {
			const mockModelSwitcher: IModelSwitcher = {
				switchModel: vi.fn().mockResolvedValue("model"),
				validateModel: vi.fn().mockResolvedValue(true),
				getFallbackModels: vi.fn().mockReturnValue(["model1", "model2"]),
				resetSwitchCount: vi.fn(),
				getSwitchCount: vi.fn().mockReturnValue(0),
				getCurrentModel: vi.fn().mockReturnValue("gpt-4o"),
				setCurrentModel: vi.fn(),
				isMaxSwitchesReached: vi.fn().mockReturnValue(false),
				getSwitchHistory: vi.fn().mockReturnValue([]),
			}

			const strategy = new L3ModelSwitchStrategy(undefined, mockModelSwitcher)
			expect(strategy.getCurrentModel()).toBe("gpt-4o")
		})

		test("应该在没有模型切换器时返回空字符串", () => {
			const strategyWithoutSwitcher = new L3ModelSwitchStrategy(undefined, undefined)
			expect(strategyWithoutSwitcher.getCurrentModel()).toBe("")
		})
	})
})
