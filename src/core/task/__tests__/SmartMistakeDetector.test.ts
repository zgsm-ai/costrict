import { describe, it, expect, beforeEach } from "vitest"
import { SmartMistakeDetector, MistakeType, type MistakeSeverity } from "../SmartMistakeDetector"

describe("SmartMistakeDetector", () => {
	let detector: SmartMistakeDetector

	beforeEach(() => {
		detector = new SmartMistakeDetector()
	})

	describe("constructor", () => {
		it("should create detector with default time window", () => {
			expect(new SmartMistakeDetector()).toBeInstanceOf(SmartMistakeDetector)
		})

		it("should create detector with custom time window", () => {
			const customDetector = new SmartMistakeDetector(5000)
			expect(customDetector).toBeInstanceOf(SmartMistakeDetector)
		})
	})

	describe("addMistake", () => {
		it("should add mistake with type and context", () => {
			detector.addMistake(MistakeType.NO_TOOL_USE, "test context")
			expect(detector.getCurrentCount()).toBe(1)
		})

		it("should add mistake without context", () => {
			detector.addMistake(MistakeType.TOOL_FAILURE)
			expect(detector.getCurrentCount()).toBe(1)
		})

		it("should use medium severity as default", () => {
			detector.addMistake(MistakeType.INVALID_INPUT)
			expect(detector.getCurrentCount()).toBe(1)
		})

		it("should use specified severity", () => {
			detector.addMistake(MistakeType.TIMEOUT, "timeout", "high")
			detector.addMistake(MistakeType.REPEATED_ACTION, "repeat", "low")
			expect(detector.getCurrentCount()).toBe(2)
		})

		it("should add multiple mistakes", () => {
			detector.addMistake(MistakeType.NO_TOOL_USE)
			detector.addMistake(MistakeType.TOOL_FAILURE)
			detector.addMistake(MistakeType.INVALID_INPUT)
			expect(detector.getCurrentCount()).toBe(3)
		})
	})

	describe("checkLimit", () => {
		describe("thresholds", () => {
			it("should not trigger when weighted score is below 40% of limit", () => {
				detector.addMistake(MistakeType.NO_TOOL_USE)
				const result = detector.checkLimit(10)
				expect(result.shouldTrigger).toBe(false)
				expect(result.warning).toBeUndefined()
				expect(result.canAutoRecover).toBe(true)
			})

			it("should not trigger at exactly 50% threshold", () => {
				// 5 个 NO_TOOL_USE (medium) = 5 × (1.0 × 1.0) = 5.0
				// scoreRatio = 5.0 / 10 = 0.5 = 50%
				for (let i = 0; i < 5; i++) {
					detector.addMistake(MistakeType.NO_TOOL_USE)
				}
				const result = detector.checkLimit(10)
				expect(result.shouldTrigger).toBe(false)
				expect(result.warning).toBeDefined()
				expect(result.canAutoRecover).toBe(true)
			})

			it("should not trigger between 40% and 75% threshold", () => {
				for (let i = 0; i < 6; i++) {
					detector.addMistake(MistakeType.NO_TOOL_USE)
				}
				const result = detector.checkLimit(10)
				expect(result.shouldTrigger).toBe(false)
				expect(result.warning).toBeDefined()
			})

			it("should not trigger at 75% threshold", () => {
				for (let i = 0; i < 8; i++) {
					detector.addMistake(MistakeType.NO_TOOL_USE)
				}
				const result = detector.checkLimit(10)
				expect(result.shouldTrigger).toBe(false)
				expect(result.warning).toBeDefined()
			})

			it("should trigger at 90% threshold", () => {
				for (let i = 0; i < 9; i++) {
					detector.addMistake(MistakeType.NO_TOOL_USE)
				}
				const result = detector.checkLimit(10)
				expect(result.shouldTrigger).toBe(true)
				expect(result.warning).toBeDefined()
			})

			it("should trigger when limit is exceeded", () => {
				for (let i = 0; i < 10; i++) {
					detector.addMistake(MistakeType.NO_TOOL_USE)
				}
				const result = detector.checkLimit(10)
				expect(result.shouldTrigger).toBe(true)
			})
		})

		describe("weighted score calculation", () => {
			it("should calculate score based on mistake types", () => {
				detector.addMistake(MistakeType.NO_TOOL_USE) // weight: 1
				detector.addMistake(MistakeType.TOOL_FAILURE) // weight: 2
				const result = detector.checkLimit(10)
				expect(result.shouldTrigger).toBe(false)
			})

			it("should trigger with TOOL_FAILURE weight", () => {
				for (let i = 0; i < 5; i++) {
					detector.addMistake(MistakeType.TOOL_FAILURE)
				}
				const result = detector.checkLimit(10)
				expect(result.shouldTrigger).toBe(true)
			})

			it("should trigger with REPEATED_ACTION weight", () => {
				for (let i = 0; i < 7; i++) {
					detector.addMistake(MistakeType.REPEATED_ACTION)
				}
				const result = detector.checkLimit(10)
				expect(result.shouldTrigger).toBe(true)
			})

			it("should trigger with TIMEOUT weight", () => {
				for (let i = 0; i < 5; i++) {
					detector.addMistake(MistakeType.TIMEOUT)
				}
				const result = detector.checkLimit(10)
				expect(result.shouldTrigger).toBe(true)
			})
		})

		describe("severity weight calculation", () => {
			it("should use low severity weight", () => {
				for (let i = 0; i < 10; i++) {
					detector.addMistake(MistakeType.TOOL_FAILURE, `low${i}`, "low")
				}
				const result = detector.checkLimit(10)
				// 10 * (2 * 0.5) = 10, which exceeds the 90% threshold of 9
				expect(result.shouldTrigger).toBe(true)
			})

			it("should use medium severity weight", () => {
				for (let i = 0; i < 5; i++) {
					detector.addMistake(MistakeType.TOOL_FAILURE, `med${i}`, "medium")
				}
				const result = detector.checkLimit(10)
				expect(result.shouldTrigger).toBe(true)
			})

			it("should use high severity weight", () => {
				for (let i = 0; i < 3; i++) {
					detector.addMistake(MistakeType.TOOL_FAILURE, `high${i}`, "high")
				}
				const result = detector.checkLimit(10)
				expect(result.shouldTrigger).toBe(true)
			})
		})

		describe("auto recovery detection", () => {
			it("should allow auto recovery with no mistakes", () => {
				const result = detector.checkLimit(10)
				expect(result.canAutoRecover).toBe(true)
			})

			it("should allow auto recovery when high severity < 50%", () => {
				detector.addMistake(MistakeType.TOOL_FAILURE, "high1", "high")
				detector.addMistake(MistakeType.TOOL_FAILURE, "high2", "high")
				detector.addMistake(MistakeType.NO_TOOL_USE, "low1", "low")
				detector.addMistake(MistakeType.NO_TOOL_USE, "low2", "low")
				detector.addMistake(MistakeType.NO_TOOL_USE, "low3", "low")
				const result = detector.checkLimit(10)
				expect(result.canAutoRecover).toBe(true)
			})

			it("should not allow auto recovery when high severity >= 50%", () => {
				detector.addMistake(MistakeType.TOOL_FAILURE, "high1", "high")
				detector.addMistake(MistakeType.TOOL_FAILURE, "high2", "high")
				detector.addMistake(MistakeType.TOOL_FAILURE, "high3", "high")
				detector.addMistake(MistakeType.NO_TOOL_USE, "low1", "low")
				detector.addMistake(MistakeType.NO_TOOL_USE, "low2", "low")
				detector.addMistake(MistakeType.NO_TOOL_USE, "low3", "low")
				const result = detector.checkLimit(10)
				expect(result.canAutoRecover).toBe(false)
			})

			it("should not allow auto recovery when all mistakes are high severity", () => {
				detector.addMistake(MistakeType.TOOL_FAILURE, "high1", "high")
				detector.addMistake(MistakeType.TOOL_FAILURE, "high2", "high")
				const result = detector.checkLimit(10)
				expect(result.canAutoRecover).toBe(false)
			})
		})
	})

	describe("clear", () => {
		it("should clear all mistakes", () => {
			detector.addMistake(MistakeType.NO_TOOL_USE)
			detector.addMistake(MistakeType.TOOL_FAILURE)
			detector.addMistake(MistakeType.INVALID_INPUT)
			expect(detector.getCurrentCount()).toBe(3)
			detector.clear()
			expect(detector.getCurrentCount()).toBe(0)
		})

		it("should reset limit check after clear", () => {
			for (let i = 0; i < 10; i++) {
				detector.addMistake(MistakeType.NO_TOOL_USE)
			}
			let result = detector.checkLimit(10)
			expect(result.shouldTrigger).toBe(true)
			detector.clear()
			result = detector.checkLimit(10)
			expect(result.shouldTrigger).toBe(false)
		})
	})

	describe("getCurrentCount", () => {
		it("should return 0 when no mistakes", () => {
			expect(detector.getCurrentCount()).toBe(0)
		})

		it("should return correct count after adding mistakes", () => {
			detector.addMistake(MistakeType.NO_TOOL_USE)
			detector.addMistake(MistakeType.TOOL_FAILURE)
			detector.addMistake(MistakeType.INVALID_INPUT)
			expect(detector.getCurrentCount()).toBe(3)
		})
	})

	describe("getAnalysis", () => {
		it("should return message when empty", () => {
			const analysis = detector.getAnalysis()
			expect(analysis).toBeDefined()
			expect(analysis.length).toBeGreaterThan(0)
		})

		it("should return analysis with data", () => {
			detector.addMistake(MistakeType.NO_TOOL_USE)
			detector.addMistake(MistakeType.TOOL_FAILURE)
			detector.addMistake(MistakeType.INVALID_INPUT)
			const analysis = detector.getAnalysis()
			expect(analysis).toBeDefined()
			expect(analysis.length).toBeGreaterThan(10)
		})
	})

	describe("getMistakeCountByType", () => {
		it("should return 0 for type when no mistakes", () => {
			expect(detector.getMistakeCountByType(MistakeType.NO_TOOL_USE)).toBe(0)
		})

		it("should return correct count for specific type", () => {
			detector.addMistake(MistakeType.NO_TOOL_USE)
			detector.addMistake(MistakeType.NO_TOOL_USE)
			detector.addMistake(MistakeType.TOOL_FAILURE)
			expect(detector.getMistakeCountByType(MistakeType.NO_TOOL_USE)).toBe(2)
			expect(detector.getMistakeCountByType(MistakeType.TOOL_FAILURE)).toBe(1)
			expect(detector.getMistakeCountByType(MistakeType.INVALID_INPUT)).toBe(0)
		})

		it("should count all mistake types correctly", () => {
			detector.addMistake(MistakeType.NO_TOOL_USE)
			detector.addMistake(MistakeType.TOOL_FAILURE)
			detector.addMistake(MistakeType.REPEATED_ACTION)
			detector.addMistake(MistakeType.INVALID_INPUT)
			detector.addMistake(MistakeType.TIMEOUT)
			expect(detector.getMistakeCountByType(MistakeType.NO_TOOL_USE)).toBe(1)
			expect(detector.getMistakeCountByType(MistakeType.TOOL_FAILURE)).toBe(1)
			expect(detector.getMistakeCountByType(MistakeType.REPEATED_ACTION)).toBe(1)
			expect(detector.getMistakeCountByType(MistakeType.INVALID_INPUT)).toBe(1)
			expect(detector.getMistakeCountByType(MistakeType.TIMEOUT)).toBe(1)
		})
	})

	describe("getMistakeCountBySeverity", () => {
		it("should return 0 for severity when no mistakes", () => {
			expect(detector.getMistakeCountBySeverity("low")).toBe(0)
			expect(detector.getMistakeCountBySeverity("medium")).toBe(0)
			expect(detector.getMistakeCountBySeverity("high")).toBe(0)
		})

		it("should return correct count for specific severity", () => {
			detector.addMistake(MistakeType.NO_TOOL_USE, "low1", "low")
			detector.addMistake(MistakeType.NO_TOOL_USE, "low2", "low")
			detector.addMistake(MistakeType.TOOL_FAILURE, "med", "medium")
			expect(detector.getMistakeCountBySeverity("low")).toBe(2)
			expect(detector.getMistakeCountBySeverity("medium")).toBe(1)
			expect(detector.getMistakeCountBySeverity("high")).toBe(0)
		})

		it("should count all severities correctly", () => {
			detector.addMistake(MistakeType.NO_TOOL_USE, "low", "low")
			detector.addMistake(MistakeType.TOOL_FAILURE, "med1", "medium")
			detector.addMistake(MistakeType.TIMEOUT, "high1", "high")
			detector.addMistake(MistakeType.INVALID_INPUT, "med2", "medium")
			detector.addMistake(MistakeType.REPEATED_ACTION, "high2", "high")
			expect(detector.getMistakeCountBySeverity("low")).toBe(1)
			expect(detector.getMistakeCountBySeverity("medium")).toBe(2)
			expect(detector.getMistakeCountBySeverity("high")).toBe(2)
		})
	})

	describe("time window expiration", () => {
		it("should clean up expired mistakes", async () => {
			const shortWindowDetector = new SmartMistakeDetector(100)
			shortWindowDetector.addMistake(MistakeType.NO_TOOL_USE)
			expect(shortWindowDetector.getCurrentCount()).toBe(1)

			await new Promise((resolve) => setTimeout(resolve, 150))
			expect(shortWindowDetector.getCurrentCount()).toBe(0)
		})

		it("should keep mistakes within time window", async () => {
			const shortWindowDetector = new SmartMistakeDetector(100)
			shortWindowDetector.addMistake(MistakeType.NO_TOOL_USE)

			await new Promise((resolve) => setTimeout(resolve, 50))
			shortWindowDetector.addMistake(MistakeType.TOOL_FAILURE)
			expect(shortWindowDetector.getCurrentCount()).toBe(2)

			await new Promise((resolve) => setTimeout(resolve, 60))
			expect(shortWindowDetector.getCurrentCount()).toBe(1)
			expect(shortWindowDetector.getMistakeCountByType(MistakeType.TOOL_FAILURE)).toBe(1)
		})
	})

	describe("complex scenarios", () => {
		it("should handle mixed mistake types and severities", () => {
			detector.addMistake(MistakeType.NO_TOOL_USE, "ctx1", "low")
			detector.addMistake(MistakeType.TOOL_FAILURE, "ctx2", "medium")
			detector.addMistake(MistakeType.REPEATED_ACTION, "ctx3", "high")
			detector.addMistake(MistakeType.INVALID_INPUT, "ctx4", "low")
			detector.addMistake(MistakeType.TIMEOUT, "ctx5", "medium")

			const result = detector.checkLimit(10)
			expect(result.shouldTrigger).toBe(false)
			expect(detector.getMistakeCountByType(MistakeType.NO_TOOL_USE)).toBe(1)
			expect(detector.getMistakeCountByType(MistakeType.TOOL_FAILURE)).toBe(1)
			expect(detector.getMistakeCountByType(MistakeType.REPEATED_ACTION)).toBe(1)
			expect(detector.getMistakeCountByType(MistakeType.INVALID_INPUT)).toBe(1)
			expect(detector.getMistakeCountByType(MistakeType.TIMEOUT)).toBe(1)
			expect(detector.getMistakeCountBySeverity("low")).toBe(2)
			expect(detector.getMistakeCountBySeverity("medium")).toBe(2)
			expect(detector.getMistakeCountBySeverity("high")).toBe(1)
			expect(result.canAutoRecover).toBe(true)
		})

		it("should calculate progressive warnings correctly", () => {
			const baseLimit = 20

			// 第一阶段：50% 阈值
			// 10 个 NO_TOOL_USE (medium) = 10 × (1.0 × 1.0) = 10.0
			// scoreRatio = 10.0 / 20 = 0.5 = 50%
			for (let i = 0; i < 10; i++) {
				detector.addMistake(MistakeType.NO_TOOL_USE)
			}
			let result = detector.checkLimit(baseLimit)
			expect(result.shouldTrigger).toBe(false)
			expect(result.warning).toBeDefined()

			// 第二阶段：75% 阈值
			// 总共 15 个 NO_TOOL_USE = 15 × (1.0 × 1.0) = 15.0
			// scoreRatio = 15.0 / 20 = 0.75 = 75%
			for (let i = 0; i < 5; i++) {
				detector.addMistake(MistakeType.NO_TOOL_USE)
			}
			result = detector.checkLimit(baseLimit)
			expect(result.shouldTrigger).toBe(false)
			expect(result.warning).toBeDefined()

			// 第三阶段：90% 阈值（触发限制）
			// 总共 18 个 NO_TOOL_USE = 18 × (1.0 × 1.0) = 18.0
			// scoreRatio = 18.0 / 20 = 0.9 = 90%
			for (let i = 0; i < 3; i++) {
				detector.addMistake(MistakeType.NO_TOOL_USE)
			}
			result = detector.checkLimit(baseLimit)
			expect(result.shouldTrigger).toBe(true)
			expect(result.warning).toBeDefined()
		})

		it("should generate comprehensive analysis", () => {
			detector.addMistake(MistakeType.NO_TOOL_USE, "ctx1", "low")
			detector.addMistake(MistakeType.NO_TOOL_USE, "ctx2", "low")
			detector.addMistake(MistakeType.TOOL_FAILURE, "ctx3", "medium")
			detector.addMistake(MistakeType.TOOL_FAILURE, "ctx4", "medium")
			detector.addMistake(MistakeType.TOOL_FAILURE, "ctx5", "high")
			detector.addMistake(MistakeType.REPEATED_ACTION, "ctx6", "high")

			const analysis = detector.getAnalysis()
			expect(analysis).toBeDefined()
			expect(analysis.length).toBeGreaterThan(50)
		})
	})
})
