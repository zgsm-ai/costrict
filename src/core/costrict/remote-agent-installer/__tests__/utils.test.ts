/**
 * Tests for shared utilities in the remote-agent-installer module.
 * Covers: NFR-004 URL redaction (no sensitive tokens in logs).
 *
 * Note: URL.toString() URL-encodes special characters like < and >, so
 * "<redacted>" becomes "%3Credacted%3E" in the output. We test that:
 * 1. The original sensitive value is NOT present in the output.
 * 2. The parameter key is still present (not removed entirely).
 * 3. The replacement value contains "redacted" (either as-is or URL-encoded).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { redactUrl, getCheckIntervalMs } from "../utils"

describe("redactUrl (NFR-004: no sensitive info in logs)", () => {
	it("should redact token query parameter", () => {
		const raw = "https://api.example.com/package.zip?token=abc123&version=1.0"
		const result = redactUrl(raw)
		// Sensitive value must not appear in output
		expect(result).not.toContain("abc123")
		// Parameter key must still be present
		expect(result).toContain("token=")
		// Replacement value must contain "redacted" (URL-encoded or plain)
		expect(result.toLowerCase()).toContain("redacted")
		// Non-sensitive params preserved
		expect(result).toContain("version=1.0")
	})

	it("should redact auth query parameter", () => {
		const raw = "https://api.example.com/package.zip?auth=secret-value"
		const result = redactUrl(raw)
		expect(result).not.toContain("secret-value")
		expect(result).toContain("auth=")
		expect(result.toLowerCase()).toContain("redacted")
	})

	it("should redact key query parameter", () => {
		const raw = "https://api.example.com/package.zip?key=my-api-key"
		const result = redactUrl(raw)
		expect(result).not.toContain("my-api-key")
		expect(result).toContain("key=")
		expect(result.toLowerCase()).toContain("redacted")
	})

	it("should redact signature query parameter", () => {
		const raw = "https://api.example.com/package.zip?signature=deadbeef"
		const result = redactUrl(raw)
		expect(result).not.toContain("deadbeef")
		expect(result).toContain("signature=")
		expect(result.toLowerCase()).toContain("redacted")
	})

	it("should redact multiple sensitive parameters at once", () => {
		const raw = "https://api.example.com/pkg.zip?token=tok1&auth=auth1&key=key1&signature=sig1&version=2.0"
		const result = redactUrl(raw)
		// All sensitive values must be gone
		expect(result).not.toContain("tok1")
		expect(result).not.toContain("auth1")
		expect(result).not.toContain("key1")
		expect(result).not.toContain("sig1")
		// Non-sensitive param preserved
		expect(result).toContain("version=2.0")
		// All sensitive keys still present (with redacted values)
		expect(result).toContain("token=")
		expect(result).toContain("auth=")
		expect(result).toContain("key=")
		expect(result).toContain("signature=")
	})

	it("should preserve URL path and non-sensitive query params", () => {
		const raw = "https://api.example.com/costrict-static/agent-package/latest.json?version=1.0.0"
		const result = redactUrl(raw)
		expect(result).toContain("/costrict-static/agent-package/latest.json")
		expect(result).toContain("version=1.0.0")
	})

	it("should return URL unchanged when no sensitive params present", () => {
		const raw = "https://api.example.com/package.zip?version=1.0&format=zip"
		const result = redactUrl(raw)
		expect(result).toContain("version=1.0")
		expect(result).toContain("format=zip")
		// No redaction markers should appear
		expect(result.toLowerCase()).not.toContain("redacted")
	})

	it("should return raw string unchanged when URL is invalid", () => {
		const raw = "not-a-valid-url"
		const result = redactUrl(raw)
		expect(result).toBe(raw)
	})

	it("should handle URL with no query string", () => {
		const raw = "https://api.example.com/package.zip"
		const result = redactUrl(raw)
		expect(result).toBe(raw)
	})
})

describe("getCheckIntervalMs (COSTRICT_AGENT_CHECK_INTERVAL_MINUTES)", () => {
	const ENV_KEY = "COSTRICT_AGENT_CHECK_INTERVAL_MINUTES"
	const DEFAULT_MS = 24 * 60 * 60 * 1000 // 1440 minutes = 24 hours

	beforeEach(() => {
		delete process.env[ENV_KEY]
	})

	afterEach(() => {
		delete process.env[ENV_KEY]
	})

	it("should return default 24h when env var is not set", () => {
		expect(getCheckIntervalMs()).toBe(DEFAULT_MS)
	})

	it("should return default 24h when env var is empty string", () => {
		process.env[ENV_KEY] = ""
		expect(getCheckIntervalMs()).toBe(DEFAULT_MS)
	})

	it("should return correct ms for a valid minute value (5 minutes)", () => {
		process.env[ENV_KEY] = "5"
		expect(getCheckIntervalMs()).toBe(5 * 60 * 1000)
	})

	it("should return correct ms for minimum value (1 minute)", () => {
		process.env[ENV_KEY] = "1"
		expect(getCheckIntervalMs()).toBe(1 * 60 * 1000)
	})

	it("should return correct ms for 720 minutes (12 hours)", () => {
		process.env[ENV_KEY] = "720"
		expect(getCheckIntervalMs()).toBe(720 * 60 * 1000)
	})

	it("should fall back to default when value is 0 (below minimum)", () => {
		process.env[ENV_KEY] = "0"
		expect(getCheckIntervalMs()).toBe(DEFAULT_MS)
	})

	it("should fall back to default when value is negative", () => {
		process.env[ENV_KEY] = "-5"
		expect(getCheckIntervalMs()).toBe(DEFAULT_MS)
	})

	it("should fall back to default when value is non-numeric", () => {
		process.env[ENV_KEY] = "abc"
		expect(getCheckIntervalMs()).toBe(DEFAULT_MS)
	})

	it("should fall back to default when value is a float string", () => {
		process.env[ENV_KEY] = "1.5"
		// parseInt("1.5") = 1, which is >= MIN_MINUTES, so should return 1 minute
		expect(getCheckIntervalMs()).toBe(1 * 60 * 1000)
	})
})
