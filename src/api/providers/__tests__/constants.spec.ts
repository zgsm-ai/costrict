// npx vitest run src/api/providers/__tests__/constants.spec.ts

import { DEFAULT_HEADERS } from "../constants"

describe("DEFAULT_HEADERS", () => {
	it("should contain all required headers", () => {
		expect(DEFAULT_HEADERS).toHaveProperty("HTTP-Referer")
		expect(DEFAULT_HEADERS).toHaveProperty("X-Title")
		expect(DEFAULT_HEADERS).toHaveProperty("User-Agent")
		expect(DEFAULT_HEADERS).toHaveProperty("X-Costrict-Version")
	})

	it("should have correct HTTP-Referer value", () => {
		expect(DEFAULT_HEADERS["HTTP-Referer"]).toBe("https://github.com/RooVetGit/Roo-Cline")
	})

	it("should have correct X-Title value", () => {
		expect(DEFAULT_HEADERS["X-Title"]).toBe("Roo Code")
	})

	it("should have correct User-Agent format", () => {
		const userAgent = DEFAULT_HEADERS["User-Agent"]
		expect(userAgent.startsWith("RooCode/")).toBe(true)
	})

	it("should be an object with string values", () => {
		expect(typeof DEFAULT_HEADERS).toBe("object")
		expect(DEFAULT_HEADERS).not.toBeNull()

		Object.values(DEFAULT_HEADERS).forEach((value) => {
			expect(typeof value).toBe("string")
			expect(value.length).toBeGreaterThan(0)
		})
	})

	it("should have exactly 4 headers", () => {
		const headerKeys = Object.keys(DEFAULT_HEADERS)
		expect(headerKeys).toHaveLength(4)
		expect(headerKeys).toEqual(["HTTP-Referer", "X-Title", "User-Agent", "X-Costrict-Version"])
	})
})
