import { describe, it, expect } from "vitest"
import { sanitizeString, sanitizeCommand, sanitizeArguments, truncateForAudit, summarizeResult } from "../sanitize"

describe("sanitizeString", () => {
	it("returns empty string for null/undefined", () => {
		expect(sanitizeString(null)).toBe("")
		expect(sanitizeString(undefined)).toBe("")
	})

	it("passes through non-sensitive strings unchanged", () => {
		expect(sanitizeString("hello world")).toBe("hello world")
		expect(sanitizeString("const x = 1;")).toBe("const x = 1;")
		expect(sanitizeString("https://example.com/api")).toBe("https://example.com/api")
		expect(sanitizeString("username=admin")).toBe("username=admin")
	})

	it("redacts Bearer tokens", () => {
		expect(sanitizeString("Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9")).toBe("Bearer [REDACTED]")
		expect(sanitizeString("Bearer sk-ant-api03-abcdefghijklmnop")).toBe("Bearer [REDACTED]")
	})

	it("redacts Authorization headers with Bearer tokens", () => {
		expect(sanitizeString("Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9")).toBe(
			"Authorization: Bearer [REDACTED]",
		)
	})

	it("redacts API key patterns", () => {
		expect(sanitizeString("api_key=my_secret_key_12345")).toBe("api_key=[REDACTED]")
		expect(sanitizeString("X-API-Key: 1234567890abcdefgh")).toBe("X-API-Key: [REDACTED]")
		expect(sanitizeString("process.env.API_KEY='abcdef123456'")).toBe("process.env.API_KEY='[REDACTED]'")
	})

	it("redacts AWS credentials", () => {
		expect(sanitizeString("AKIAIOSFODNN7EXAMPLE")).toBe("[REDACTED_AWS_KEY]")
		expect(sanitizeString("aws_secret_access_key=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY")).toBe(
			"aws_secret_access_key=[REDACTED]",
		)
	})

	it("redacts GitHub tokens", () => {
		expect(sanitizeString("ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx")).toBe("[REDACTED_GITHUB_TOKEN]")
	})

	it("redacts OpenAI keys", () => {
		expect(sanitizeString("sk-1234567890abcdefghijklmnopqrstuvwxyz")).toBe("[REDACTED_OPENAI_KEY]")
	})

	it("redacts Anthropic keys", () => {
		expect(sanitizeString("sk-ant-api03-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx")).toBe("[REDACTED_ANTHROPIC_KEY]")
	})

	it("redacts private key PEM blocks", () => {
		const pem = "-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----"
		const result = sanitizeString(pem)
		expect(result).toContain("[REDACTED]")
		expect(result).toContain("-----BEGIN RSA PRIVATE KEY-----")
		expect(result).not.toContain("MIIEpAIBAAKCAQEA")
	})

	it("redacts passwords in URLs", () => {
		expect(sanitizeString("https://user:password123@example.com/api")).toBe(
			"https://[REDACTED_USER]:[REDACTED_PASS]@example.com/api",
		)
	})

	it("redacts JSON password fields", () => {
		expect(sanitizeString('{"password": "supersecret123"}')).toBe('{"password": "[REDACTED]"}')
		expect(sanitizeString('{"api_key": "sk-1234567890abcdefghijklmnop"}')).toBe('{"api_key": "[REDACTED]"}')
		expect(sanitizeString('{"token": "Bearer secretlongtoken"}')).toBe('{"token": "[REDACTED]"}')
		expect(sanitizeString('{"secret": "my_secret_value123"}')).toBe('{"secret": "[REDACTED]"}')
		expect(sanitizeString('{"access_key_id": "AKIA1234567890ABCDEFG"}')).toBe('{"access_key_id": "[REDACTED]"}')
	})

	it("handles short tokens that don't match minimum length", () => {
		// These should pass through unchanged since they don't meet minimum length requirements
		expect(sanitizeString("Bearer abc")).toBe("Bearer abc")
		expect(sanitizeString("api_key=abc")).toBe("api_key=abc")
	})

	it("does not over-redact already sanitized values", () => {
		// Once a value is redacted to [REDACTED...], it should not be further modified
		expect(sanitizeString("[REDACTED_OPENAI_KEY]")).toBe("[REDACTED_OPENAI_KEY]")
		expect(sanitizeString("[REDACTED_GITHUB_TOKEN]")).toBe("[REDACTED_GITHUB_TOKEN]")
		expect(sanitizeString("Bearer [REDACTED]")).toBe("Bearer [REDACTED]")
	})
})

describe("sanitizeCommand", () => {
	it("sanitizes command strings with embedded secrets", () => {
		expect(sanitizeCommand("curl -H 'Authorization: Bearer mylongtoken12345' https://api.example.com")).toContain(
			"[REDACTED]",
		)
		expect(sanitizeCommand("npm install --api-key=mykey1234567890")).toContain("[REDACTED]")
	})

	it("passes through safe commands unchanged", () => {
		expect(sanitizeCommand("ls -la")).toBe("ls -la")
		expect(sanitizeCommand("git status")).toBe("git status")
		expect(sanitizeCommand("echo 'hello world'")).toBe("echo 'hello world'")
	})
})

describe("sanitizeArguments", () => {
	it("returns empty object for null/undefined", () => {
		expect(sanitizeArguments(null)).toEqual({})
		expect(sanitizeArguments(undefined)).toEqual({})
	})

	it("passes through primitives unchanged", () => {
		expect(sanitizeArguments(42)).toBe(42)
		expect(sanitizeArguments(true)).toBe(true)
		expect(sanitizeArguments("hello")).toEqual({ value: "hello" })
	})

	it("sanitizes top-level string fields with known patterns", () => {
		const result = sanitizeArguments({
			path: "/src/index.ts",
			api_key: "sk-1234567890abcdefghijklmnop",
			content: "const x = 1;",
		})
		expect(result["path"]).toBe("/src/index.ts")
		expect(result["api_key"]).toBe("[REDACTED_OPENAI_KEY]")
		expect(result["content"]).toBe("const x = 1;")
	})

	it("sanitizes nested objects recursively", () => {
		const result = sanitizeArguments({
			server: {
				host: "localhost",
				api_key: "sk-1234567890abcdefghijklmnop",
				nested: {
					token: "Bearer mylongauthtoken12345",
				},
			},
		}) as Record<string, Record<string, Record<string, unknown>>>
		expect(result["server"]["host"]).toBe("localhost")
		expect(result["server"]["api_key"]).toBe("[REDACTED_OPENAI_KEY]")
		expect(result["server"]["nested"]["token"]).toContain("[REDACTED]")
	})

	it("sanitizes arrays", () => {
		const result = sanitizeArguments({
			items: [
				{ name: "test", token: "Bearer mylongtoken12345" },
				{ name: "prod", api_key: "sk-1234567890abcdefghijklmnop" },
			],
		}) as Record<string, Array<Record<string, unknown>>>
		expect(result["items"][0]["name"]).toBe("test")
		expect(result["items"][0]["token"]).toContain("[REDACTED]")
		expect(result["items"][1]["api_key"]).toBe("[REDACTED_OPENAI_KEY]")
	})

	it("preserves numeric and boolean values", () => {
		const result = sanitizeArguments({
			timeout: 30000,
			enabled: true,
			retries: 3,
		})
		expect(result["timeout"]).toBe(30000)
		expect(result["enabled"]).toBe(true)
		expect(result["retries"]).toBe(3)
	})

	it("sanitizes JSON field patterns in string values", () => {
		const result = sanitizeArguments({
			config: '{"password": "mysupersecret"}',
		})
		expect(result["config"]).toBe('{"password": "[REDACTED]"}')
	})

	it("does not over-redact already sanitized sentinel values", () => {
		const result = sanitizeArguments({
			key: "[REDACTED_OPENAI_KEY]",
			token: "Bearer [REDACTED]",
		})
		expect(result["key"]).toBe("[REDACTED_OPENAI_KEY]")
		expect(result["token"]).toBe("Bearer [REDACTED]")
	})
})

describe("truncateForAudit", () => {
	it("returns short strings unchanged", () => {
		expect(truncateForAudit("hello")).toBe("hello")
		expect(truncateForAudit("a".repeat(500))).toBe("a".repeat(500))
	})

	it("truncates long strings with marker", () => {
		const long = "a".repeat(600)
		const result = truncateForAudit(long, 100)
		expect(result).toBe("a".repeat(100) + "... [truncated]")
	})

	it("uses default maxLength of 500", () => {
		const long = "x".repeat(600)
		const result = truncateForAudit(long)
		expect(result).toBe("x".repeat(500) + "... [truncated]")
	})

	it("returns empty string for empty input", () => {
		expect(truncateForAudit("", 100)).toBe("")
	})
})

describe("summarizeResult", () => {
	it("returns (empty) for null/undefined", () => {
		expect(summarizeResult(null)).toBe("(empty)")
		expect(summarizeResult(undefined)).toBe("(empty)")
	})

	it("passes through short strings", () => {
		expect(summarizeResult("hello")).toBe("hello")
		expect(summarizeResult("File saved successfully")).toBe("File saved successfully")
	})

	it("truncates long strings", () => {
		const long = "x".repeat(300)
		const result = summarizeResult(long, 100)
		expect(result).toBe("x".repeat(100) + "... [truncated]")
	})

	it("stringifies and truncates long objects", () => {
		const long = { status: "ok", code: 200, data: "x".repeat(300) }
		const result = summarizeResult(long, 50)
		expect(result).toBe(
			JSON.stringify({ status: "ok", code: 200, data: "x".repeat(50) }).slice(0, 50) + "... [truncated]",
		)
	})
})
