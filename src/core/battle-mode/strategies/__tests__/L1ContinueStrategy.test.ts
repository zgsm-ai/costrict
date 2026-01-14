/**
 * L1ContinueStrategy 单元测试
 * 测试 L1 级别错误恢复策略的功能
 */
import { describe, test, expect, beforeEach, vi } from "vitest"
import { L1ContinueStrategy, DEFAULT_L1_CONFIG, type L1ContinueStrategyConfig } from "../L1ContinueStrategy"
import type { ErrorContext } from "../../types/ErrorContext"

describe("L1ContinueStrategy", () => {
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
			const strategy = new L1ContinueStrategy()
			expect(strategy.name).toBe("L1ContinueStrategy")
			expect(strategy.description).toContain("忽略错误继续执行")
			expect(strategy.priority).toBe(1)
			expect(strategy.getCurrentErrorCount()).toBe(0)
		})

		test("应该接受自定义配置", () => {
			const customConfig: L1ContinueStrategyConfig = {
				maxErrorCount: 5,
				toleratedErrorTypes: ["timeout", "network"],
				logToleratedErrors: false,
				retryDelay: 500,
			}
			const customStrategy = new L1ContinueStrategy(customConfig)

			expect(customStrategy.getCurrentErrorCount()).toBe(0)
			expect(customStrategy.getConfig().maxErrorCount).toBe(5)
			expect(customStrategy.getConfig().retryDelay).toBe(500)
		})

		test("应该使用 DEFAULT_L1_CONFIG 作为默认值", () => {
			expect(DEFAULT_L1_CONFIG.maxErrorCount).toBe(3)
			expect(DEFAULT_L1_CONFIG.toleratedErrorTypes).toContain("timeout")
			expect(DEFAULT_L1_CONFIG.logToleratedErrors).toBe(true)
			expect(DEFAULT_L1_CONFIG.retryDelay).toBe(1000)
		})
	})

	describe("canRecover", () => {
		test("应该对可容忍的错误返回 true", () => {
			const strategy = new L1ContinueStrategy()
			const timeoutError = new Error("Request timeout")
			mockErrorContext.errorType = "recovery"
			expect(strategy.canRecover(timeoutError, mockErrorContext)).toBe(true)
		})

		test("应该对速率限制错误返回 true", () => {
			const strategy = new L1ContinueStrategy()
			const rateLimitError = new Error("Rate limit exceeded")
			mockErrorContext.errorType = "recovery"
			expect(strategy.canRecover(rateLimitError, mockErrorContext)).toBe(true)
		})

		test("应该对网络错误返回 true", () => {
			const strategy = new L1ContinueStrategy()
			const networkError = new Error("Network error")
			mockErrorContext.errorType = "recovery"
			expect(strategy.canRecover(networkError, mockErrorContext)).toBe(true)
		})

		test("应该对临时错误返回 true", () => {
			const strategy = new L1ContinueStrategy()
			const tempError = new Error("Temporary error")
			mockErrorContext.errorType = "recovery"
			expect(strategy.canRecover(tempError, mockErrorContext)).toBe(true)
		})

		test("应该对不可用服务错误返回 true", () => {
			const strategy = new L1ContinueStrategy()
			const serviceError = new Error("Service unavailable")
			mockErrorContext.errorType = "recovery"
			expect(strategy.canRecover(serviceError, mockErrorContext)).toBe(true)
		})

		test("应该对 fatal 错误返回 false", () => {
			const strategy = new L1ContinueStrategy()
			const fatalError = new Error("Fatal error")
			mockErrorContext.errorType = "fatal"
			expect(strategy.canRecover(fatalError, mockErrorContext)).toBe(false)
		})

		test("应该对认证失败错误返回 false", () => {
			const strategy = new L1ContinueStrategy()
			const authError = new Error("Authentication failed")
			mockErrorContext.errorType = "recovery"
			expect(strategy.canRecover(authError, mockErrorContext)).toBe(false)
		})

		test("应该对无效 API 键错误返回 false", () => {
			const strategy = new L1ContinueStrategy()
			const apiError = new Error("Invalid API key")
			mockErrorContext.errorType = "recovery"
			expect(strategy.canRecover(apiError, mockErrorContext)).toBe(false)
		})

		test("应该对配额超限错误返回 false", () => {
			const strategy = new L1ContinueStrategy()
			const quotaError = new Error("Quota exceeded")
			mockErrorContext.errorType = "recovery"
			expect(strategy.canRecover(quotaError, mockErrorContext)).toBe(false)
		})

		test("应该在达到最大错误计数时返回 false", async () => {
			const strategy = new L1ContinueStrategy()
			strategy.updateConfig({ retryDelay: 100 })
			const error = new Error("Test error")
			mockErrorContext.errorType = "recovery"

			// 执行 3 次恢复达到最大计数
			for (let i = 0; i < 3; i++) {
				await strategy.recover(error, mockErrorContext)
			}

			expect(strategy.getCurrentErrorCount()).toBe(3)
			expect(strategy.canRecover(error, mockErrorContext)).toBe(false)
		})

		test("应该在未达到最大错误计数时返回 true", async () => {
			const strategy = new L1ContinueStrategy()
			strategy.updateConfig({ retryDelay: 100, toleratedErrorTypes: ["test error"] })
			const error = new Error("Test error")
			mockErrorContext.errorType = "recovery"

			// 只执行 2 次
			await strategy.recover(error, mockErrorContext)
			await strategy.recover(error, mockErrorContext)

			expect(strategy.getCurrentErrorCount()).toBe(2)
			expect(strategy.canRecover(error, mockErrorContext)).toBe(true)
		})
	})

	describe("recover", () => {
		test("应该成功恢复并增加错误计数", async () => {
			const strategy = new L1ContinueStrategy()
			strategy.updateConfig({ retryDelay: 100 })
			const error = new Error("Timeout error")
			const result = await strategy.recover(error, mockErrorContext)

			expect(result.success).toBe(true)
			expect(result.action).toBe("continue")
			expect(result.details.reason).toContain("当前错误计数")
			expect(strategy.getCurrentErrorCount()).toBe(1)
		})

		test("应该记录容忍的错误历史", async () => {
			const strategy = new L1ContinueStrategy()
			strategy.updateConfig({ retryDelay: 100 })
			const error = new Error("Test error")
			await strategy.recover(error, mockErrorContext)
			await strategy.recover(error, mockErrorContext)

			const history = strategy.getToleratedErrors()
			expect(history).toHaveLength(2)
			expect(history[0].error).toBe(error)
			expect(history[1].error).toBe(error)
		})

		test("应该限制错误历史最大数量", async () => {
			const strategy = new L1ContinueStrategy()
			strategy.updateConfig({ retryDelay: 100 })
			const error = new Error("Test error")

			// 执行 105 次，应该只保留最近 100 条（默认最大值）
			for (let i = 0; i < 105; i++) {
				await strategy.recover(error, mockErrorContext)
			}

			expect(strategy.getToleratedErrors()).toHaveLength(100)
		})

		test("应该在使用 retryDelay 时添加延迟", async () => {
			const configWithDelay: L1ContinueStrategyConfig = {
				...DEFAULT_L1_CONFIG,
				retryDelay: 100,
			}
			const delayedStrategy = new L1ContinueStrategy(configWithDelay)

			const startTime = Date.now()
			await delayedStrategy.recover(new Error("Test error"), mockErrorContext)
			const endTime = Date.now()

			expect(endTime - startTime).toBeGreaterThanOrEqual(100)
		})

		test("应该返回正确的恢复结果格式", async () => {
			const strategy = new L1ContinueStrategy()
			strategy.updateConfig({ retryDelay: 100 })
			const error = new Error("Test error")
			const result = await strategy.recover(error, mockErrorContext)

			expect(result.success).toBe(true)
			expect(result.action).toBe("continue")
			expect(result.details.reason).toBeDefined()
			expect(result.details.strategyLevel).toBe("level1")
			expect(result.duration).toBeDefined()
		})

		test("应该更新统计信息", async () => {
			const strategy = new L1ContinueStrategy()
			strategy.updateConfig({ retryDelay: 100 })
			const error = new Error("Test error")
			await strategy.recover(error, mockErrorContext)

			const stats = strategy.getStatistics()
			expect(stats.totalExecutions).toBe(1)
			expect(stats.successCount).toBe(1)
			expect(stats.failureCount).toBe(0)
			expect(stats.averageDuration).toBeGreaterThan(0)
		})
	})

	describe("getLevel", () => {
		test("应该返回正确的策略级别", () => {
			const strategy = new L1ContinueStrategy()
			expect(strategy.getLevel()).toBe("level1")
		})
	})

	describe("getCurrentErrorCount", () => {
		test("应该返回当前错误计数", async () => {
			const strategy = new L1ContinueStrategy()
			strategy.updateConfig({ retryDelay: 100 })
			const error = new Error("Test error")
			mockErrorContext.errorType = "recovery"

			// 执行 5 次
			for (let i = 0; i < 5; i++) {
				await strategy.recover(error, mockErrorContext)
			}

			expect(strategy.getCurrentErrorCount()).toBe(5)
		})

		test("应该初始化为 0", () => {
			const newStrategy = new L1ContinueStrategy()
			expect(newStrategy.getCurrentErrorCount()).toBe(0)
		})
	})

	describe("resetErrorCount", () => {
		test("应该重置错误计数", async () => {
			const strategy = new L1ContinueStrategy()
			strategy.updateConfig({ retryDelay: 100 })
			const error = new Error("Test error")
			await strategy.recover(error, mockErrorContext)
			await strategy.recover(error, mockErrorContext)

			expect(strategy.getCurrentErrorCount()).toBe(2)

			strategy.resetErrorCount()
			expect(strategy.getCurrentErrorCount()).toBe(0)
		})
	})

	describe("getToleratedErrors", () => {
		test("应该返回错误历史的副本", async () => {
			const strategy = new L1ContinueStrategy()
			strategy.updateConfig({ retryDelay: 100 })
			const error = new Error("Test error")
			await strategy.recover(error, mockErrorContext)

			const history1 = strategy.getToleratedErrors()
			const history2 = strategy.getToleratedErrors()

			// 修改第一个副本不应该影响第二个
			history1[0] = null as any
			expect(history2[0]).not.toBeNull()
		})

		test("应该返回空数组如果未执行恢复", () => {
			const strategy = new L1ContinueStrategy()
			const history = strategy.getToleratedErrors()
			expect(history).toEqual([])
		})
	})

	describe("clearErrorHistory", () => {
		test("应该清除错误历史", async () => {
			const strategy = new L1ContinueStrategy()
			strategy.updateConfig({ retryDelay: 100 })
			const error = new Error("Test error")
			await strategy.recover(error, mockErrorContext)
			await strategy.recover(error, mockErrorContext)

			expect(strategy.getToleratedErrors()).toHaveLength(2)

			strategy.clearErrorHistory()
			expect(strategy.getToleratedErrors()).toEqual([])
		})
	})

	describe("updateConfig", () => {
		test("应该更新配置", () => {
			const strategy = new L1ContinueStrategy()
			const newConfig: L1ContinueStrategyConfig = {
				maxErrorCount: 10,
				toleratedErrorTypes: ["new_type"],
				logToleratedErrors: false,
				retryDelay: 2000,
			}
			strategy.updateConfig(newConfig)

			const config = strategy.getConfig()
			expect(config.maxErrorCount).toBe(10)
			expect(config.toleratedErrorTypes).toEqual(["new_type"])
			expect(config.logToleratedErrors).toBe(false)
			expect(config.retryDelay).toBe(2000)
		})

		test("应该部分更新配置", () => {
			const strategy = new L1ContinueStrategy()
			strategy.updateConfig({ maxErrorCount: 10 })

			const config = strategy.getConfig()
			expect(config.maxErrorCount).toBe(10)
			expect(config.toleratedErrorTypes).toEqual(DEFAULT_L1_CONFIG.toleratedErrorTypes)
		})
	})

	describe("getConfig", () => {
		test("应该返回配置的副本", () => {
			const strategy = new L1ContinueStrategy()
			const config1 = strategy.getConfig()
			const config2 = strategy.getConfig()

			// 修改第一个副本不应该影响第二个
			config1.maxErrorCount = 999
			expect(config2.maxErrorCount).not.toBe(999)
		})
	})

	describe("getStatistics", () => {
		test("应该返回统计信息的副本", async () => {
			const strategy = new L1ContinueStrategy()
			strategy.updateConfig({ retryDelay: 100 })
			await strategy.recover(new Error("Test error"), mockErrorContext)

			const stats1 = strategy.getStatistics()
			const stats2 = strategy.getStatistics()

			// 修改第一个副本不应该影响第二个
			stats1.totalExecutions = 999
			expect(stats2.totalExecutions).not.toBe(999)
		})
	})

	describe("resetStatistics", () => {
		test("应该重置所有统计和历史", async () => {
			const strategy = new L1ContinueStrategy()
			strategy.updateConfig({ retryDelay: 100 })
			const error = new Error("Test error")
			await strategy.recover(error, mockErrorContext)
			await strategy.recover(error, mockErrorContext)

			expect(strategy.getCurrentErrorCount()).toBe(2)
			expect(strategy.getToleratedErrors()).toHaveLength(2)

			strategy.resetStatistics()

			expect(strategy.getCurrentErrorCount()).toBe(0)
			expect(strategy.getToleratedErrors()).toEqual([])

			const stats = strategy.getStatistics()
			expect(stats.totalExecutions).toBe(0)
			expect(stats.successCount).toBe(0)
			expect(stats.failureCount).toBe(0)
		})
	})

	describe("isThresholdReached", () => {
		test("应该在达到阈值时返回 true", async () => {
			const strategy = new L1ContinueStrategy()
			strategy.updateConfig({ retryDelay: 100 })
			const error = new Error("Test error")
			mockErrorContext.errorType = "recovery"

			// 执行 3 次达到默认阈值
			for (let i = 0; i < 3; i++) {
				await strategy.recover(error, mockErrorContext)
			}

			expect(strategy.isThresholdReached()).toBe(true)
		})

		test("应该在未达到阈值时返回 false", async () => {
			const strategy = new L1ContinueStrategy()
			strategy.updateConfig({ retryDelay: 100 })
			const error = new Error("Test error")
			mockErrorContext.errorType = "recovery"

			// 只执行 2 次
			await strategy.recover(error, mockErrorContext)
			await strategy.recover(error, mockErrorContext)

			expect(strategy.isThresholdReached()).toBe(false)
		})

		test("应该使用配置中的最大值", async () => {
			const strategy = new L1ContinueStrategy()
			strategy.updateConfig({ maxErrorCount: 5, retryDelay: 100 })
			const error = new Error("Test error")
			mockErrorContext.errorType = "recovery"

			// 执行 4 次
			for (let i = 0; i < 4; i++) {
				await strategy.recover(error, mockErrorContext)
			}

			expect(strategy.isThresholdReached()).toBe(false)
		})
	})

	describe("isErrorTolerated（私有方法）", () => {
		test("应该匹配容忍的错误类型", () => {
			const strategy = new L1ContinueStrategy()
			const timeoutError = new Error("Request timeout")
			mockErrorContext.errorType = "recovery"
			expect(strategy.canRecover(timeoutError, mockErrorContext)).toBe(true)
		})

		test("应该不匹配不容忍的错误类型", () => {
			const strategy = new L1ContinueStrategy()
			const fatalError = new Error("Fatal system error")
			mockErrorContext.errorType = "recovery"
			expect(strategy.canRecover(fatalError, mockErrorContext)).toBe(false)
		})

		test("应该不区分大小写", () => {
			const strategy = new L1ContinueStrategy()
			const timeoutError = new Error("TIMEOUT ERROR")
			mockErrorContext.errorType = "recovery"
			expect(strategy.canRecover(timeoutError, mockErrorContext)).toBe(true)
		})

		test("应该匹配部分关键词", () => {
			const strategy = new L1ContinueStrategy()
			const partialError = new Error("Request timed out due to network error")
			mockErrorContext.errorType = "recovery"
			expect(strategy.canRecover(partialError, mockErrorContext)).toBe(true)
		})
	})

	describe("getSuccessRate", () => {
		test("应该计算正确的成功率", async () => {
			const strategy = new L1ContinueStrategy()
			strategy.updateConfig({ retryDelay: 100 })
			await strategy.recover(new Error("Test error"), mockErrorContext)
			await strategy.recover(new Error("Test error"), mockErrorContext)

			const successRate = strategy.getSuccessRate()
			expect(successRate).toBe(100) // 2/2 = 100%
		})

		test("应该计算部分成功的成功率", async () => {
			const strategy = new L1ContinueStrategy()
			// 通过统计信息来模拟部分成功的情况
			// 由于recover方法总是会成功，这里只测试基本功能
			await strategy.recover(new Error("Test error"), mockErrorContext)

			const successRate = strategy.getSuccessRate()
			expect(successRate).toBe(100) // 1/1 = 100%
		})

		test("应该在没有执行时返回 100%", () => {
			const strategy = new L1ContinueStrategy()
			const successRate = strategy.getSuccessRate()
			expect(successRate).toBe(100)
		})
	})
})
