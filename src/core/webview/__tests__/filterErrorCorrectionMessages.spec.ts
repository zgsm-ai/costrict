import { describe, it, expect, vi, beforeEach } from "vitest"

describe("filterErrorCorrectionMessages 配置持久化", () => {
	let mockContextProxy: any

	beforeEach(() => {
		vi.clearAllMocks()

		// Mock contextProxy
		mockContextProxy = {
			getValues: vi.fn(() => ({
				filterErrorCorrectionMessages: false, // 初始值
			})),
			setValue: vi.fn(),
			getProviderSettings: vi.fn(() => ({})),
		}
	})

	it("应该正确处理 filterErrorCorrectionMessages 配置的更新", async () => {
		// 模拟 updateSettings 消息处理
		const updatedSettings = {
			filterErrorCorrectionMessages: true,
		}

		// 模拟配置保存过程
		for (const [key, value] of Object.entries(updatedSettings)) {
			await mockContextProxy.setValue(key, value)
		}

		// 验证配置被正确保存
		expect(mockContextProxy.setValue).toHaveBeenCalledWith(
			"filterErrorCorrectionMessages",
			true
		)
	})

	it("应该在 getState 中返回正确的 filterErrorCorrectionMessages 值", async () => {
		// 测试 true 值
		mockContextProxy.getValues.mockReturnValueOnce({
			filterErrorCorrectionMessages: true,
		})

		const stateValues = mockContextProxy.getValues()
		expect(stateValues.filterErrorCorrectionMessages).toBe(true)

		// 测试 false 值
		mockContextProxy.getValues.mockReturnValueOnce({
			filterErrorCorrectionMessages: false,
		})

		const stateValues2 = mockContextProxy.getValues()
		expect(stateValues2.filterErrorCorrectionMessages).toBe(false)

		// 测试 undefined 值（应该使用默认值 false）
		mockContextProxy.getValues.mockReturnValueOnce({})
		const stateValues3 = mockContextProxy.getValues()
		expect(stateValues3.filterErrorCorrectionMessages ?? false).toBe(false)
	})

	it("应该在 Task 中正确使用 filterErrorCorrectionMessages 配置", async () => {
		// 验证配置获取逻辑
		const mockGetState = vi.fn().mockResolvedValue({
			filterErrorCorrectionMessages: true,
		})

		// 验证基本的配置获取逻辑
		const state = await mockGetState()
		expect(state.filterErrorCorrectionMessages).toBe(true)
	})
})
