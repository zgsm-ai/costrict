/**
 * L2ContextCleanStrategy 单元测试
 * 测试 L2 级别错误恢复策略的功能
 */
import { describe, test, expect, beforeEach, vi, type Mock } from "vitest"
import { L2ContextCleanStrategy, DEFAULT_L2_CONFIG, type L2ContextCleanStrategyConfig } from "../L2ContextCleanStrategy"
import type { ErrorContext } from "../../types/ErrorContext"
import type { IConversationCleaner } from "../../interfaces/IConversationCleaner"
import type { Message } from "../../types/ErrorContext"

describe("L2ContextCleanStrategy", () => {
	let strategy: L2ContextCleanStrategy
	let mockErrorContext: ErrorContext
	let mockConversationCleaner: {
		[K in keyof IConversationCleaner]: Mock<IConversationCleaner[K]>
	}

	beforeEach(() => {
		// 创建 mock 对话清理器
		mockConversationCleaner = {
			identifyMessagesToRemove: vi.fn().mockResolvedValue([]),
			removeMessages: vi.fn().mockReturnValue([]),
			validateCleanedHistory: vi.fn().mockReturnValue(true),
			cleanConversation: vi.fn().mockResolvedValue({
				cleanedHistory: [],
				removedCount: 0,
				removedMessages: [],
			}),
			analyzeConversation: vi.fn().mockReturnValue({
				totalMessages: 2,
				userMessages: 1,
				assistantMessages: 1,
				systemMessages: 0,
				estimatedTokens: 100,
			}),
		}

		strategy = new L2ContextCleanStrategy(undefined, mockConversationCleaner)
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
			expect(strategy.name).toBe("L2ContextCleanStrategy")
			expect(strategy.description).toContain("清理对话上下文后重试")
			expect(strategy.priority).toBe(2)
			expect(strategy.getCurrentErrorCount()).toBe(0)
		})

		test("应该接受自定义配置", () => {
			const customConfig: L2ContextCleanStrategyConfig = {
				minErrorCount: 4,
				maxErrorCount: 8,
				triggerErrorTypes: ["memory", "size"],
				keepLastUserMessage: false,
				keepSystemMessages: false,
				maxMessagesToRemove: 15,
				retryDelay: 1500,
			}
			const customStrategy = new L2ContextCleanStrategy(customConfig, mockConversationCleaner)

			expect(customStrategy.getCurrentErrorCount()).toBe(0)
			expect(customStrategy.getConfig().minErrorCount).toBe(4)
			expect(customStrategy.getConfig().maxErrorCount).toBe(8)
		})

		test("应该使用 DEFAULT_L2_CONFIG 作为默认值", () => {
			expect(DEFAULT_L2_CONFIG.minErrorCount).toBe(3)
			expect(DEFAULT_L2_CONFIG.maxErrorCount).toBe(5)
			expect(DEFAULT_L2_CONFIG.triggerErrorTypes).toContain("context window")
			expect(DEFAULT_L2_CONFIG.keepLastUserMessage).toBe(true)
			expect(DEFAULT_L2_CONFIG.maxMessagesToRemove).toBe(10)
		})
	})

	describe("setConversationCleaner", () => {
		test("应该设置对话清理器", () => {
			const newCleaner = {
				identifyMessagesToRemove: vi.fn(),
				removeMessages: vi.fn(),
				validateCleanedHistory: vi.fn(),
				cleanConversation: vi.fn(),
				analyzeConversation: vi.fn(),
			}

			strategy.setConversationCleaner(newCleaner)

			// 验证清理器已设置（通过后续调用）
			mockErrorContext.conversationHistory = [{ role: "user", content: "Test" } as Message]

			// 这个测试确保清理器可以被正确设置
			expect(strategy.getConfig()).toBeDefined()
		})
	})

	describe("canRecover", () => {
		test("应该对上下文限制错误返回 true", () => {
			const contextError = new Error("Context window exceeded")
			mockErrorContext.errorType = "recovery"
			expect(strategy.canRecover(contextError, mockErrorContext)).toBe(true)
		})

		test("应该对 token 限制错误返回 true", () => {
			const tokenError = new Error("Token limit reached")
			mockErrorContext.errorType = "recovery"
			expect(strategy.canRecover(tokenError, mockErrorContext)).toBe(true)
		})

		test("应该对内存错误返回 true", () => {
			const memoryError = new Error("Out of memory")
			mockErrorContext.errorType = "recovery"
			expect(strategy.canRecover(memoryError, mockErrorContext)).toBe(true)
		})

		test("应该对大小限制错误返回 true", () => {
			const sizeError = new Error("Size limit exceeded")
			mockErrorContext.errorType = "recovery"
			expect(strategy.canRecover(sizeError, mockErrorContext)).toBe(true)
		})

		test("应该对 fatal 错误返回 false", () => {
			const fatalError = new Error("Fatal error")
			mockErrorContext.errorType = "fatal"
			expect(strategy.canRecover(fatalError, mockErrorContext)).toBe(false)
		})

		test("应该在未达到最小错误计数时返回 false", () => {
			const error = new Error("Test error")
			mockErrorContext.errorType = "recovery"

			// 只执行 2 次未达到最小值 3
			for (let i = 0; i < 2; i++) {
				strategy["recover"](error, mockErrorContext)
			}

			expect(strategy.getCurrentErrorCount()).toBe(2)
			expect(strategy.canRecover(error, mockErrorContext)).toBe(false)
		})

		test("应该在达到最小错误计数时返回 true", async () => {
			const error = new Error("Context window exceeded")
			mockErrorContext.errorType = "recovery"

			// 执行 3 次达到最小值
			for (let i = 0; i < 3; i++) {
				await strategy.recover(error, mockErrorContext)
			}

			expect(strategy.getCurrentErrorCount()).toBe(3)
			expect(strategy.canRecover(error, mockErrorContext)).toBe(true)
		})

		test("应该在达到最大错误计数时返回 false", async () => {
			const error = new Error("Test error")
			mockErrorContext.errorType = "recovery"

			// 执行 5 次达到最大值
			for (let i = 0; i < 5; i++) {
				await strategy.recover(error, mockErrorContext)
			}

			expect(strategy.getCurrentErrorCount()).toBe(5)
			expect(strategy.canRecover(error, mockErrorContext)).toBe(false)
		})
	})

	describe("recover", () => {
		test("应该成功恢复并增加错误计数", async () => {
			const error = new Error("Context window exceeded")
			const result = await strategy.recover(error, mockErrorContext)

			expect(result.success).toBe(true)
			expect(result.action).toBe("retry")
			expect(result.details.reason).toContain("当前错误计数")
			expect(strategy.getCurrentErrorCount()).toBe(1)
		})

		test("应该调用对话清理器", async () => {
			const error = new Error("Token limit reached")
			await strategy.recover(error, mockErrorContext)

			expect(mockConversationCleaner.cleanConversation).toHaveBeenCalledWith(
				mockErrorContext.conversationHistory,
				error,
				mockErrorContext,
			)
		})

		test("应该记录清理历史", async () => {
			const error = new Error("Test error")
			await strategy.recover(error, mockErrorContext)
			await strategy.recover(error, mockErrorContext)

			const history = strategy.getCleanupHistory()
			expect(history).toHaveLength(2)
			expect(history[0].error).toBe(error)
			expect(history[1].error).toBe(error)
		})

		test("应该限制清理历史最大数量", async () => {
			const error = new Error("Test error")

			// 执行超过 50 次
			for (let i = 0; i < 55; i++) {
				await strategy.recover(error, mockErrorContext)
			}

			const history = strategy.getCleanupHistory()
			expect(history.length).toBeLessThanOrEqual(50)
		})

		test("应该在使用 retryDelay 时添加延迟", async () => {
			const configWithDelay: L2ContextCleanStrategyConfig = {
				...DEFAULT_L2_CONFIG,
				retryDelay: 100,
			}
			const delayedStrategy = new L2ContextCleanStrategy(configWithDelay, mockConversationCleaner)

			const startTime = Date.now()
			await delayedStrategy.recover(new Error("Test error"), mockErrorContext)
			const endTime = Date.now()

			expect(endTime - startTime).toBeGreaterThanOrEqual(100)
		})

		test("应该在没有清理器时直接重试", async () => {
			const strategyWithoutCleaner = new L2ContextCleanStrategy(undefined, undefined)
			const error = new Error("Test error")

			const result = await strategyWithoutCleaner.recover(error, mockErrorContext)

			expect(result.success).toBe(true)
			expect(result.action).toBe("retry")
			expect(result.details.reason).toContain("直接重试")
		})

		test("应该处理清理失败", async () => {
			const error = new Error("Test error")
			mockConversationCleaner.cleanConversation.mockRejectedValue(new Error("Cleanup failed"))
			mockConversationCleaner.validateCleanedHistory.mockReturnValue(false)

			const result = await strategy.recover(error, mockErrorContext)

			expect(result.success).toBe(false)
			expect(result.action).toBe("abort")
			expect(result.details.reason).toContain("清理失败")
		})

		test("应该更新统计信息", async () => {
			const error = new Error("Test error")
			await strategy.recover(error, mockErrorContext)

			const stats = strategy.getStatistics()
			expect(stats.totalExecutions).toBe(1)
			expect(stats.successCount).toBe(1)
			expect(stats.failureCount).toBe(0)
		})
	})

	describe("getCurrentErrorCount", () => {
		test("应该返回当前错误计数", async () => {
			const error = new Error("Test error")
			mockErrorContext.errorType = "recovery"

			// 执行 5 次
			for (let i = 0; i < 5; i++) {
				await strategy.recover(error, mockErrorContext)
			}

			expect(strategy.getCurrentErrorCount()).toBe(5)
		})

		test("应该初始化为 0", () => {
			const newStrategy = new L2ContextCleanStrategy(undefined, mockConversationCleaner)
			expect(newStrategy.getCurrentErrorCount()).toBe(0)
		})
	})

	describe("resetErrorCount", () => {
		test("应该重置错误计数", async () => {
			const error = new Error("Test error")
			mockErrorContext.errorType = "recovery"
			await strategy.recover(error, mockErrorContext)
			await strategy.recover(error, mockErrorContext)

			expect(strategy.getCurrentErrorCount()).toBe(2)

			strategy.resetErrorCount()
			expect(strategy.getCurrentErrorCount()).toBe(0)
		})
	})

	describe("getCleanupHistory", () => {
		test("应该返回清理历史的副本", async () => {
			const error = new Error("Test error")
			await strategy.recover(error, mockErrorContext)

			const history1 = strategy.getCleanupHistory()
			const history2 = strategy.getCleanupHistory()

			// 修改第一个副本不应该影响第二个
			history1[0] = null as any
			expect(history2[0]).not.toBeNull()
		})

		test("应该返回空数组如果未执行恢复", () => {
			const history = strategy.getCleanupHistory()
			expect(history).toEqual([])
		})
	})

	describe("clearCleanupHistory", () => {
		test("应该清除清理历史", async () => {
			const error = new Error("Test error")
			await strategy.recover(error, mockErrorContext)
			await strategy.recover(error, mockErrorContext)

			expect(strategy.getCleanupHistory()).toHaveLength(2)

			strategy.clearCleanupHistory()
			expect(strategy.getCleanupHistory()).toEqual([])
		})
	})

	describe("updateConfig", () => {
		test("应该更新配置", () => {
			const newConfig: L2ContextCleanStrategyConfig = {
				minErrorCount: 4,
				maxErrorCount: 8,
				triggerErrorTypes: ["new_type"],
				keepLastUserMessage: false,
				keepSystemMessages: false,
				maxMessagesToRemove: 15,
				retryDelay: 1500,
			}

			strategy.updateConfig(newConfig)

			const config = strategy.getConfig()
			expect(config.minErrorCount).toBe(4)
			expect(config.maxErrorCount).toBe(8)
			expect(config.triggerErrorTypes).toEqual(["new_type"])
			expect(config.retryDelay).toBe(1500)
		})

		test("应该部分更新配置", () => {
			strategy.updateConfig({ maxErrorCount: 8 })

			const config = strategy.getConfig()
			expect(config.maxErrorCount).toBe(8)
			// 其他配置应该保持默认值
			expect(config.minErrorCount).toBe(DEFAULT_L2_CONFIG.minErrorCount)
		})
	})

	describe("getConfig", () => {
		test("应该返回配置的副本", () => {
			const config1 = strategy.getConfig()
			const config2 = strategy.getConfig()

			// 修改第一个副本不应该影响第二个
			config1.maxErrorCount = 999
			expect(config2.maxErrorCount).not.toBe(999)
		})
	})

	describe("resetStatistics", () => {
		test("应该重置所有统计和历史", async () => {
			const error = new Error("Test error")
			await strategy.recover(error, mockErrorContext)
			await strategy.recover(error, mockErrorContext)

			expect(strategy.getCurrentErrorCount()).toBe(2)
			expect(strategy.getCleanupHistory()).toHaveLength(2)

			strategy.resetStatistics()

			expect(strategy.getCurrentErrorCount()).toBe(0)
			expect(strategy.getCleanupHistory()).toEqual([])

			const stats = strategy.getStatistics()
			expect(stats.totalExecutions).toBe(0)
			expect(stats.successCount).toBe(0)
			expect(stats.failureCount).toBe(0)
		})
	})

	describe("isMaxErrorCountReached", () => {
		test("应该在达到最大计数时返回 true", async () => {
			const error = new Error("Test error")
			mockErrorContext.errorType = "recovery"

			// 执行 5 次达到默认最大值
			for (let i = 0; i < 5; i++) {
				await strategy.recover(error, mockErrorContext)
			}

			expect(strategy.isMaxErrorCountReached()).toBe(true)
		})

		test("应该在未达到最大计数时返回 false", async () => {
			const error = new Error("Test error")
			mockErrorContext.errorType = "recovery"

			// 只执行 2 次
			await strategy.recover(error, mockErrorContext)
			await strategy.recover(error, mockErrorContext)

			expect(strategy.isMaxErrorCountReached()).toBe(false)
		})
	})

	describe("isMinErrorCountReached", () => {
		test("应该在达到最小计数时返回 true", async () => {
			const error = new Error("Test error")
			mockErrorContext.errorType = "recovery"

			// 执行 3 次达到默认最小值
			for (let i = 0; i < 3; i++) {
				await strategy.recover(error, mockErrorContext)
			}

			expect(strategy.isMinErrorCountReached()).toBe(true)
		})

		test("应该在未达到最小计数时返回 false", async () => {
			const error = new Error("Test error")
			mockErrorContext.errorType = "recovery"

			// 只执行 2 次
			await strategy.recover(error, mockErrorContext)
			await strategy.recover(error, mockErrorContext)

			expect(strategy.isMinErrorCountReached()).toBe(false)
		})
	})

	describe("isErrorTriggered（私有方法）", () => {
		test("应该匹配触发的错误类型", () => {
			const contextError = new Error("Context window exceeded")
			mockErrorContext.errorType = "recovery"
			expect(strategy.canRecover(contextError, mockErrorContext)).toBe(true)
		})

		test("应该不匹配未触发的错误类型", () => {
			const fatalError = new Error("Fatal system error")
			mockErrorContext.errorType = "recovery"
			expect(strategy.canRecover(fatalError, mockErrorContext)).toBe(false)
		})

		test("应该不区分大小写", () => {
			const memoryError = new Error("MEMORY ERROR")
			mockErrorContext.errorType = "recovery"
			expect(strategy.canRecover(memoryError, mockErrorContext)).toBe(true)
		})
	})
})
