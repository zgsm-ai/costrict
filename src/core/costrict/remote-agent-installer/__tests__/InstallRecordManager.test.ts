import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import * as fs from "fs/promises"
import * as path from "path"
import * as os from "os"
import { InstallRecordManager } from "../InstallRecordManager"
import type { LocalInstallRecord } from "../types"

vi.mock("../../../utils/logger", () => ({
	createLogger: () => ({
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	}),
}))

// Mock getCheckIntervalMs to always return 12h regardless of environment variables.
// Without this, COSTRICT_AGENT_CHECK_INTERVAL_MINUTES in the environment can cause
// shouldCheck boundary tests to fail (e.g. 11h59m would exceed a 1-minute interval).
vi.mock("../utils", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../utils")>()
	return {
		...actual,
		getCheckIntervalMs: () => 12 * 60 * 60 * 1000,
	}
})

describe("InstallRecordManager", () => {
	let tmpDir: string
	let manager: InstallRecordManager

	beforeEach(async () => {
		tmpDir = path.join(os.tmpdir(), `rr-test-${Date.now()}`)
		await fs.mkdir(tmpDir, { recursive: true })
		manager = new InstallRecordManager(path.join(tmpDir, "record.json"))
	})

	afterEach(async () => {
		await fs.rm(tmpDir, { recursive: true, force: true })
	})

	it("should return default record when file does not exist", async () => {
		const record = await manager.read()
		expect(record.installedVersion).toBe("0.0.0")
		expect(record.installState).toBe("none")
		expect(record.schemaVersion).toBe(1)
		expect(record.lastCheckedAt).toBe(0)
		expect(record.manifest.agents).toEqual([])
	})

	it("should read existing record", async () => {
		const existing: LocalInstallRecord = {
			schemaVersion: 1,
			installedVersion: "1.2.3",
			lastCheckedAt: Date.now(),
			installState: "installed",
			manifest: { agents: ["a"], commands: ["b"], skills: ["c"], rules: ["d"], mcp: ["e"] },
		}
		await fs.writeFile(path.join(tmpDir, "record.json"), JSON.stringify(existing), "utf-8")
		const record = await manager.read()
		expect(record.installedVersion).toBe("1.2.3")
		expect(record.installState).toBe("installed")
	})

	it("should reset to default when schema version mismatch", async () => {
		const bad = {
			schemaVersion: 0,
			installedVersion: "1.0.0",
			lastCheckedAt: 0,
			installState: "none",
			manifest: {},
		}
		await fs.writeFile(path.join(tmpDir, "record.json"), JSON.stringify(bad), "utf-8")
		const record = await manager.read()
		expect(record.installedVersion).toBe("0.0.0")
	})

	it("should reset to default on invalid JSON", async () => {
		await fs.writeFile(path.join(tmpDir, "record.json"), "not json", "utf-8")
		const record = await manager.read()
		expect(record.installedVersion).toBe("0.0.0")
	})

	it("should write and read back record", async () => {
		const record: LocalInstallRecord = {
			schemaVersion: 1,
			installedVersion: "2.0.0",
			lastCheckedAt: 12345,
			installState: "installed",
			manifest: { agents: [], commands: [], skills: [], rules: [], mcp: [] },
		}
		await manager.write(record)
		const readBack = await manager.read()
		expect(readBack.installedVersion).toBe("2.0.0")
		expect(readBack.lastCheckedAt).toBe(12345)
	})

	it("shouldCheck returns true when lastCheckedAt is 0", () => {
		const record: LocalInstallRecord = {
			schemaVersion: 1,
			installedVersion: "0.0.0",
			lastCheckedAt: 0,
			installState: "none",
			manifest: { agents: [], commands: [], skills: [], rules: [], mcp: [] },
		}
		expect(manager.shouldCheck(record)).toBe(true)
	})

	it("shouldCheck returns false within 12 hours (1 second ago)", () => {
		const record: LocalInstallRecord = {
			schemaVersion: 1,
			installedVersion: "0.0.0",
			lastCheckedAt: Date.now() - 1000,
			installState: "none",
			manifest: { agents: [], commands: [], skills: [], rules: [], mcp: [] },
		}
		expect(manager.shouldCheck(record)).toBe(false)
	})

	// Critical boundary test: 11h59m should still be within cooldown (< 12h)
	it("shouldCheck returns false at 11h59m (just under 12h cooldown)", () => {
		const record: LocalInstallRecord = {
			schemaVersion: 1,
			installedVersion: "0.0.0",
			lastCheckedAt: Date.now() - (12 * 60 * 60 * 1000 - 60 * 1000), // 11h59m ago
			installState: "none",
			manifest: { agents: [], commands: [], skills: [], rules: [], mcp: [] },
		}
		expect(manager.shouldCheck(record)).toBe(false)
	})

	// Critical boundary test: exactly 12h should trigger a check (>= 12h)
	it("shouldCheck returns true at exactly 12h cooldown boundary", () => {
		const record: LocalInstallRecord = {
			schemaVersion: 1,
			installedVersion: "0.0.0",
			lastCheckedAt: Date.now() - 12 * 60 * 60 * 1000,
			installState: "none",
			manifest: { agents: [], commands: [], skills: [], rules: [], mcp: [] },
		}
		expect(manager.shouldCheck(record)).toBe(true)
	})

	// Critical boundary test: 13h (between 12h and 24h) must return true.
	// This test would FAIL if cooldown were 24h, catching any regression to 24h.
	it("shouldCheck returns true at 13h (between 12h and 24h — catches 24h regression)", () => {
		const record: LocalInstallRecord = {
			schemaVersion: 1,
			installedVersion: "0.0.0",
			lastCheckedAt: Date.now() - 13 * 60 * 60 * 1000,
			installState: "none",
			manifest: { agents: [], commands: [], skills: [], rules: [], mcp: [] },
		}
		expect(manager.shouldCheck(record)).toBe(true)
	})

	it("shouldCheck returns true after 25 hours", () => {
		const record: LocalInstallRecord = {
			schemaVersion: 1,
			installedVersion: "0.0.0",
			lastCheckedAt: Date.now() - 25 * 60 * 60 * 1000,
			installState: "none",
			manifest: { agents: [], commands: [], skills: [], rules: [], mcp: [] },
		}
		expect(manager.shouldCheck(record)).toBe(true)
	})
})
