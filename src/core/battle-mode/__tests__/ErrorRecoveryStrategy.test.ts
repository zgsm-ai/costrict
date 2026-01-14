/**
 * ErrorRecoveryStrategy 单元测试
 * 测试基础错误恢复策略类的功能
 */
import { describe, test, expect, vi, beforeEach } from "vitest"
import { ErrorRecoveryStrategy, type StrategyStatistics } from "../ErrorRecoveryStrategy"
import type { ErrorContext } from "../types/ErrorContext"
import type { RecoveryResult } from "../types/RecoveryResult"
import { RecoveryStrategyLevel } from "../interfaces/IErrorRecoveryStrategy"

// 创建一个测试用的具体策略类
class TestStrategy extends ErrorRecoveryStrategy {
	private shouldFail: boolean = false

	constructor(shouldFail: boolean = false) {
		super("TestStrategy", "测试策略", 1, RecoveryStrategyLevel.Level1)
		this.shouldFail = shouldFail
	}

	protected async doRecover(error: Error, context: ErrorContext): Promise<RecoveryResult> {
		// 添加一个小的延迟以确保有实际的执行时间
		await new Promise((resolve) => setTimeout(resolve, 1))

		if (this.shouldFail) {
			throw new Error("测试失败")
		}
		return this.createContinueResult("测试恢复成功")
	}
}

describe("ErrorRecoveryStrategy", () => {
	let strategy: TestStrategy
	let mockErrorContext: ErrorContext

	beforeEach(() => {
		strategy = new TestStrategy()
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

	describe("构造函数", () => {
		test("应该正确设置策略属性", () => {
			expect(strategy.name).toBe("TestStrategy")
			expect(strategy.description).toBe("测试策略")
			expect(strategy.priority).toBe(1)
			expect(strategy.getLevel()).toBe(RecoveryStrategyLevel.Level1)
		})

		test("应该初始化统计信息", () => {
			const stats = strategy.getStatistics()
			expect(stats.totalExecutions).toBe(0)
			expect(stats.successCount).toBe(0)
			expect(stats.failureCount).toBe(0)
			expect(stats.averageDuration).toBe(0)
		})
	})

	describe("canRecover", () => {
		test("应该对非 fatal 错误返回 true", () => {
			const error = new Error("Test error")
			mockErrorContext.errorType = "recovery"
			expect(strategy.canRecover(error, mockErrorContext)).toBe(true)
		})

		test("应该对 fatal 错误返回 false", () => {
			const error = new Error("Fatal error")
			mockErrorContext.errorType = "fatal"
			expect(strategy.canRecover(error, mockErrorContext)).toBe(false)
		})

		test("应该拒绝包含认证失败关键词的错误", () => {
			const authError = new Error("Authentication failed")
			mockErrorContext.errorType = "recovery"
			expect(strategy.canRecover(authError, mockErrorContext)).toBe(false)
		})

		test("应该拒绝包含无效 API 键的错误", () => {
			const keyError = new Error("Invalid API key")
			mockErrorContext.errorType = "recovery"
			expect(strategy.canRecover(keyError, mockErrorContext)).toBe(false)
		})

		test("应该拒绝包含配额超限的错误", () => {
			const quotaError = new Error("Quota exceeded")
			mockErrorContext.errorType = "recovery"
			expect(strategy.canRecover(quotaError, mockErrorContext)).toBe(false)
		})

		test("应该接受普通可恢复错误", () => {
			const error = new Error("Network timeout")
			mockErrorContext.errorType = "recovery"
			expect(strategy.canRecover(error, mockErrorContext)).toBe(true)
		})
	})

	describe("recover", () => {
		test("应该成功执行恢复并更新统计", async () => {
			const error = new Error("Test error")
			const result = await strategy.recover(error, mockErrorContext)

			expect(result.success).toBe(true)
			expect(result.action).toBe("continue")
			expect(result.details.reason).toContain("测试恢复成功")

			const stats = strategy.getStatistics()
			expect(stats.totalExecutions).toBe(1)
			expect(stats.successCount).toBe(1)
			expect(stats.failureCount).toBe(0)
			expect(stats.averageDuration).toBeGreaterThan(0)
			expect(stats.lastExecutionTime).toBeDefined()
		})

		test("应该在失败时记录错误统计", async () => {
			const failingStrategy = new TestStrategy(true)
			const error = new Error("Test error")

			const result = await failingStrategy.recover(error, mockErrorContext)

			expect(result.success).toBe(false)
			expect(result.action).toBe("abort")

			const stats = failingStrategy.getStatistics()
			expect(stats.totalExecutions).toBe(1)
			expect(stats.successCount).toBe(0)
			expect(stats.failureCount).toBe(1)
		})

		test("应该计算平均执行时间", async () => {
			const error = new Error("Test error")
			await strategy.recover(error, mockErrorContext)
			await strategy.recover(error, mockErrorContext)
			await strategy.recover(error, mockErrorContext)

			const stats = strategy.getStatistics()
			expect(stats.totalExecutions).toBe(3)
			expect(stats.successCount).toBe(3)
			expect(stats.averageDuration).toBeGreaterThan(0)
		})
	})

	describe("getLevel", () => {
		test("应该返回正确的策略级别", () => {
			expect(strategy.getLevel()).toBe(RecoveryStrategyLevel.Level1)
		})
	})

	describe("getStatistics", () => {
		test("应该返回统计信息的副本", async () => {
			const error = new Error("Test error")
			await strategy.recover(error, mockErrorContext)

			const stats1 = strategy.getStatistics()
			const stats2 = strategy.getStatistics()

			// 修改第一个副本不应该影响第二个
			stats1.totalExecutions = 999
			expect(stats2.totalExecutions).toBe(1)
		})
	})

	describe("resetStatistics", () => {
		test("应该重置统计信息", async () => {
			const error = new Error("Test error")
			await strategy.recover(error, mockErrorContext)
			await strategy.recover(error, mockErrorContext)

			strategy.resetStatistics()

			const stats = strategy.getStatistics()
			expect(stats.totalExecutions).toBe(0)
			expect(stats.successCount).toBe(0)
			expect(stats.failureCount).toBe(0)
			expect(stats.averageDuration).toBe(0)
			expect(stats.lastExecutionTime).toBeUndefined()
		})
	})

	describe("getSuccessRate", () => {
		test("应该计算正确的成功率", async () => {
			const error = new Error("Test error")

			// 3 次成功
			await strategy.recover(error, mockErrorContext)
			await strategy.recover(error, mockErrorContext)
			await strategy.recover(error, mockErrorContext)

			expect(strategy.getSuccessRate()).toBe(100)
		})

		test("应该计算部分成功的成功率", async () => {
			const error = new Error("Test error")
			const failingStrategy = new TestStrategy(true)

			// 2 次成功
			await strategy.recover(error, mockErrorContext)
			await strategy.recover(error, mockErrorContext)

			// 1 次失败
			await failingStrategy.recover(error, mockErrorContext)

			expect(strategy.getSuccessRate()).toBe(100)
			expect(failingStrategy.getSuccessRate()).toBe(0)
		})

		test("应该在没有执行时返回 100%", () => {
			expect(strategy.getSuccessRate()).toBe(100)
		})
	})

	describe("恢复结果格式", () => {
		test("应该返回正确的继续执行结果格式", async () => {
			const error = new Error("Test error")
			const result = await strategy.recover(error, mockErrorContext)

			expect(result.success).toBe(true)
			expect(result.action).toBe("continue")
			expect(result.details.reason).toBeDefined()
			expect(result.details.strategyLevel).toBe(RecoveryStrategyLevel.Level1)
			expect(result.duration).toBeDefined()
		})

		test("应该返回正确的中止结果格式", async () => {
			const failingStrategy = new TestStrategy(true)
			const error = new Error("Test error")
			const result = await failingStrategy.recover(error, mockErrorContext)

			expect(result.success).toBe(false)
			expect(result.action).toBe("abort")
			expect(result.details.reason).toContain("失败")
			expect(result.details.strategyLevel).toBe(RecoveryStrategyLevel.Level1)
			expect(result.duration).toBeDefined()
		})
	})

	describe("辅助方法（通过子类暴露）", () => {
		// 创建一个测试子类来暴露受保护的方法
		class TestStrategyExposed extends TestStrategy {
			public createContinueResultExposed(reason: string) {
				return this.createContinueResult(reason)
			}

			public createRetryResultExposed(reason: string) {
				return this.createRetryResult(reason)
			}

			public createSwitchModelResultExposed(model: string, reason: string) {
				return this.createSwitchModelResult(model, reason)
			}

			public createAbortResultExposed(reason: string) {
				return this.createAbortResult(reason)
			}
		}

		test("createContinueResult 应该创建继续执行的结果", () => {
			const exposedStrategy = new TestStrategyExposed()
			const result = exposedStrategy.createContinueResultExposed("继续测试")

			expect(result.action).toBe("continue")
			expect(result.success).toBe(true)
			expect(result.details.reason).toBe("继续测试")
			expect(result.details.strategyLevel).toBe(RecoveryStrategyLevel.Level1)
		})

		test("createRetryResult 应该创建重试的结果", () => {
			const exposedStrategy = new TestStrategyExposed()
			const result = exposedStrategy.createRetryResultExposed("重试测试")

			expect(result.action).toBe("retry")
			expect(result.success).toBe(true)
			expect(result.details.reason).toBe("重试测试")
			expect(result.details.strategyLevel).toBe(RecoveryStrategyLevel.Level1)
		})

		test("createSwitchModelResult 应该创建模型切换的结果", () => {
			const exposedStrategy = new TestStrategyExposed()
			const result = exposedStrategy.createSwitchModelResultExposed("gpt-4", "切换测试")

			expect(result.action).toBe("switch_model")
			expect(result.success).toBe(true)
			expect(result.details.switchedToModel).toBe("gpt-4")
			expect(result.details.reason).toBe("切换测试")
			expect(result.details.strategyLevel).toBe(RecoveryStrategyLevel.Level1)
		})

		test("createAbortResult 应该创建中止的结果", () => {
			const exposedStrategy = new TestStrategyExposed()
			const result = exposedStrategy.createAbortResultExposed("中止测试")

			expect(result.action).toBe("abort")
			expect(result.success).toBe(false)
			expect(result.details.reason).toBe("中止测试")
			expect(result.details.strategyLevel).toBe(RecoveryStrategyLevel.Level1)
		})
	})
})
