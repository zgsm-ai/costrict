import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import * as fs from "fs/promises"
import * as path from "path"
import * as os from "os"

vi.mock("vscode", async (importOriginal) => {
	const actual = await importOriginal<typeof import("vscode")>()
	return {
		...actual,
		ProgressLocation: { Notification: 3 },
		window: {
			...actual.window,
			createOutputChannel: vi.fn(() => ({ appendLine: vi.fn(), dispose: vi.fn() })),
			createStatusBarItem: vi.fn(() => ({ text: "", show: vi.fn(), hide: vi.fn(), dispose: vi.fn() })),
			showInformationMessage: vi.fn(() => Promise.resolve(undefined)),
			showWarningMessage: vi.fn(() => Promise.resolve(undefined)),
			showErrorMessage: vi.fn(() => Promise.resolve(undefined)),
			withProgress: vi.fn((_options: any, callback: any) => callback({ report: vi.fn() })),
		},
		extensions: {
			getExtension: vi.fn(() => ({ extensionUri: { fsPath: "/mock" } })),
		},
	}
})

vi.mock("../../../utils/logger", () => ({
	createLogger: () => ({
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		channel: { appendLine: vi.fn() },
	}),
}))

// Mock delay to prevent real waits during retry loops in runInstallWithRetries
vi.mock("../utils", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../utils")>()
	return {
		...actual,
		delay: vi.fn().mockResolvedValue(undefined),
	}
})

import { RemoteAgentInstaller } from "../RemoteAgentInstaller"

vi.mock("../../../i18n", () => ({
	t: vi.fn((key: string, options?: any) => {
		if (options) {
			return `${key} ${JSON.stringify(options)}`
		}
		return key
	}),
}))

describe("RemoteAgentInstaller", () => {
	let tmpDir: string

	beforeEach(async () => {
		tmpDir = path.join(os.tmpdir(), `rri-test-${Date.now()}`)
		await fs.mkdir(tmpDir, { recursive: true })
		RemoteAgentInstaller["instance"] = undefined
	})

	afterEach(async () => {
		const installer = RemoteAgentInstaller.getInstance()
		installer.dispose()
		RemoteAgentInstaller["instance"] = undefined
		await fs.rm(tmpDir, { recursive: true, force: true })
	})

	it("should be a singleton", () => {
		const a = RemoteAgentInstaller.getInstance()
		const b = RemoteAgentInstaller.getInstance()
		expect(a).toBe(b)
	})

	it("should return default package name", () => {
		const installer = RemoteAgentInstaller.getInstance()
		expect(installer.getPackageName()).toBe("Remote Resource Package")
	})

	it("should skip manual install when task in progress", async () => {
		const installer = RemoteAgentInstaller.getInstance()
		installer["runningPromise"] = new Promise(() => {})
		const result = await installer.triggerManualInstall()
		expect(result.state).toBe("failed")
		expect(result.reason).toBe("Task in progress")
	})

	it("should skip manual uninstall when task in progress", async () => {
		const installer = RemoteAgentInstaller.getInstance()
		installer["runningPromise"] = new Promise(() => {})
		const result = await installer.triggerManualUninstall()
		expect(result.success).toBe(false)
		expect(result.reason).toBe("Task in progress")
	})

	it("should dispose without error", () => {
		const installer = RemoteAgentInstaller.getInstance()
		expect(() => installer.dispose()).not.toThrow()
	})

	// Bug3 regression: after dispose(), scheduleNextCheck() must not schedule new timers.
	it("should not schedule new timers after dispose", () => {
		vi.useFakeTimers()
		const installer = RemoteAgentInstaller.getInstance()
		installer.dispose()
		// Directly call scheduleNextCheck after dispose — it should be a no-op
		;(installer as any).scheduleNextCheck()
		// No setTimeout should have been registered
		expect((installer as any).checkTimeout).toBeUndefined()
		vi.useRealTimers()
	})

	// Bug3 regression: dispose() must set isDisposed = true as its first action.
	it("should set isDisposed to true on dispose", () => {
		const installer = RemoteAgentInstaller.getInstance()
		expect((installer as any).isDisposed).toBe(false)
		installer.dispose()
		expect((installer as any).isDisposed).toBe(true)
	})

	// scheduleBackgroundCheck() must call performBackgroundCheck()
	it("scheduleBackgroundCheck should call performBackgroundCheck", async () => {
		const installer = RemoteAgentInstaller.getInstance()
		const performSpy = vi.fn().mockResolvedValue(undefined)
		;(installer as any).performBackgroundCheck = performSpy
		;(installer as any).scheduleNextCheck = vi.fn() // prevent real timer scheduling

		installer.scheduleBackgroundCheck()
		// Allow the async run() to execute
		await new Promise((resolve) => setTimeout(resolve, 0))

		expect(performSpy).toHaveBeenCalled()
	})

	// scheduleNextCheck() must call performBackgroundCheck() when timer fires
	it("scheduleNextCheck should call performBackgroundCheck when timer fires", async () => {
		vi.useFakeTimers()
		const installer = RemoteAgentInstaller.getInstance()
		const performSpy = vi.fn().mockResolvedValue(undefined)
		;(installer as any).performBackgroundCheck = performSpy
		// Override scheduleNextCheck to prevent infinite recursion after first call
		let callCount = 0
		const originalScheduleNextCheck = (installer as any).scheduleNextCheck.bind(installer)
		;(installer as any).scheduleNextCheck = () => {
			callCount++
			if (callCount === 1) {
				originalScheduleNextCheck()
			}
			// Stop after first real call to avoid infinite loop
		}
		;(installer as any).scheduleNextCheck()
		// Advance past the default 24h timer (getCheckIntervalMs defaults to 24*60 minutes)
		await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000 + 1000)

		expect(performSpy).toHaveBeenCalled()
		vi.useRealTimers()
	})

	// BUG-4 regression: dispose() must clear the singleton instance so that
	// getInstance() returns a fresh instance after dispose().
	it("should clear singleton instance after dispose", () => {
		const installer = RemoteAgentInstaller.getInstance()
		installer.dispose()
		// After dispose, the static instance should be cleared
		const newInstance = RemoteAgentInstaller.getInstance()
		// The new instance should NOT be the disposed one
		expect(newInstance).not.toBe(installer)
		// The new instance should not be disposed
		expect((newInstance as any).isDisposed).toBe(false)
	})

	// BUG-5 regression: getInstance() must update the context on an existing instance
	// when a new context is provided. This prevents the following scenario:
	//   1. registerCommands.ts calls getInstance() without context (instance created without context)
	//   2. extension.ts calls getInstance(context) — but context is NOT applied to the existing instance
	//   3. ensureInstallerConfigured() skips settingsDir because this.context is undefined
	//   4. AgentInstaller uses ~/.roo/ instead of globalStorageUri — files written to wrong location
	it("should update context on existing instance when getInstance is called with a new context", () => {
		// Create instance without context first
		const installer = RemoteAgentInstaller.getInstance()
		expect((installer as any).context).toBeUndefined()

		// Now call getInstance with a context — it should update the existing instance
		const mockContext = { globalStorageUri: { fsPath: "/mock/storage" } } as any
		const sameInstance = RemoteAgentInstaller.getInstance(mockContext)

		// Should return the same singleton instance
		expect(sameInstance).toBe(installer)
		// Context should now be set on the existing instance
		expect((sameInstance as any).context).toBe(mockContext)
	})
})

describe("RemoteAgentInstaller background notification silence (US-002)", () => {
	let installer: RemoteAgentInstaller
	let recordManagerMock: any
	let versionApiMock: any
	let downloaderMock: any
	let resourceInstallerMock: any
	let vscodeWindow: typeof import("vscode").window

	beforeEach(async () => {
		RemoteAgentInstaller["instance"] = undefined
		installer = RemoteAgentInstaller.getInstance()
		vscodeWindow = await import("vscode").then((m) => m.window)

		recordManagerMock = {
			read: vi.fn().mockResolvedValue({
				schemaVersion: 1,
				installedVersion: "1.0.0",
				lastCheckedAt: 0,
				installState: "none",
				manifest: { agents: [], commands: [], skills: [], rules: [], mcp: [] },
			}),
			write: vi.fn().mockResolvedValue(undefined),
			shouldCheck: vi.fn().mockReturnValue(true),
		}
		versionApiMock = {
			getLatestVersion: vi.fn().mockResolvedValue(null),
		}
		downloaderMock = {
			download: vi.fn().mockResolvedValue("/mock/path.zip"),
			cleanupResidualFiles: vi.fn().mockResolvedValue(undefined),
			getTmpDir: vi.fn().mockReturnValue("/mock/tmp"),
		}
		resourceInstallerMock = {
			install: vi.fn().mockResolvedValue({
				agents: [],
				commands: [],
				skills: [],
				rules: [],
				mcp: [],
			}),
			uninstall: vi.fn().mockResolvedValue(undefined),
			cleanup: vi.fn().mockResolvedValue(undefined),
			getTmpDir: vi.fn().mockReturnValue("/mock/tmp"),
		}
		;(installer as any)["recordManager"] = recordManagerMock
		;(installer as any)["versionApi"] = versionApiMock
		;(installer as any)["downloader"] = downloaderMock
		;(installer as any)["installer"] = resourceInstallerMock
		;(installer as any)["isLockHeld"] = vi.fn().mockResolvedValue(false)
		;(installer as any)["acquireLock"] = vi.fn().mockResolvedValue(undefined)
		;(installer as any)["releaseLock"] = vi.fn().mockResolvedValue(undefined)
		;(installer as any)["fileExists"] = vi.fn().mockResolvedValue(true)
	})

	afterEach(() => {
		installer.dispose()
		RemoteAgentInstaller["instance"] = undefined
		vi.clearAllMocks()
	})

	// T014 [P] [US2]: 后台 noUpdate 路径不调用 showInformationMessage / showWarningMessage
	it("background noUpdate should not show any notification", async () => {
		// Server returns null → noUpdate path in doInstall
		versionApiMock.getLatestVersion.mockResolvedValue(null)

		await (installer as any).doInstall(false)

		vi.mocked(vscodeWindow.showWarningMessage).mockClear()
		expect(vscodeWindow.showInformationMessage).not.toHaveBeenCalled()
		expect(vscodeWindow.showWarningMessage).not.toHaveBeenCalled()
	})

	// T015 [P] [US2]: 后台 installed 路径调用 showInformationMessage
	it("background installed should show information message", async () => {
		versionApiMock.getLatestVersion.mockResolvedValue({
			version: "2.0.0",
			downloadUrl: "https://example.com/pkg.zip",
			name: "Test Package",
		})
		recordManagerMock.read.mockResolvedValue({
			schemaVersion: 1,
			installedVersion: "1.0.0",
			lastCheckedAt: 0,
			installState: "none",
			manifest: { agents: [], commands: [], skills: [], rules: [], mcp: [] },
		})

		// Use performBackgroundCheck() instead of doInstall() because
		// notifyResult() (which shows the information message) is called
		// by performBackgroundCheck, not by doInstall itself.
		await (installer as any).performBackgroundCheck()

		expect(vscodeWindow.showInformationMessage).toHaveBeenCalled()
	})

	// T016 [P] [US2]: 后台 failed 路径调用 showWarningMessage
	it("background failed should show warning message", async () => {
		versionApiMock.getLatestVersion.mockResolvedValue({
			version: "2.0.0",
			downloadUrl: "https://example.com/pkg.zip",
		})
		recordManagerMock.read.mockResolvedValue({
			schemaVersion: 1,
			installedVersion: "1.0.0",
			lastCheckedAt: 0,
			installState: "none",
			manifest: { agents: [], commands: [], skills: [], rules: [], mcp: [] },
		})
		downloaderMock.download.mockRejectedValue(new Error("Network timeout"))

		await (installer as any).doInstall(false)

		expect(vscodeWindow.showWarningMessage).toHaveBeenCalled()
	})
})

describe("RemoteAgentInstaller.triggerManualUninstall — hot-reload after uninstall", () => {
	let installer: RemoteAgentInstaller
	let recordManagerMock: any
	let resourceInstallerMock: any

	beforeEach(async () => {
		RemoteAgentInstaller["instance"] = undefined
		installer = RemoteAgentInstaller.getInstance()

		recordManagerMock = {
			read: vi.fn().mockResolvedValue({
				schemaVersion: 1,
				installedVersion: "1.0.0",
				lastCheckedAt: 0,
				installState: "installed",
				manifest: { agents: ["test-agent"], commands: [], skills: [], rules: [], mcp: [] },
			}),
			write: vi.fn().mockResolvedValue(undefined),
		}
		resourceInstallerMock = {
			uninstall: vi.fn().mockResolvedValue(undefined),
			getTmpDir: vi.fn().mockReturnValue("/mock/tmp"),
		}
		;(installer as any)["recordManager"] = recordManagerMock
		;(installer as any)["installer"] = resourceInstallerMock
		;(installer as any)["ensureInstallerConfigured"] = vi.fn().mockResolvedValue(undefined)
	})

	afterEach(() => {
		installer.dispose()
		RemoteAgentInstaller["instance"] = undefined
		vi.clearAllMocks()
	})

	// BUG regression: triggerManualUninstall() must call hotReloadAfterInstall() on success
	// so that the webview mode dropdown immediately reflects the removed agents.
	// Previously, hot-reload was only called after install, not after uninstall.
	it("should call hotReloadAfterInstall after successful uninstall", async () => {
		const hotReloadSpy = vi.fn().mockResolvedValue(undefined)
		;(installer as any).hotReloadAfterInstall = hotReloadSpy

		const result = await installer.triggerManualUninstall()

		expect(result.success).toBe(true)
		// hotReloadAfterInstall must be called so the webview dropdown updates immediately
		expect(hotReloadSpy).toHaveBeenCalled()
	})

	// Verify that hot-reload is NOT called when uninstall fails
	it("should NOT call hotReloadAfterInstall when uninstall fails", async () => {
		const hotReloadSpy = vi.fn().mockResolvedValue(undefined)
		;(installer as any).hotReloadAfterInstall = hotReloadSpy
		resourceInstallerMock.uninstall.mockRejectedValue(new Error("Uninstall failed"))

		const result = await installer.triggerManualUninstall()

		expect(result.success).toBe(false)
		expect(hotReloadSpy).not.toHaveBeenCalled()
	})
})
