import * as net from "net"
import * as fs from "fs"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Mock dependencies before importing the module under test
vi.mock("../utils", () => ({
	getIPCPath: () => "/tmp/costrict-ipc-test-" + process.pid + ".sock",
}))

describe("startIPCServer", () => {
	let startIPCServer: typeof import("../server").startIPCServer
	let stopIPCServer: typeof import("../server").stopIPCServer
	let getIPCPath: () => string

	beforeEach(async () => {
		// Re-import to get fresh module state for each test
		vi.resetModules()
		const mod = await import("../server")
		startIPCServer = mod.startIPCServer
		stopIPCServer = mod.stopIPCServer
		const utils = await import("../utils")
		getIPCPath = utils.getIPCPath
	})

	afterEach(() => {
		stopIPCServer()
		const ipcPath = getIPCPath()
		try {
			fs.unlinkSync(ipcPath)
		} catch {
			// ignore
		}
	})

	it("should start a new server when no existing server is running", async () => {
		await startIPCServer()
		// Verify we can connect to the new server
		const client = net.createConnection({ path: getIPCPath() })
		await new Promise<void>((resolve, reject) => {
			client.on("connect", () => {
				client.end()
				resolve()
			})
			client.on("error", reject)
		})
	})

	it("should resolve quickly even with a stale socket file", async () => {
		const ipcPath = getIPCPath()
		// Create a stale socket file (just a regular file, no listener)
		fs.writeFileSync(ipcPath, "")

		const start = Date.now()
		await startIPCServer()
		const elapsed = Date.now() - start

		// Should resolve within 3 seconds (timeout is 1s + server start overhead)
		// Without the timeout fix this would hang for much longer
		expect(elapsed).toBeLessThan(3000)
	})

	it("should detect an already running server and not start a new one", async () => {
		// Start the first server
		await startIPCServer()

		// Re-import to get a fresh module (simulating a second window)
		vi.resetModules()
		const mod2 = await import("../server")

		// Second call should detect the existing server and resolve
		const start = Date.now()
		await mod2.startIPCServer()
		const elapsed = Date.now() - start

		expect(elapsed).toBeLessThan(2000)

		// Clean up second module
		mod2.stopIPCServer()
	})
})
