// src/services/mcp/asyncPolling/__tests__/jsonPathLite.spec.ts
import { describe, it, expect } from "vitest"
import { extractByJsonPath, isValidJsonPath } from "../jsonPathLite"

describe("extractByJsonPath", () => {
	it("$ returns the root value", () => {
		expect(extractByJsonPath({ a: 1 }, "$")).toEqual({ a: 1 })
	})

	it("$.field returns top-level field", () => {
		expect(extractByJsonPath({ taskId: "abc" }, "$.taskId")).toBe("abc")
	})

	it("nested fields", () => {
		expect(extractByJsonPath({ data: { taskId: "x" } }, "$.data.taskId")).toBe("x")
	})

	it("array index", () => {
		expect(extractByJsonPath({ items: [{ id: 1 }, { id: 2 }] }, "$.items[0].id")).toBe(1)
	})

	it("returns undefined for missing field", () => {
		expect(extractByJsonPath({ a: 1 }, "$.b")).toBeUndefined()
	})

	it("returns undefined when traversing into null/undefined", () => {
		expect(extractByJsonPath({ a: null }, "$.a.b")).toBeUndefined()
		expect(extractByJsonPath(undefined, "$.a")).toBeUndefined()
	})

	it("returns undefined when index out of bounds", () => {
		expect(extractByJsonPath({ items: [{ id: 1 }] }, "$.items[5].id")).toBeUndefined()
	})

	it("throws on invalid path syntax", () => {
		expect(() => extractByJsonPath({}, "")).toThrow()
		expect(() => extractByJsonPath({}, "a.b")).toThrow()
		expect(() => extractByJsonPath({}, "$.")).toThrow()
		expect(() => extractByJsonPath({}, "$.a[b]")).toThrow()
		expect(() => extractByJsonPath({}, "$..a")).toThrow()
		expect(() => extractByJsonPath({}, "$.*")).toThrow()
	})
})

describe("isValidJsonPath", () => {
	it("returns true for supported subset", () => {
		expect(isValidJsonPath("$")).toBe(true)
		expect(isValidJsonPath("$.a")).toBe(true)
		expect(isValidJsonPath("$.a.b[0].c")).toBe(true)
	})

	it("returns false for unsupported syntax", () => {
		expect(isValidJsonPath("$..a")).toBe(false)
		expect(isValidJsonPath("$.*")).toBe(false)
		expect(isValidJsonPath("a.b")).toBe(false)
	})
})
