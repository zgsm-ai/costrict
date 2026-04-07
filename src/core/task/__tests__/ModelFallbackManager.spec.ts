import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Mock dependencies — must be before imports
vi.mock("../../../api/providers/fetchers/modelCache", () => ({
	getModelsFromCache: vi.fn(),
}))

vi.mock("../../../api", () => ({
	buildApiHandler: vi.fn().mockReturnValue({
		getModel: vi.fn().mockReturnValue({ id: "fallback-model", info: {} }),
		createMessage: vi.fn(),
	}),
}))

import { ModelFallbackManager } from "../ModelFallbackManager"
import { getModelsFromCache } from "../../../api/providers/fetchers/modelCache"
import { buildApiHandler } from "../../../api"
import type { ProviderSettings } from "@roo-code/types"

const mockGetModelsFromCache = vi.mocked(getModelsFromCache)

function createMockModels() {
	return {
		"primary-model": {
			contextWindow: 128000,
			creditConsumption: 10,
			maxTokens: 8192,
			supportsImages: true,
			supportsPromptCache: false,
		},
		"fallback-model-a": {
			contextWindow: 128000,
			creditConsumption: 5,
			maxTokens: 8192,
			supportsImages: true,
			supportsPromptCache: false,
		},
		"fallback-model-b": {
			contextWindow: 64000,
			creditConsumption: 3,
			maxTokens: 4096,
			supportsImages: true,
			supportsPromptCache: false,
		},
		"fallback-model-c": {
			contextWindow: 256000,
			creditConsumption: 20,
			maxTokens: 16384,
			supportsImages: true,
			supportsPromptCache: false,
		},
	}
}

// Use real getModelId — it reads costrictModelId from ProviderSettings
const baseConfig: ProviderSettings = {
	apiProvider: "costrict",
	costrictModelId: "primary-model",
}

describe("ModelFallbackManager", () => {
	let manager: ModelFallbackManager

	beforeEach(() => {
		vi.clearAllMocks()
		mockGetModelsFromCache.mockReturnValue(createMockModels() as any)
		manager = new ModelFallbackManager(baseConfig)
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	describe("initialization", () => {
		it("should initialize with primary model as active model", () => {
			expect(manager.currentModelId).toBe("primary-model")
			expect(manager.userSelectedModelId).toBe("primary-model")
			expect(manager.isFallbackActive).toBe(false)
		})

		it("should have no fallback status message initially", () => {
			expect(manager.getFallbackStatusMessage()).toBeUndefined()
		})

		it("should have empty history initially", () => {
			expect(manager.getHistory()).toHaveLength(0)
		})
	})

	describe("recordFailure", () => {
		it("should not trigger fallback below threshold (3)", () => {
			expect(manager.recordFailure(undefined, "network")).toBe(false)
			expect(manager.recordFailure(undefined, "network")).toBe(false)
			expect(manager.isFallbackActive).toBe(false)
			expect(manager.currentModelId).toBe("primary-model")
		})

		it("should trigger fallback at threshold (3 consecutive failures)", () => {
			manager.recordFailure(undefined, "network")
			manager.recordFailure(undefined, "network")
			const switched = manager.recordFailure(undefined, "network")

			expect(switched).toBe(true)
			expect(manager.isFallbackActive).toBe(true)
			expect(manager.currentModelId).not.toBe("primary-model")
		})

		it("should select the cheapest model with adequate context window", () => {
			manager.recordFailure(undefined, "server_error")
			manager.recordFailure(undefined, "server_error")
			manager.recordFailure(undefined, "server_error")

			// fallback-model-a: contextWindow=128000 (>= primary's 128000), creditConsumption=5 (cheapest)
			expect(manager.currentModelId).toBe("fallback-model-a")
		})

		it("should provide status message when fallback is active", () => {
			manager.recordFailure(undefined, "server_error")
			manager.recordFailure(undefined, "server_error")
			manager.recordFailure(undefined, "server_error")

			const statusMsg = manager.getFallbackStatusMessage()
			expect(statusMsg).toBe("primary-model --> fallback-model-a")
		})

		it("should record fallback event in history", () => {
			manager.recordFailure(undefined, "server_error")
			manager.recordFailure(undefined, "server_error")
			manager.recordFailure(undefined, "server_error")

			const history = manager.getHistory()
			expect(history).toHaveLength(1)
			expect(history[0].fromModel).toBe("primary-model")
			expect(history[0].toModel).toBe("fallback-model-a")
			expect(history[0].reason).toContain("3 consecutive failures")
		})

		it("should return false when no fallback models are available", () => {
			mockGetModelsFromCache.mockReturnValue({
				"primary-model": {
					contextWindow: 128000,
					creditConsumption: 10,
					maxTokens: 8192,
					supportsImages: true,
					supportsPromptCache: false,
				},
			} as any)

			manager.recordFailure(undefined, "server_error")
			manager.recordFailure(undefined, "server_error")
			const switched = manager.recordFailure(undefined, "server_error")

			expect(switched).toBe(false)
			expect(manager.isFallbackActive).toBe(false)
		})

		it("should return false when model cache is empty", () => {
			mockGetModelsFromCache.mockReturnValue(null as any)

			manager.recordFailure(undefined, "server_error")
			manager.recordFailure(undefined, "server_error")
			const switched = manager.recordFailure(undefined, "server_error")

			expect(switched).toBe(false)
		})
	})

	describe("recordSuccess", () => {
		it("should reset failure counter for current model", () => {
			manager.recordFailure(undefined, "network")
			manager.recordFailure(undefined, "network")
			manager.recordSuccess()

			// Counter reset — 2 more failures should not trigger fallback
			expect(manager.recordFailure(undefined, "network")).toBe(false)
			expect(manager.recordFailure(undefined, "network")).toBe(false)
			expect(manager.isFallbackActive).toBe(false)
		})

		it("should return false when not in fallback mode", () => {
			expect(manager.recordSuccess()).toBe(false)
		})

		it("should not restore primary if still on cooldown (default 5 min)", () => {
			// Trigger fallback — primary gets cooldownUntil = now + 5min
			manager.recordFailure(undefined, "server_error")
			manager.recordFailure(undefined, "server_error")
			manager.recordFailure(undefined, "server_error")
			expect(manager.isFallbackActive).toBe(true)

			// 3 successes should NOT restore primary because cooldown hasn't expired
			manager.recordSuccess()
			manager.recordSuccess()
			const restored = manager.recordSuccess()

			expect(restored).toBe(false)
			expect(manager.isFallbackActive).toBe(true)
		})

		it("should restore primary model after cooldown expires and probe threshold met", () => {
			const now = Date.now()
			const dateSpy = vi.spyOn(Date, "now")
			dateSpy.mockReturnValue(now)

			manager = new ModelFallbackManager(baseConfig)
			manager.recordFailure(undefined, "server_error")
			manager.recordFailure(undefined, "server_error")
			manager.recordFailure(undefined, "server_error")
			expect(manager.isFallbackActive).toBe(true)

			// Advance time past cooldown (6 min > 5 min)
			dateSpy.mockReturnValue(now + 6 * 60 * 1000)

			manager.recordSuccess()
			manager.recordSuccess()
			const restored = manager.recordSuccess()

			expect(restored).toBe(true)
			expect(manager.isFallbackActive).toBe(false)
			expect(manager.currentModelId).toBe("primary-model")

			dateSpy.mockRestore()
		})

		it("should record restore event in history when primary restored", () => {
			const now = Date.now()
			const dateSpy = vi.spyOn(Date, "now")
			dateSpy.mockReturnValue(now)

			manager = new ModelFallbackManager(baseConfig)
			manager.recordFailure(undefined, "server_error")
			manager.recordFailure(undefined, "server_error")
			manager.recordFailure(undefined, "server_error")

			dateSpy.mockReturnValue(now + 6 * 60 * 1000)

			manager.recordSuccess()
			manager.recordSuccess()
			const restored = manager.recordSuccess()

			expect(restored).toBe(true)
			const history = manager.getHistory()
			expect(history).toHaveLength(2) // 1 fallback + 1 restore
			expect(history[1].toModel).toBe("primary-model")
			expect(history[1].reason).toContain("probing primary")

			dateSpy.mockRestore()
		})
	})

	describe("buildFallbackApiHandler", () => {
		it("should return undefined when no fallback is active", () => {
			expect(manager.buildFallbackApiHandler()).toBeUndefined()
		})

		it("should return an ApiHandler when fallback is active", () => {
			const mockHandler = {
				getModel: vi.fn().mockReturnValue({ id: "fallback-model-a", info: {} }),
				createMessage: vi.fn(),
			}
			vi.mocked(buildApiHandler).mockReturnValue(mockHandler as any)

			manager.recordFailure(undefined, "server_error")
			manager.recordFailure(undefined, "server_error")
			manager.recordFailure(undefined, "server_error")

			const handler = manager.buildFallbackApiHandler()
			expect(handler).toBeDefined()
			expect(buildApiHandler).toHaveBeenCalledWith(
				expect.objectContaining({
					apiProvider: "costrict",
					costrictModelId: "fallback-model-a",
				}),
			)
		})
	})

	describe("forceRestorePrimary", () => {
		it("should restore primary model immediately", () => {
			manager.recordFailure(undefined, "server_error")
			manager.recordFailure(undefined, "server_error")
			manager.recordFailure(undefined, "server_error")
			expect(manager.isFallbackActive).toBe(true)

			manager.forceRestorePrimary()
			expect(manager.isFallbackActive).toBe(false)
			expect(manager.currentModelId).toBe("primary-model")
		})

		it("should be a no-op when no fallback is active", () => {
			manager.forceRestorePrimary()
			expect(manager.isFallbackActive).toBe(false)
			expect(manager.currentModelId).toBe("primary-model")
		})
	})

	describe("reset", () => {
		it("should clear all state", () => {
			manager.recordFailure(undefined, "server_error")
			manager.recordFailure(undefined, "server_error")
			manager.recordFailure(undefined, "server_error")
			expect(manager.isFallbackActive).toBe(true)

			manager.reset()
			expect(manager.isFallbackActive).toBe(false)
			expect(manager.currentModelId).toBe("primary-model")
			expect(manager.getHistory()).toHaveLength(0)
		})
	})

	describe("model selection strategy", () => {
		it("should exclude models on cooldown during cascading fallback", () => {
			// Primary -> fallback-model-a
			manager.recordFailure(undefined, "server_error")
			manager.recordFailure(undefined, "server_error")
			manager.recordFailure(undefined, "server_error")
			expect(manager.currentModelId).toBe("fallback-model-a")

			// fallback-model-a -> next available (primary on cooldown, a on cooldown)
			// fallback-model-c has contextWindow >= 128000 and is not on cooldown
			manager.recordFailure(undefined, "server_error")
			manager.recordFailure(undefined, "server_error")
			const switched = manager.recordFailure(undefined, "server_error")

			expect(switched).toBe(true)
			expect(manager.currentModelId).toBe("fallback-model-c")
		})

		it("should relax context window constraint when no adequate models exist", () => {
			mockGetModelsFromCache.mockReturnValue({
				"primary-model": {
					contextWindow: 256000,
					creditConsumption: 10,
					maxTokens: 8192,
					supportsImages: true,
					supportsPromptCache: false,
				},
				"small-model": {
					contextWindow: 32000,
					creditConsumption: 2,
					maxTokens: 4096,
					supportsImages: true,
					supportsPromptCache: false,
				},
			} as any)

			manager.recordFailure(undefined, "server_error")
			manager.recordFailure(undefined, "server_error")
			const switched = manager.recordFailure(undefined, "server_error")

			expect(switched).toBe(true)
			expect(manager.currentModelId).toBe("small-model")
		})
	})

	describe("cascading fallback", () => {
		it("should handle multiple cascading fallbacks through all models", () => {
			// Primary -> A (cheapest with adequate context)
			manager.recordFailure(undefined, "server_error")
			manager.recordFailure(undefined, "server_error")
			manager.recordFailure(undefined, "server_error")
			expect(manager.currentModelId).toBe("fallback-model-a")

			// A -> C (primary+A on cooldown, C has adequate context, B doesn't)
			manager.recordFailure(undefined, "server_error")
			manager.recordFailure(undefined, "server_error")
			manager.recordFailure(undefined, "server_error")
			expect(manager.currentModelId).toBe("fallback-model-c")

			// C -> B (primary+A+C on cooldown, only B left, relaxed context constraint)
			manager.recordFailure(undefined, "server_error")
			manager.recordFailure(undefined, "server_error")
			const switched = manager.recordFailure(undefined, "server_error")

			expect(switched).toBe(true)
			expect(manager.currentModelId).toBe("fallback-model-b")
		})

		it("should fail to switch when all models are on cooldown", () => {
			// Exhaust all models: primary -> A -> C -> B
			manager.recordFailure(undefined, "server_error")
			manager.recordFailure(undefined, "server_error")
			manager.recordFailure(undefined, "server_error")

			manager.recordFailure(undefined, "server_error")
			manager.recordFailure(undefined, "server_error")
			manager.recordFailure(undefined, "server_error")

			manager.recordFailure(undefined, "server_error")
			manager.recordFailure(undefined, "server_error")
			manager.recordFailure(undefined, "server_error")

			// Now on B, all others on cooldown
			manager.recordFailure(undefined, "server_error")
			manager.recordFailure(undefined, "server_error")
			const switched = manager.recordFailure(undefined, "server_error")

			// No more models available — switch fails
			expect(switched).toBe(false)
		})
	})
})
