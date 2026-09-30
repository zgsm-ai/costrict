import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { promises as fs } from "fs"
import os from "os"
import path from "path"
import { CostrictTelemetryClient } from "../costrictTelemetry/telemetryClient"

vi.mock("@roo-code/logger", () => ({
	createLogger: vi.fn(() => ({
		info: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
	})),
}))

/**
 * Regression: the legacy constructor used to rmSync ~/.costrict/telemetry on
 * every activation — that directory is the stability v1 protocol root
 * (outbox + control) and is written by every running extension host. The
 * 2026-09-22/23 field incidents (whole-tree wipe on every window open /
 * reload, stability facts lost mid-run) traced back to it.
 */
describe("CostrictTelemetryClient", () => {
	const realHome = process.env.HOME
	let home: string

	beforeEach(async () => {
		home = await fs.mkdtemp(path.join(os.tmpdir(), "legacy-cleanup-"))
		process.env.HOME = home
	})

	afterEach(async () => {
		if (realHome !== undefined) process.env.HOME = realHome
		await fs.rm(home, { recursive: true, force: true })
	})

	it("never deletes ~/.costrict/telemetry on construction", async () => {
		const telemetry = path.join(home, ".costrict", "telemetry", "outbox")
		await fs.mkdir(telemetry, { recursive: true })
		const factFile = path.join(telemetry, "scope-ab12-pr-cd34ef56.jsonl")
		await fs.writeFile(factFile, '{"schema_version":"1.0"}\n', "utf8")

		new CostrictTelemetryClient("https://telemetry.example.invalid")

		await expect(fs.stat(factFile)).resolves.toBeTruthy()
		await expect(fs.stat(path.join(home, ".costrict", "telemetry"))).resolves.toBeTruthy()
	})
})
