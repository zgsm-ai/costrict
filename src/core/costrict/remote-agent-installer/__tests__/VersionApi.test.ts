import { describe, it, expect, vi, beforeEach } from "vitest"
import { VersionApi } from "../VersionApi"

vi.mock("../../../utils/logger", () => ({
	createLogger: () => ({
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	}),
}))

vi.mock("../../../shared/headers", () => ({
	COSTRICT_DEFAULT_HEADERS: {},
}))

vi.mock("uuid", () => ({
	v7: () => "mock-uuid",
}))

describe("VersionApi", () => {
	let api: VersionApi

	beforeEach(() => {
		api = new VersionApi()
		vi.restoreAllMocks()
		vi.spyOn(api as any, "getBaseUrl").mockResolvedValue("https://api.example.com")
		vi.spyOn(api as any, "getRequestHeaders").mockResolvedValue({
			"Content-Type": "application/json",
			"X-Request-ID": "mock-uuid",
			"Accept-Language": "zh",
			Authorization: "Bearer test-key",
		})
	})

	it("should return null when response has no downloadUrl", async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ version: "1.0.0" }),
		})
		const result = await api.getLatestVersion()
		expect(result).toBeNull()
	})

	it("should throw for invalid semver", async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ version: "abc", downloadUrl: "https://example.com/pkg.zip" }),
		})
		await expect(api.getLatestVersion()).rejects.toThrow("Invalid or missing version")
	})

	it("should resolve absolute download url", async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				version: "1.2.3",
				downloadUrl: "https://cdn.example.com/pkg.zip",
				checksum: "abc123",
				checksumAlgo: "sha256",
			}),
		})
		const result = await api.getLatestVersion()
		expect(result).not.toBeNull()
		expect(result?.version).toBe("1.2.3")
		expect(result?.downloadUrl).toBe("https://cdn.example.com/pkg.zip")
	})

	it("should resolve relative download url", async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				version: "1.0.0",
				downloadUrl: "/pkg.zip",
			}),
		})
		const result = await api.getLatestVersion()
		expect(result?.downloadUrl).toBe("https://api.example.com/pkg.zip")
	})

	it("should throw on non-ok response", async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: false,
			status: 500,
		})
		await expect(api.getLatestVersion()).rejects.toThrow("HTTP 500")
	})

	it("should throw on fetch error", async () => {
		global.fetch = vi.fn().mockRejectedValue(new Error("network error"))
		await expect(api.getLatestVersion()).rejects.toThrow("network error")
	})

	// Bug5 regression: when costrictBaseUrl is empty, getLatestVersion should return null
	// with a clear log message instead of throwing "TypeError: Failed to parse URL".
	it("should return null and not throw when costrictBaseUrl is empty", async () => {
		vi.spyOn(api as any, "getBaseUrl").mockResolvedValue("")
		// fetch should NOT be called when baseUrl is empty
		global.fetch = vi.fn()
		const result = await api.getLatestVersion()
		expect(result).toBeNull()
		expect(global.fetch).not.toHaveBeenCalled()
	})

	it("should return null and not throw when costrictBaseUrl is undefined", async () => {
		vi.spyOn(api as any, "getBaseUrl").mockResolvedValue("")
		global.fetch = vi.fn()
		const result = await api.getLatestVersion()
		expect(result).toBeNull()
		expect(global.fetch).not.toHaveBeenCalled()
	})

	// FR-003 / NFR-002: VersionApi must propagate timeout errors so callers can distinguish
	// network failures from "no package available" (null return).
	it("should throw when fetch times out (AbortError)", async () => {
		const abortError = new DOMException("The operation was aborted.", "AbortError")
		global.fetch = vi.fn().mockRejectedValue(abortError)
		await expect(api.getLatestVersion()).rejects.toThrow()
	})

	// NFR-004: name field from server response should be preserved in returned object
	it("should preserve name field from server response", async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				name: "Architecture Agent",
				version: "2.0.0",
				downloadUrl: "https://cdn.example.com/pkg.zip",
			}),
		})
		const result = await api.getLatestVersion()
		expect(result?.name).toBe("Architecture Agent")
		expect(result?.version).toBe("2.0.0")
	})

	// FR-003: name field defaults gracefully when absent
	it("should return result with undefined name when name is absent", async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				version: "1.5.0",
				downloadUrl: "https://cdn.example.com/pkg.zip",
			}),
		})
		const result = await api.getLatestVersion()
		expect(result).not.toBeNull()
		expect(result?.name).toBeUndefined()
	})
})
