import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from "vitest"
import * as fs from "fs/promises"
import * as path from "path"
import * as os from "os"
import * as http from "http"
import { allowNetConnect } from "../../../../vitest.setup"
import { AgentDownloader } from "../AgentDownloader"
import type { ResourcePackageVersion } from "../types"
import { FatalInstallerError } from "../types"

vi.mock("../../../utils/logger", () => ({
	createLogger: () => ({
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	}),
}))

describe("AgentDownloader", () => {
	let tmpDir: string
	let downloader: AgentDownloader

	beforeAll(() => {
		// Allow local HTTP server connections (nock blocks all by default)
		allowNetConnect("127.0.0.1")
	})

	beforeEach(async () => {
		tmpDir = path.join(os.tmpdir(), `rd-test-${Date.now()}`)
		await fs.mkdir(tmpDir, { recursive: true })
		downloader = new AgentDownloader(tmpDir)
	})

	afterEach(async () => {
		await fs.rm(tmpDir, { recursive: true, force: true })
	})

	it("should throw when download fails", async () => {
		const versionInfo: ResourcePackageVersion = {
			version: "1.0.0",
			downloadUrl: "http://localhost:99999/nonexistent",
		}
		await expect(downloader.download(versionInfo)).rejects.toThrow()
	})

	it("should cleanup residual files", async () => {
		await fs.writeFile(path.join(tmpDir, "remote-agent-package-1.0.0.zip"), "old", "utf-8")
		await fs.writeFile(path.join(tmpDir, "remote-agent-package-1.0.0.zip.downloading"), "old", "utf-8")
		await downloader.cleanupResidualFiles("1.0.0")
		const entries = await fs.readdir(tmpDir)
		expect(entries.filter((e) => e.includes("1.0.0")).length).toBe(0)
	})

	// Bug1 regression: cleanupResidualFiles should clean ALL remote-agent-package-* files,
	// including files from other versions (not just the current version).
	it("should cleanup residual files from other versions", async () => {
		await fs.writeFile(path.join(tmpDir, "remote-agent-package-0.9.0.zip"), "old", "utf-8")
		await fs.writeFile(path.join(tmpDir, "remote-agent-package-0.9.0.zip.downloading"), "old", "utf-8")
		await fs.writeFile(path.join(tmpDir, "remote-agent-package-2.0.0.zip"), "newer", "utf-8")
		await fs.writeFile(path.join(tmpDir, "unrelated-file.txt"), "keep", "utf-8")
		await downloader.cleanupResidualFiles("1.0.0")
		const entries = await fs.readdir(tmpDir)
		// All remote-agent-package-* files should be removed regardless of version
		expect(entries.filter((e) => e.startsWith("remote-agent-package-")).length).toBe(0)
		// Unrelated files should be preserved
		expect(entries).toContain("unrelated-file.txt")
	})

	// Bug1 regression: cleanupResidualFiles should also clean the current version's zip
	// (it is called at the start of download() to clear stale files from previous runs).
	it("should cleanup current version zip file as well", async () => {
		await fs.writeFile(path.join(tmpDir, "remote-agent-package-1.0.0.zip"), "stale", "utf-8")
		await downloader.cleanupResidualFiles("1.0.0")
		const entries = await fs.readdir(tmpDir)
		expect(entries).not.toContain("remote-agent-package-1.0.0.zip")
	})

	// BUG-6 regression: checksum mismatch must throw FatalInstallerError (not plain Error)
	// so that the outer retry logic stops immediately instead of retrying 3 times.
	it("should throw FatalInstallerError on checksum mismatch", async () => {
		// Start a local HTTP server that serves a real file
		const server = http.createServer((req, res) => {
			const data = Buffer.from("fake zip content")
			res.writeHead(200, { "Content-Type": "application/zip", "Content-Length": data.length })
			res.end(data)
		})

		await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()))
		const addr = server.address() as { port: number }
		const port = addr.port

		try {
			const versionInfo: ResourcePackageVersion = {
				version: "1.0.0",
				downloadUrl: `http://127.0.0.1:${port}/remote-agent-package-1.0.0.zip`,
				checksum: "0000000000000000000000000000000000000000000000000000000000000000",
				checksumAlgo: "sha256",
			}

			// Must throw FatalInstallerError, not plain Error
			await expect(downloader.download(versionInfo)).rejects.toThrow(FatalInstallerError)
		} finally {
			await new Promise<void>((resolve) => server.close(() => resolve()))
		}
	})

	// Simplification: AgentDownloader no longer retries internally.
	// All retry logic is handled by the outer RemoteAgentInstaller.runInstallWithRetries.
	// This ensures the total retry count is exactly 3 (FR-014), not 3×3=9.
	it("should NOT retry internally — fail immediately on first download error", async () => {
		let callCount = 0
		const server = http.createServer((req, res) => {
			callCount++
			res.writeHead(500, { "Content-Type": "text/plain" })
			res.end("Internal Server Error")
		})

		await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()))
		const addr = server.address() as { port: number }
		const port = addr.port

		try {
			const versionInfo: ResourcePackageVersion = {
				version: "1.0.0",
				downloadUrl: `http://127.0.0.1:${port}/remote-agent-package-1.0.0.zip`,
			}

			await expect(downloader.download(versionInfo)).rejects.toThrow()
			// Must only attempt once — no internal retry
			expect(callCount).toBe(1)
		} finally {
			await new Promise<void>((resolve) => server.close(() => resolve()))
		}
	})
})
