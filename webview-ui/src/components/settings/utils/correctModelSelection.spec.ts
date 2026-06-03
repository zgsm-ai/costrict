// npx vitest run src/components/settings/utils/correctModelSelection.spec.ts

import { describe, it, expect } from "vitest"

import { getCorrectedCostrictModelId } from "./correctModelSelection"

describe("getCorrectedCostrictModelId", () => {
	it("returns null when no model is selected", () => {
		expect(getCorrectedCostrictModelId(["Auto", "qwen-max"], ["Auto"], undefined)).toBeNull()
	})

	it("returns null when the old list is empty (we don't know the server set yet)", () => {
		expect(getCorrectedCostrictModelId([], ["Auto"], "qwen-max")).toBeNull()
	})

	it("returns null for a custom model that was never in the old list", () => {
		expect(getCorrectedCostrictModelId(["Auto", "qwen-max"], ["Auto"], "my-private-model")).toBeNull()
	})

	it("returns null when the selected model is still in the new list", () => {
		expect(getCorrectedCostrictModelId(["Auto", "qwen-max"], ["Auto", "qwen-max"], "qwen-max")).toBeNull()
	})

	it("returns Auto when a previously-listed server model was removed and Auto is available", () => {
		expect(getCorrectedCostrictModelId(["Auto", "qwen-max"], ["Auto", "qwen-plus"], "qwen-max")).toBe("Auto")
	})

	it("returns the first new model when Auto is absent from the new list", () => {
		expect(getCorrectedCostrictModelId(["Auto", "qwen-max"], ["qwen-plus", "qwen-turbo"], "qwen-max")).toBe(
			"qwen-plus",
		)
	})

	it("returns null when the new list is empty (nothing to fall back to)", () => {
		expect(getCorrectedCostrictModelId(["Auto", "qwen-max"], [], "qwen-max")).toBeNull()
	})

	it("returns null when the selected model is an empty string", () => {
		expect(getCorrectedCostrictModelId(["Auto", "qwen-max"], ["Auto"], "")).toBeNull()
	})

	it("returns the sole model when the new list has exactly one element and Auto is absent", () => {
		expect(getCorrectedCostrictModelId(["Auto", "qwen-max"], ["qwen-plus"], "qwen-max")).toBe("qwen-plus")
	})

	it("returns null for a custom model even when the new list is empty (guard order)", () => {
		expect(getCorrectedCostrictModelId(["Auto"], [], "my-custom")).toBeNull()
	})
})
