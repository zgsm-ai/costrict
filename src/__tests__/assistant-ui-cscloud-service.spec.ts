import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { mockFs, mockSpawn, mockHomedir, mockHttp, mockWhich, mockCrossSpawn } = vi.hoisted(() => {
	const mockHttp: Record<string, any> = {}
	return {
		mockFs: {
			existsSync: vi.fn(),
			readFileSync: vi.fn(),
			writeFileSync: vi.fn(),
			mkdirSync: vi.fn(),
			watch: vi.fn(),
		},
		mockSpawn: { spawn: vi.fn(), execFile: vi.fn() },
		mockHomedir: vi.fn(() => "/home/testuser"),
		mockHttp,
		mockWhich: vi.fn(),
		mockCrossSpawn: vi.fn(),
	}
})

vi.mock("fs", () => mockFs)
vi.mock("os", () => ({ homedir: mockHomedir }))
vi.mock("child_process", () => ({
	spawn: (...args: any[]) => mockSpawn.spawn(...args),
	execFile: (...args: any[]) => mockSpawn.execFile(...args),
}))
vi.mock("http", () => mockHttp)
vi.mock("which", () => ({ default: mockWhich }))
vi.mock("cross-spawn", () => ({ default: mockCrossSpawn }))

const { getConfigValues, setConfigValues } = vi.hoisted(() => {
	let vals: Record<string, unknown> = {}
	return {
		getConfigValues: () => vals,
		setConfigValues: (next: Record<string, unknown>) => {
			vals = next
		},
	}
})

vi.mock("vscode", () => ({
	workspace: {
		workspaceFolders: [{ uri: { fsPath: "/workspace" } }],
		getConfiguration: vi.fn(() => ({
			get: vi.fn((key: string, defaultValue: unknown) => {
				const v = getConfigValues()
				return key in v ? v[key] : defaultValue
			}),
		})),
	},
}))

import { CsCloudService } from "../core/cs-cloud/extension/csCloudService"

function createOutputChannel() {
	return { appendLine: vi.fn() }
}

function resetMocks() {
	vi.clearAllMocks()
	setConfigValues({ baseUrl: "", port: 45489, autoStartCsCloud: true, defaultCli: "csc" })
	mockFs.existsSync.mockReturnValue(false)
	mockFs.readFileSync.mockImplementation(() => {
		throw Object.assign(new Error("ENOENT"), { code: "ENOENT" })
	})
	mockFs.watch.mockReturnValue({ close: vi.fn() })
	mockHomedir.mockReturnValue("/home/testuser")
	mockSpawn.spawn.mockReturnValue({ unref: vi.fn() })
	mockSpawn.execFile.mockImplementation((...args: any[]) => {
		const cb = args[args.length - 1]
		if (typeof cb === "function") cb(new Error("not found"), "", "")
		return undefined as any
	})
	mockWhich.mockRejectedValue(new Error("not found: csc"))
	mockCrossSpawn.mockImplementation(() => {
		const child = {
			on: vi.fn((ev: string, fn: (...args: any[]) => any) => {
				if (ev === "close") setTimeout(() => fn(0), 10)
			}),
			stdout: { on: vi.fn() },
			stderr: { on: vi.fn() },
			unref: vi.fn(),
			kill: vi.fn(),
		}
		return child
	})
}

function mockHealthOk() {
	mockHttp.get = vi.fn((_url: string, cb: (res: any) => void) => {
		setTimeout(() => cb({ statusCode: 200, resume: vi.fn() }), 10)
		return { setTimeout: vi.fn(), on: vi.fn(), destroy: vi.fn() }
	})
}

function mockHealthDown() {
	mockHttp.get = vi.fn((_url: string, _cb: (res: any) => void) => {
		return {
			setTimeout: vi.fn((_ms: number, fn: () => void) => setTimeout(fn, 10)),
			on: vi.fn((ev: string, fn: () => void) => {
				if (ev === "error") setTimeout(fn, 10)
			}),
			destroy: vi.fn(),
		}
	})
}

function setExecFileStdout(output: string) {
	mockWhich.mockResolvedValue("/usr/local/bin/csc")
	mockCrossSpawn.mockImplementation(() => {
		const stdoutHandlers: ((data: Buffer) => void)[] = []
		const stderrHandlers: ((data: Buffer) => void)[] = []
		const closeHandlers: ((code: number) => void)[] = []
		const child = {
			on: vi.fn((ev: string, fn: (...args: any[]) => any) => {
				if (ev === "close") closeHandlers.push(fn)
				if (ev === "error") {
					/* capture but don't fire */
				}
			}),
			stdout: {
				on: vi.fn((ev: string, fn: (...args: any[]) => any) => {
					if (ev === "data") stdoutHandlers.push(fn)
				}),
			},
			stderr: {
				on: vi.fn((ev: string, fn: (...args: any[]) => any) => {
					if (ev === "data") stderrHandlers.push(fn)
				}),
			},
			kill: vi.fn(),
		}
		setTimeout(() => {
			stdoutHandlers.forEach((fn) => fn(Buffer.from(output)))
			closeHandlers.forEach((fn) => fn(0))
		}, 10)
		return child
	})
}

function denyServerUrlFile() {
	mockFs.readFileSync.mockImplementation(() => {
		throw Object.assign(new Error("ENOENT"), { code: "ENOENT" })
	})
}

function setServerUrlFile(raw: string) {
	mockFs.existsSync.mockImplementation((p: string) => {
		const s = p.toString()
		return s.endsWith("server_url") || s.includes("cs-cloud")
	})
	mockFs.readFileSync.mockReturnValue(raw)
}

describe("CsCloudService (refactored)", () => {
	beforeEach(resetMocks)
	afterEach(() => {
		mockHttp.get = vi.fn()
	})

	it("uses configured baseUrl directly", async () => {
		setConfigValues({ baseUrl: "http://custom:8080/api/v1", port: 45489 })
		const svc = new CsCloudService(createOutputChannel() as never)
		await expect(svc.ensureStarted()).resolves.toBe("http://custom:8080/api/v1")
		expect(svc.state).toBe("running")
	})

	it("reads server_url file when it exists and health passes", async () => {
		setServerUrlFile("http://127.0.0.1:59249")
		mockHealthOk()
		const svc = new CsCloudService(createOutputChannel() as never)
		await expect(svc.ensureStarted()).resolves.toBe("http://127.0.0.1:59249/api/v1")
		expect(svc.state).toBe("running")
	})

	it("parses local_url from csc cloud status", async () => {
		denyServerUrlFile()
		setExecFileStdout("local_url: http://127.0.0.1:55555\nmode: cloud\n")
		mockHealthOk()
		const svc = new CsCloudService(createOutputChannel() as never)
		await expect(svc.ensureStarted()).resolves.toBe("http://127.0.0.1:55555/api/v1")
		expect(svc.state).toBe("running")
	})

	it("throws install prompt when nothing works", async () => {
		denyServerUrlFile()
		mockHealthDown()
		mockFs.existsSync.mockReturnValue(false)
		mockWhich.mockResolvedValue("/usr/local/bin/csc")
		const svc = new CsCloudService(createOutputChannel() as never)
		await expect(svc.ensureStarted()).rejects.toThrow("Please run manually: csc cloud start")
		expect(svc.state).toBe("error")
	})

	it("restart clears state and re-resolves", async () => {
		setServerUrlFile("http://127.0.0.1:59249")
		mockHealthOk()
		const svc = new CsCloudService(createOutputChannel() as never)
		await svc.ensureStarted()
		expect(svc.state).toBe("running")
		setServerUrlFile("http://127.0.0.1:60000")
		await expect(svc.restart()).resolves.toBe("http://127.0.0.1:60000/api/v1")
	})

	it("deduplicates concurrent ensureStarted calls", async () => {
		setServerUrlFile("http://127.0.0.1:59249")
		mockHealthOk()
		const svc = new CsCloudService(createOutputChannel() as never)
		const [a, b] = await Promise.all([svc.ensureStarted(), svc.ensureStarted()])
		expect(a).toBe(b)
	})

	it("registers exit handler on spawned child process", async () => {
		let spawnExitRegistered = false

		mockCrossSpawn.mockImplementation(() => {
			const child = {
				on: vi.fn((ev: string) => {
					if (ev === "exit") spawnExitRegistered = true
				}),
				stdout: { on: vi.fn() },
				stderr: { on: vi.fn() },
				unref: vi.fn(),
				kill: vi.fn(),
			}
			return child
		})

		let existsCallCount = 0
		mockFs.existsSync.mockImplementation((p: string) => {
			existsCallCount++
			if (p.toString().endsWith("server_url")) {
				return existsCallCount > 1
			}
			return p.toString().includes("cs-cloud")
		})
		mockFs.readFileSync.mockReturnValue("http://127.0.0.1:59249")
		mockHealthOk()
		mockWhich.mockRejectedValue(new Error("not found"))

		const svc = new CsCloudService(createOutputChannel() as never)
		await svc.ensureStarted()
		expect(svc.state).toBe("running")
		expect(svc.ownership).toBe("owned")
		expect(spawnExitRegistered).toBe(true)
	})

	it("emits crashed event for unmanaged process on file deletion", async () => {
		setServerUrlFile("http://127.0.0.1:59249")
		mockHealthOk()

		const svc = new CsCloudService(createOutputChannel() as never)
		await svc.ensureStarted()
		expect(svc.state).toBe("running")
		expect(svc.ownership).toBe("unmanaged")

		const crashedPromise = new Promise<string>((resolve) => {
			svc.on("crashed", ({ reason }: { reason: string }) => resolve(reason))
		})

		const watchCallback = mockFs.watch.mock.calls[0]?.[1]
		expect(watchCallback).toBeDefined()

		mockFs.existsSync.mockImplementation((p: string) => {
			return p.toString().includes("cs-cloud") && !p.toString().endsWith("server_url")
		})
		watchCallback("rename", "server_url")

		const reason = await crashedPromise
		expect(reason).toContain("process has stopped")
		expect(svc.state).toBe("error")
	})

	it("dispose cleans up health check timer", async () => {
		setServerUrlFile("http://127.0.0.1:59249")
		mockHealthOk()

		const svc = new CsCloudService(createOutputChannel() as never)
		await svc.ensureStarted()
		expect(svc.state).toBe("running")

		svc.dispose()
	})
})
