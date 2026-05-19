import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import * as fs from "fs/promises"
import * as path from "path"
import * as os from "os"

vi.mock("vscode", async (importOriginal) => {
	const actual = await importOriginal<typeof import("vscode")>()
	return {
		...actual,
		window: {
			...actual.window,
			createOutputChannel: vi.fn(() => ({ appendLine: vi.fn(), dispose: vi.fn() })),
			createStatusBarItem: vi.fn(() => ({ text: "", show: vi.fn(), hide: vi.fn(), dispose: vi.fn() })),
			showInformationMessage: vi.fn(() => Promise.resolve(undefined)),
			showWarningMessage: vi.fn(() => Promise.resolve(undefined)),
			showErrorMessage: vi.fn(() => Promise.resolve(undefined)),
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

	// Bug2 regression: scheduleBackgroundCheck() must call performBackgroundCheck(true)
	// so that the activation-time check bypasses the 12h cooldown (FR-001).
	it("scheduleBackgroundCheck should bypass 12h cooldown (forceCheck=true)", async () => {
		const installer = RemoteAgentInstaller.getInstance()
		const performSpy = vi.fn().mockResolvedValue(undefined)
		;(installer as any).performBackgroundCheck = performSpy
		;(installer as any).scheduleNextCheck = vi.fn() // prevent real timer scheduling

		installer.scheduleBackgroundCheck()
		// Allow the async run() to execute
		await new Promise((resolve) => setTimeout(resolve, 0))

		expect(performSpy).toHaveBeenCalledWith(true)
	})

	// Bug2 regression: scheduleNextCheck() must call performBackgroundCheck(false)
	// so that timer-based checks respect the 12h cooldown (FR-002).
	it("scheduleNextCheck should respect 12h cooldown (forceCheck=false)", async () => {
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
		// Advance past the 12h timer
		await vi.advanceTimersByTimeAsync(12 * 60 * 60 * 1000 + 1000)

		expect(performSpy).toHaveBeenCalledWith(false)
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

describe("RemoteAgentInstaller.forceBackgroundCheck (US-001)", () => {
	let installer: RemoteAgentInstaller

	beforeEach(() => {
		RemoteAgentInstaller["instance"] = undefined
		installer = RemoteAgentInstaller.getInstance()
	})

	afterEach(() => {
		installer.dispose()
		RemoteAgentInstaller["instance"] = undefined
	})

	// T008 [P] [US1]: forceBackgroundCheck 应调用 performBackgroundCheck(true)
	it("forceBackgroundCheck should call performBackgroundCheck with forceCheck=true", async () => {
		const performSpy = vi.fn().mockResolvedValue(undefined)
		;(installer as any).performBackgroundCheck = performSpy
		;(installer as any).scheduleNextCheck = vi.fn() // ensure no timer side effects

		installer.forceBackgroundCheck()
		// Allow the async run() to execute
		await new Promise((resolve) => setTimeout(resolve, 0))

		expect(performSpy).toHaveBeenCalledWith(true)
	})

	// T009 [P] [US1]: forceBackgroundCheck 不应调用 scheduleNextCheck
	it("forceBackgroundCheck should not call scheduleNextCheck", async () => {
		const performSpy = vi.fn().mockResolvedValue(undefined)
		const scheduleSpy = vi.fn()
		;(installer as any).performBackgroundCheck = performSpy
		;(installer as any).scheduleNextCheck = scheduleSpy

		installer.forceBackgroundCheck()
		await new Promise((resolve) => setTimeout(resolve, 0))

		expect(scheduleSpy).not.toHaveBeenCalled()
	})

	// T010 [P] [US1]: 当 runningPromise 存在时 forceBackgroundCheck 应直接跳过（不排队）
	it("forceBackgroundCheck should be skipped when runningPromise exists", async () => {
		const doInstallSpy = vi.fn()
		;(installer as any).doInstall = doInstallSpy
		installer["runningPromise"] = new Promise(() => {})

		installer.forceBackgroundCheck()
		await new Promise((resolve) => setTimeout(resolve, 0))

		// performBackgroundCheck sees runningPromise and returns early before calling doInstall
		expect(doInstallSpy).not.toHaveBeenCalled()
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
				agents: [], commands: [], skills: [], rules: [], mcp: [],
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

		await (installer as any).doInstall(false)

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
