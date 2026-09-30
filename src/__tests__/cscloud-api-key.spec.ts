import { describe, expect, it, vi, beforeEach } from "vitest"

const { mockFs } = vi.hoisted(() => ({
	mockFs: {
		existsSync: vi.fn(),
		readFileSync: vi.fn(),
	},
}))

vi.mock("fs", () => mockFs)

import { resolveCsCloudApiKey } from "../core/cs-cloud/extension/csCloudApiKey"

describe("resolveCsCloudApiKey", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mockFs.existsSync.mockReturnValue(false)
		mockFs.readFileSync.mockImplementation(() => {
			throw Object.assign(new Error("ENOENT"), { code: "ENOENT" })
		})
	})

	it("env keys win over config.json", () => {
		expect(resolveCsCloudApiKey({ CS_BRIDGE_API_KEY: "bridge-key" }, "/home/testuser")).toBe("bridge-key")
		expect(resolveCsCloudApiKey({ CS_CLOUD_API_KEY: "cloud-key" }, "/home/testuser")).toBe("cloud-key")
		expect(mockFs.existsSync).not.toHaveBeenCalled()
	})

	it("reads config.json from the cs-bridge root when it holds server_url", () => {
		mockFs.existsSync.mockImplementation((p: string) => {
			return (
				p.toString().endsWith(".costrict/cs-bridge/server_url") ||
				p.toString().endsWith("cs-bridge/config.json")
			)
		})
		mockFs.readFileSync.mockReturnValue(JSON.stringify({ api_key: "bridge-config-key" }))

		expect(resolveCsCloudApiKey({}, "/home/testuser")).toBe("bridge-config-key")
		expect(mockFs.readFileSync).toHaveBeenCalledWith("/home/testuser/.costrict/cs-bridge/config.json", "utf-8")
	})

	it("reads config.json from the legacy cs-cloud root as fallback", () => {
		mockFs.existsSync.mockImplementation((p: string) => {
			return (
				p.toString().endsWith(".costrict/cs-cloud/server_url") || p.toString().endsWith("cs-cloud/config.json")
			)
		})
		mockFs.readFileSync.mockReturnValue(JSON.stringify({ api_key: "legacy-config-key" }))

		expect(resolveCsCloudApiKey({}, "/home/testuser")).toBe("legacy-config-key")
		expect(mockFs.readFileSync).toHaveBeenCalledWith("/home/testuser/.costrict/cs-cloud/config.json", "utf-8")
	})

	it("defaults to the cs-bridge root when no server_url exists anywhere", () => {
		mockFs.existsSync.mockImplementation((p: string) => p.toString().endsWith("cs-bridge/config.json"))
		mockFs.readFileSync.mockReturnValue(JSON.stringify({ api_key: "fresh-key" }))

		expect(resolveCsCloudApiKey({}, "/home/testuser")).toBe("fresh-key")
	})

	it("returns undefined without a readable config.json", () => {
		mockFs.existsSync.mockReturnValue(true)
		mockFs.readFileSync.mockReturnValue("{bad json")

		expect(resolveCsCloudApiKey({}, "/home/testuser")).toBeUndefined()
	})
})
