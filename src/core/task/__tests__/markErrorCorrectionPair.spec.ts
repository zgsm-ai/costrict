import { describe, it, expect } from "vitest"
import type { ApiMessage } from "../../task-persistence/apiMessages"

/**
 * Test suite for markErrorCorrectionPair optimization
 *
 * This tests the logic for marking error-correction pairs in conversation history.
 * The actual implementation is in Task.ts, but we test the core logic here.
 */

describe("markErrorCorrectionPair 优化验证", () => {
	/**
	 * Simulates the marking logic from Task.ts
	 */
	function markErrorCorrectionPairs(history: ApiMessage[]): ApiMessage[] {
		// Find all unmarked error messages
		const errorUserMessageIndices: number[] = []
		for (let i = history.length - 1; i >= 0; i--) {
			const msg = history[i]
			if (msg.role === "user" && Array.isArray(msg.content)) {
				// Skip already marked messages
				if (msg.errorCorrectionParent) {
					continue
				}

				const hasNoToolsUsedError = msg.content.some(
					(block: any) => block.__isNoToolsUsed === true
				)
				if (hasNoToolsUsedError) {
					errorUserMessageIndices.push(i)
				}
			}
		}

		// If no unmarked errors, return unchanged
		if (errorUserMessageIndices.length === 0) {
			return history
		}

		// Verify last message is assistant
		const lastMessageIndex = history.length - 1
		if (lastMessageIndex < 0 || history[lastMessageIndex].role !== "assistant") {
			return history
		}

		// Avoid duplicate marking
		if (history[lastMessageIndex].isErrorCorrectionMarker) {
			return history
		}

		// Generate errorCorrectionId
		const errorCorrectionId = "test-error-correction-id"

		// Mark all error messages and their preceding assistant messages
		for (const errorUserMessageIndex of errorUserMessageIndices) {
			history[errorUserMessageIndex].errorCorrectionParent = errorCorrectionId

			// Find preceding assistant message
			for (let i = errorUserMessageIndex - 1; i >= 0; i--) {
				if (history[i].role === "assistant") {
					if (!history[i].errorCorrectionParent) {
						history[i].errorCorrectionParent = errorCorrectionId
					}
					break
				}
			}
		}

		// Mark current assistant as correction marker
		history[lastMessageIndex].isErrorCorrectionMarker = true
		history[lastMessageIndex].errorCorrectionId = errorCorrectionId

		return history
	}

	it("问题1: 应该标记所有连续的错误消息", () => {
		const history: ApiMessage[] = [
			{ role: "assistant", content: [{ type: "text", text: "response 1" }] },
			{ role: "user", content: [{ type: "text", text: "error", __isNoToolsUsed: true } as any] },
			{ role: "assistant", content: [{ type: "text", text: "response 2" }] },
			{ role: "user", content: [{ type: "text", text: "error", __isNoToolsUsed: true } as any] },
			{ role: "assistant", content: [{ type: "tool_use", id: "1", name: "test", input: {} } as any] },
		]

		const result = markErrorCorrectionPairs(history)

		// 验证两个错误消息都被标记
		expect(result[1].errorCorrectionParent).toBe("test-error-correction-id")
		expect(result[3].errorCorrectionParent).toBe("test-error-correction-id")

		// 验证对应的失败助手消息都被标记
		expect(result[0].errorCorrectionParent).toBe("test-error-correction-id")
		expect(result[2].errorCorrectionParent).toBe("test-error-correction-id")

		// 验证最后的成功助手消息被标记为 marker
		expect(result[4].isErrorCorrectionMarker).toBe(true)
		expect(result[4].errorCorrectionId).toBe("test-error-correction-id")
	})

	it("问题2: 应该避免重复标记已经被标记的消息", () => {
		const history: ApiMessage[] = [
			{ role: "assistant", content: [{ type: "text", text: "response 1" }] },
			{
				role: "user",
				content: [{ type: "text", text: "error", __isNoToolsUsed: true } as any],
				errorCorrectionParent: "existing-id", // 已经被标记
			},
			{ role: "assistant", content: [{ type: "tool_use", id: "1", name: "test", input: {} } as any] },
		]

		const result = markErrorCorrectionPairs(history)

		// 已标记的消息不应该被修改
		expect(result[1].errorCorrectionParent).toBe("existing-id")

		// 最后的助手消息不应该被标记为 marker（因为没有未标记的错误）
		expect(result[2].isErrorCorrectionMarker).toBeUndefined()
	})

	it("问题3: 应该处理最后一条消息不是助手的情况", () => {
		const history: ApiMessage[] = [
			{ role: "assistant", content: [{ type: "text", text: "response 1" }] },
			{ role: "user", content: [{ type: "text", text: "error", __isNoToolsUsed: true } as any] },
			{ role: "user", content: [{ type: "text", text: "another user message" }] }, // 最后是 user
		]

		const result = markErrorCorrectionPairs(history)

		// 不应该标记任何消息（因为最后不是助手消息）
		expect(result[1].errorCorrectionParent).toBeUndefined()
	})

	it("问题4: 应该避免重复标记同一个助手消息为 marker", () => {
		const history: ApiMessage[] = [
			{ role: "assistant", content: [{ type: "text", text: "response 1" }] },
			{ role: "user", content: [{ type: "text", text: "error", __isNoToolsUsed: true } as any] },
			{
				role: "assistant",
				content: [{ type: "tool_use", id: "1", name: "test", input: {} } as any],
				isErrorCorrectionMarker: true, // 已经是 marker
				errorCorrectionId: "existing-id",
			},
		]

		const originalMarker = history[2].isErrorCorrectionMarker
		const originalId = history[2].errorCorrectionId

		const result = markErrorCorrectionPairs(history)

		// marker 应该保持不变
		expect(result[2].isErrorCorrectionMarker).toBe(originalMarker)
		expect(result[2].errorCorrectionId).toBe(originalId)

		// 错误消息不应该被标记
		expect(result[1].errorCorrectionParent).toBeUndefined()
	})

	it("边界情况: 空历史记录", () => {
		const history: ApiMessage[] = []

		const result = markErrorCorrectionPairs(history)

		expect(result).toEqual([])
	})

	it("边界情况: 只有用户消息", () => {
		const history: ApiMessage[] = [
			{ role: "user", content: [{ type: "text", text: "error", __isNoToolsUsed: true } as any] },
		]

		const result = markErrorCorrectionPairs(history)

		// 不应该标记（没有助手消息）
		expect(result[0].errorCorrectionParent).toBeUndefined()
	})

	it("正常场景: 单个错误-修正对", () => {
		const history: ApiMessage[] = [
			{ role: "assistant", content: [{ type: "text", text: "no tools" }] },
			{ role: "user", content: [{ type: "text", text: "error", __isNoToolsUsed: true } as any] },
			{ role: "assistant", content: [{ type: "tool_use", id: "1", name: "test", input: {} } as any] },
		]

		const result = markErrorCorrectionPairs(history)

		// 验证标记
		expect(result[0].errorCorrectionParent).toBe("test-error-correction-id")
		expect(result[1].errorCorrectionParent).toBe("test-error-correction-id")
		expect(result[2].isErrorCorrectionMarker).toBe(true)
		expect(result[2].errorCorrectionId).toBe("test-error-correction-id")
	})

	it("防御性检查: 助手消息已经被其他 error pair 标记", () => {
		const history: ApiMessage[] = [
			{
				role: "assistant",
				content: [{ type: "text", text: "response 1" }],
				errorCorrectionParent: "other-id", // 已经被标记
			},
			{ role: "user", content: [{ type: "text", text: "error", __isNoToolsUsed: true } as any] },
			{ role: "assistant", content: [{ type: "tool_use", id: "1", name: "test", input: {} } as any] },
		]

		const result = markErrorCorrectionPairs(history)

		// 已标记的助手消息应该保持原有的 errorCorrectionParent
		expect(result[0].errorCorrectionParent).toBe("other-id")

		// 新的错误消息应该被标记
		expect(result[1].errorCorrectionParent).toBe("test-error-correction-id")

		// 最后的助手消息应该成为新的 marker
		expect(result[2].isErrorCorrectionMarker).toBe(true)
	})
})
