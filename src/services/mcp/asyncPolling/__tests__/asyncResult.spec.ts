// src/services/mcp/asyncPolling/__tests__/asyncResult.spec.ts
import { describe, it, expect } from "vitest"
import { buildSuccess, buildBusinessFailed, buildTransportUnknown, buildConfigError } from "../asyncResult"

describe("asyncResult builders", () => {
	it("buildSuccess wraps object/array via JSON.stringify", () => {
		const r = buildSuccess({ a: 1, b: [2, 3] })
		expect(r.isError).toBeUndefined()
		expect(r.content).toEqual([{ type: "text", text: JSON.stringify({ a: 1, b: [2, 3] }, null, 2) }])
	})

	it("buildSuccess passes strings through as text", () => {
		const r = buildSuccess("hello")
		expect(r.content).toEqual([{ type: "text", text: "hello" }])
	})

	it("buildSuccess on numbers/booleans coerces to string", () => {
		expect(buildSuccess(42).content[0]).toEqual({ type: "text", text: "42" })
		expect(buildSuccess(true).content[0]).toEqual({ type: "text", text: "true" })
	})

	it("buildSuccess on null returns 'null' text", () => {
		expect(buildSuccess(null).content[0]).toEqual({ type: "text", text: "null" })
	})

	it("buildBusinessFailed marks isError and includes extracted message", () => {
		const r = buildBusinessFailed({ extractedError: "deploy crashed" })
		expect(r.isError).toBe(true)
		expect(r.content[0]).toMatchObject({ type: "text" })
		expect((r.content[0] as { text: string }).text).toContain("deploy crashed")
	})

	it("buildBusinessFailed falls back to raw response when no message extracted", () => {
		const r = buildBusinessFailed({ rawResponse: { status: "failed" } })
		expect(r.isError).toBe(true)
		expect((r.content[0] as { text: string }).text).toContain("failed")
	})

	it("buildTransportUnknown includes taskId and reason", () => {
		const r = buildTransportUnknown({ taskId: "T-1", reason: "user_cancelled" })
		expect(r.isError).toBe(true)
		const text = (r.content[0] as { text: string }).text
		expect(text).toContain("T-1")
		expect(text).toContain("user_cancelled")
	})

	it("buildConfigError includes the diagnostic detail", () => {
		const r = buildConfigError("statusPath did not match any state")
		expect(r.isError).toBe(true)
		expect((r.content[0] as { text: string }).text).toContain("statusPath did not match")
	})
})
