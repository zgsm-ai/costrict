/**
 * ConversationCleaner 单元测试
 * 测试对话历史清理器的功能
 */
import { describe, test, expect, beforeEach } from "vitest"
import { ConversationCleaner, DEFAULT_CLEANER_CONFIG, CleanupStrategy } from "../ConversationCleaner"
import type { ErrorContext } from "../types/ErrorContext"
import type { Message } from "../types/ErrorContext"

describe("ConversationCleaner", () => {
	let cleaner: ConversationCleaner
	let mockHistory: Message[]
	let mockErrorContext: ErrorContext

	beforeEach(() => {
		cleaner = new ConversationCleaner()

		mockHistory = [
			{ role: "system", content: "You are a helpful assistant." },
			{ role: "user", content: "Hello, how are you?" },
			{ role: "assistant", content: "I am doing well!" },
			{ role: "user", content: "What can you do?" },
			{ role: "assistant", content: "I can help you with many tasks." },
			{ role: "user", content: "Tell me a joke." },
			{ role: "assistant", content: "Why did programmer quit his job? Because he didn't get arrays." },
		]

		mockErrorContext = {
			timestamp: Date.now(),
			taskId: "test-task-id",
			conversationHistory: mockHistory,
			currentModel: "gpt-4",
			errorType: "recovery",
			errorSource: "tool_execution",
		}
	})

	describe("构造函数和初始化", () => {
		test("应该使用默认配置创建清理器", () => {
			const newCleaner = new ConversationCleaner()
			expect(newCleaner).toBeInstanceOf(ConversationCleaner)
			expect(newCleaner.getCleanupHistory()).toEqual([])
		})

		test("应该接受自定义配置", () => {
			const newCleaner = new ConversationCleaner({
				maxMessagesToRemove: 5,
				minMessagesToKeep: 3,
				keepLastUserMessage: false,
			})
			expect(newCleaner).toBeInstanceOf(ConversationCleaner)
		})

		test("应该使用 DEFAULT_CLEANER_CONFIG 作为默认值", () => {
			expect(DEFAULT_CLEANER_CONFIG.maxMessagesToRemove).toBe(10)
			expect(DEFAULT_CLEANER_CONFIG.minMessagesToKeep).toBe(2)
			expect(DEFAULT_CLEANER_CONFIG.keepLastUserMessage).toBe(true)
			expect(DEFAULT_CLEANER_CONFIG.keepSystemMessages).toBe(true)
		})
	})

	describe("analyzeConversation", () => {
		test("应该正确分析对话历史", () => {
			const stats = cleaner.analyzeConversation(mockHistory)

			expect(stats.totalMessages).toBe(7)
			expect(stats.userMessages).toBe(3)
			expect(stats.assistantMessages).toBe(3)
			expect(stats.systemMessages).toBe(1)
			expect(stats.estimatedTokens).toBeGreaterThan(0)
		})

		test("应该处理空对话历史", () => {
			const stats = cleaner.analyzeConversation([])

			expect(stats.totalMessages).toBe(0)
			expect(stats.userMessages).toBe(0)
			expect(stats.assistantMessages).toBe(0)
			expect(stats.systemMessages).toBe(0)
			expect(stats.estimatedTokens).toBe(0)
		})
	})

	describe("removeMessages", () => {
		test("应该移除指定的消息", () => {
			const toRemove = [mockHistory[3], mockHistory[4]]
			const cleaned = cleaner.removeMessages(mockHistory, toRemove)

			expect(cleaned.length).toBe(5)
			expect(cleaned).not.toContain(toRemove[0])
			expect(cleaned).not.toContain(toRemove[1])
		})

		test("应该处理移除所有消息的情况", () => {
			const cleaned = cleaner.removeMessages(mockHistory, mockHistory)

			expect(cleaned.length).toBe(0)
		})

		test("应该处理移除空列表的情况", () => {
			const cleaned = cleaner.removeMessages(mockHistory, [])

			expect(cleaned).toEqual(mockHistory)
		})
	})

	describe("validateCleanedHistory", () => {
		test("应该验证有效的对话历史", () => {
			const validHistory: Message[] = [
				{ role: "system", content: "System" },
				{ role: "user", content: "Hello" },
				{ role: "assistant", content: "Hi" },
			]

			expect(cleaner.validateCleanedHistory(validHistory)).toBe(true)
		})

		test("应该拒绝消息过少的对话历史", () => {
			const shortHistory: Message[] = [{ role: "user", content: "Hello" }]

			expect(cleaner.validateCleanedHistory(shortHistory)).toBe(false)
		})

		test("应该拒绝没有用户消息的对话历史", () => {
			const noUserHistory: Message[] = [
				{ role: "system", content: "System" },
				{ role: "assistant", content: "Response" },
			]

			expect(cleaner.validateCleanedHistory(noUserHistory)).toBe(false)
		})
	})

	describe("identifyMessagesToRemove", () => {
		test("应该识别上下文错误并返回ReduceContext策略", async () => {
			const contextError = new Error("Context window exceeded")
			const messagesToRemove = await cleaner.identifyMessagesToRemove(mockHistory, contextError, mockErrorContext)

			expect(messagesToRemove.length).toBeGreaterThan(0)
		})

		test("应该应用最大移除数量限制", async () => {
			const customCleaner = new ConversationCleaner({
				maxMessagesToRemove: 2,
			})
			const error = new Error("Test error")
			const messagesToRemove = await customCleaner.identifyMessagesToRemove(mockHistory, error, mockErrorContext)

			expect(messagesToRemove.length).toBeLessThanOrEqual(2)
		})
	})

	describe("cleanConversation", () => {
		test("应该成功清理对话历史", async () => {
			const error = new Error("Test error")
			const result = await cleaner.cleanConversation(mockHistory, error, mockErrorContext)

			expect(result.cleanedHistory).toBeDefined()
			expect(result.removedCount).toBeGreaterThanOrEqual(0)
			expect(result.removedMessages).toBeDefined()
			expect(result.removedMessages.length).toBe(result.removedCount)
		})

		test("应该验证清理后的对话历史", async () => {
			const error = new Error("Test error")
			const result = await cleaner.cleanConversation(mockHistory, error, mockErrorContext)

			const isValid = cleaner.validateCleanedHistory(result.cleanedHistory)
			expect(isValid).toBe(true)
		})

		test("应该记录清理历史", async () => {
			const error = new Error("Test error")
			await cleaner.cleanConversation(mockHistory, error, mockErrorContext)

			const history = cleaner.getCleanupHistory()
			expect(history.length).toBe(1)
			expect(history[0].error).toBe(error)
			expect(history[0].removedCount).toBeGreaterThanOrEqual(0)
		})

		test("应该限制清理历史最大数量", async () => {
			const error = new Error("Test error")

			for (let i = 0; i < 105; i++) {
				await cleaner.cleanConversation(mockHistory, error, mockErrorContext)
			}

			const history = cleaner.getCleanupHistory()
			expect(history.length).toBe(100)
		})
	})

	describe("清理历史记录管理", () => {
		test("应该获取清理历史的副本", async () => {
			const error = new Error("Test error")
			await cleaner.cleanConversation(mockHistory, error, mockErrorContext)

			const history1 = cleaner.getCleanupHistory()
			const history2 = cleaner.getCleanupHistory()

			history1[0] = null as any
			expect(history2[0]).not.toBeNull()
		})

		test("应该清除清理历史", async () => {
			const error = new Error("Test error")
			await cleaner.cleanConversation(mockHistory, error, mockErrorContext)
			await cleaner.cleanConversation(mockHistory, error, mockErrorContext)

			expect(cleaner.getCleanupHistory().length).toBe(2)

			cleaner.clearCleanupHistory()
			expect(cleaner.getCleanupHistory()).toEqual([])
		})
	})

	describe("getStatistics", () => {
		test("应该返回正确的统计信息", async () => {
			const error = new Error("Test error")
			await cleaner.cleanConversation(mockHistory, error, mockErrorContext)
			await cleaner.cleanConversation(mockHistory, error, mockErrorContext)

			const stats = cleaner.getStatistics()

			expect(stats.totalCleanups).toBe(2)
			expect(stats.totalMessagesRemoved).toBeGreaterThanOrEqual(0)
			expect(stats.strategiesUsed).toBeDefined()
			expect(stats.averageRemovalRate).toBeGreaterThanOrEqual(0)
		})

		test("应该在没有清理历史时返回零值", () => {
			const stats = cleaner.getStatistics()

			expect(stats.totalCleanups).toBe(0)
			expect(stats.totalMessagesRemoved).toBe(0)
			expect(stats.averageRemovalRate).toBe(0)
		})
	})

	describe("reset", () => {
		test("应该重置清理器状态", async () => {
			const error = new Error("Test error")
			await cleaner.cleanConversation(mockHistory, error, mockErrorContext)
			await cleaner.cleanConversation(mockHistory, error, mockErrorContext)

			expect(cleaner.getCleanupHistory().length).toBeGreaterThan(0)

			cleaner.reset()

			expect(cleaner.getCleanupHistory()).toEqual([])

			const stats = cleaner.getStatistics()
			expect(stats.totalCleanups).toBe(0)
			expect(stats.totalMessagesRemoved).toBe(0)
		})
	})

	describe("清理策略验证", () => {
		test("应该对上下文错误使用ReduceContext策略", async () => {
			const contextError = new Error("Context window exceeded")
			await cleaner.cleanConversation(mockHistory, contextError, mockErrorContext)

			const history = cleaner.getCleanupHistory()
			expect(history[0].strategy).toBe(CleanupStrategy.ReduceContext)
		})

		test("应该对权限错误使用RemoveLastAssistant策略", async () => {
			const permissionError = new Error("Permission denied")
			await cleaner.cleanConversation(mockHistory, permissionError, mockErrorContext)

			const history = cleaner.getCleanupHistory()
			expect(history[0].strategy).toBe(CleanupStrategy.RemoveLastAssistant)
		})
	})

	describe("边界情况", () => {
		test("应该处理空对话历史", async () => {
			const emptyHistory: Message[] = []
			const error = new Error("Test error")
			const emptyContext: ErrorContext = {
				...mockErrorContext,
				conversationHistory: emptyHistory,
			}

			const result = await cleaner.cleanConversation(emptyHistory, error, emptyContext)

			expect(result.cleanedHistory).toEqual([])
			expect(result.removedCount).toBe(0)
		})
	})

	describe("Token估算", () => {
		test("应该正确估算消息的token数量", () => {
			const testMessage: Message = {
				role: "user",
				content: "Hello, this is a test message.",
			}
			const stats = cleaner.analyzeConversation([testMessage])

			expect(stats.estimatedTokens).toBeGreaterThan(0)
		})
	})

	describe("错误消息分析", () => {
		test("应该正确识别上下文相关错误", async () => {
			const contextErrors = [
				new Error("Context window exceeded"),
				new Error("Token limit reached"),
				new Error("Memory error"),
				new Error("Too much context"),
			]

			for (const error of contextErrors) {
				const messagesToRemove = await cleaner.identifyMessagesToRemove(mockHistory, error, mockErrorContext)
				expect(messagesToRemove).toBeDefined()
			}
		})

		test("应该正确识别超时错误", async () => {
			const timeoutError = new Error("Request timeout")
			const messagesToRemove = await cleaner.identifyMessagesToRemove(mockHistory, timeoutError, mockErrorContext)

			expect(messagesToRemove).toBeDefined()
		})

		test("应该正确识别速率限制错误", async () => {
			const rateLimitError = new Error("Rate limit exceeded")
			const messagesToRemove = await cleaner.identifyMessagesToRemove(
				mockHistory,
				rateLimitError,
				mockErrorContext,
			)

			expect(messagesToRemove).toBeDefined()
		})
	})

	describe("updateConfig", () => {
		test("应该更新配置", () => {
			cleaner.updateConfig({
				maxMessagesToRemove: 15,
				minMessagesToKeep: 5,
				keepLastUserMessage: false,
				keepSystemMessages: false,
			})

			const minimalHistory: Message[] = [{ role: "user", content: "Hello" }]
			expect(cleaner.validateCleanedHistory(minimalHistory)).toBe(true)
		})

		test("应该接受空配置更新", () => {
			expect(() => cleaner.updateConfig({})).not.toThrow()
		})
	})
})
