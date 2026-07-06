import { describe, expect, it } from "vitest"

import { pickFresher, type CostrictTokenPair } from "./pickFresher"

/**
 * Build a minimal (unsigned) JWT whose payload carries the given `iat`/`exp`.
 * jwt-decode only parses structure, it does not verify the signature.
 */
const fakeJwt = (iat: number, exp: number): string => {
	const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url")
	const payload = Buffer.from(JSON.stringify({ iat, exp })).toString("base64url")
	return `${header}.${payload}.sig`
}

const pair = (
	refreshIat: number,
	refreshExp: number,
	accessIat: number = refreshIat,
	accessExp: number = refreshExp,
): CostrictTokenPair => ({
	access_token: fakeJwt(accessIat, accessExp),
	refresh_token: fakeJwt(refreshIat, refreshExp),
})

describe("pickFresher", () => {
	it("returns null when both inputs are null", () => {
		expect(pickFresher(null, null)).toBeNull()
	})

	it("returns the valid pair when the other is null", () => {
		const a = pair(1_000, 2_000)
		expect(pickFresher(a, null)).toBe(a)
		expect(pickFresher(null, a)).toBe(a)
	})

	it("prefers the pair with the newer refresh_token `iat`", () => {
		const older = pair(1_000, 5_000)
		const newer = pair(2_000, 5_000)
		expect(pickFresher(older, newer)).toBe(newer)
		expect(pickFresher(newer, older)).toBe(newer)
	})

	it("falls back to refresh_token `exp` when `iat` is equal", () => {
		const shorter = pair(1_000, 2_000)
		const longer = pair(1_000, 3_000)
		expect(pickFresher(shorter, longer)).toBe(longer)
		expect(pickFresher(longer, shorter)).toBe(longer)
	})

	it("returns the first argument (`a`) for determinism when both are equal", () => {
		const a = pair(1_000, 2_000)
		const b = pair(1_000, 2_000)
		expect(pickFresher(a, b)).toBe(a)
	})

	it("detects an access-only rotation when refresh_tokens are equal", () => {
		// refresh unchanged, but access_token was refreshed (newer iat)
		const staleAccess = pair(1_000, 5_000, 1_000, 2_000)
		const freshAccess = pair(1_000, 5_000, 2_000, 2_000)
		expect(pickFresher(staleAccess, freshAccess)).toBe(freshAccess)
		expect(pickFresher(freshAccess, staleAccess)).toBe(freshAccess)
	})

	it("prefers a newer refresh_token even when the other side has a newer access_token", () => {
		// refresh dominates access: newer refresh wins despite older access
		const newerRefresh = pair(2_000, 5_000, 1_000, 2_000)
		const olderRefresh = pair(1_000, 5_000, 9_000, 9_000)
		expect(pickFresher(newerRefresh, olderRefresh)).toBe(newerRefresh)
		expect(pickFresher(olderRefresh, newerRefresh)).toBe(newerRefresh)
	})

	it("treats an undecodable refresh_token as the oldest", () => {
		const valid = pair(1_000, 2_000)
		const garbage: CostrictTokenPair = { access_token: "x", refresh_token: "not-a-jwt" }
		expect(pickFresher(valid, garbage)).toBe(valid)
		expect(pickFresher(garbage, valid)).toBe(valid)
	})

	it("returns the other side when one side has an empty refresh_token", () => {
		const valid = pair(1_000, 2_000)
		const empty: CostrictTokenPair = { access_token: "x", refresh_token: "" }
		expect(pickFresher(valid, empty)).toBe(valid)
		expect(pickFresher(empty, valid)).toBe(valid)
	})

	it("prefers the first argument when neither refresh_token is decodable", () => {
		// Without a decodable iat/exp on either side there is no basis to switch,
		// so the current value (`a`) is kept rather than flipping to `b`.
		const a: CostrictTokenPair = { access_token: "x", refresh_token: "bad-1" }
		const b: CostrictTokenPair = { access_token: "y", refresh_token: "bad-2" }
		expect(pickFresher(a, b)).toBe(a)
	})
})
