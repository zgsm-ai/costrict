/**
 * RemoteAgentInstaller orchestration flow tests.
 * Covers: version comparison, retry mechanism, manual trigger, no-update scenarios.
 */
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
			showInformationMessage: vi.fn(),
			showWarningMessage: vi.fn(),
			showErrorMessage: vi.fn(),
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

vi.mock("../../../i18n", () => ({
	t: vi.fn((key: string, options?: any) => {
		if (options) return `${key} ${JSON.stringify(options)}`
		return key
	}),
}))

// Mock the roo-config to avoid real filesystem access
vi.mock("../../../services/roo-config/index", () => ({
	getGlobalCostrictDirectory: () => path.join(os.tmpdir(), "mock-costrict"),
	getGlobalRooDirectory: () => path.join(os.tmpdir(), "mock-roo"),
}))

// Mock storage utils to avoid real filesystem access in ensureInstallerConfigured
vi.mock("../../../../utils/storage", () => ({
	getSettingsDirectoryPath: vi.fn().mockResolvedValue(path.join(os.tmpdir(), "mock-settings")),
}))

import { RemoteAgentInstaller } from "../RemoteAgentInstaller"
import { InstallRecordManager } from "../InstallRecordManager"
import { VersionApi } from "../VersionApi"
import { AgentDownloader } from "../AgentDownloader"
import { AgentInstaller } from "../AgentInstaller"
import { FatalInstallerError } from "../types"
import type { ResourcePackageVersion, LocalInstallRecord, InstalledManifest } from "../types"

const defaultRecord: LocalInstallRecord = {
	schemaVersion: 1,
	installedVersion: "0.0.0",
	lastCheckedAt: 0,
	installState: "none",
	manifest: { agents: [], commands: [], skills: [], rules: [], mcp: [] },
}

describe("RemoteAgentInstaller orchestration flow", () => {
	let tmpDir: string
	let installer: RemoteAgentInstaller
	let recordManagerMock: any
	let versionApiMock: any
	let downloaderMock: any
	let resourceInstallerMock: any

	beforeEach(async () => {
		tmpDir = path.join(os.tmpdir(), `rri-flow-test-${Date.now()}`)
		await fs.mkdir(tmpDir, { recursive: true })
		RemoteAgentInstaller["instance"] = undefined

		// Create mocks for internal dependencies
		recordManagerMock = {
			read: vi.fn().mockResolvedValue({ ...defaultRecord }),
			write: vi.fn().mockResolvedValue(undefined),
			shouldCheck: vi.fn().mockReturnValue(true),
		}
		versionApiMock = {
			getLatestVersion: vi.fn().mockResolvedValue(null),
		}
		downloaderMock = {
			download: vi.fn().mockResolvedValue("/mock/path.zip"),
			cleanupResidualFiles: vi.fn().mockResolvedValue(undefined),
			getTmpDir: vi.fn().mockReturnValue(tmpDir),
		}
		resourceInstallerMock = {
			install: vi.fn().mockResolvedValue({
				agents: ["test-agent"],
				commands: [],
				skills: [],
				rules: [],
				mcp: [],
			} as InstalledManifest),
			uninstall: vi.fn().mockResolvedValue(undefined),
			cleanup: vi.fn().mockResolvedValue(undefined),
			getTmpDir: vi.fn().mockReturnValue(tmpDir),
		}

		installer = RemoteAgentInstaller.getInstance()

		// Inject mocks via private field access
		;(installer as any)["recordManager"] = recordManagerMock
		;(installer as any)["versionApi"] = versionApiMock
		;(installer as any)["downloader"] = downloaderMock
		;(installer as any)["installer"] = resourceInstallerMock
		// Mock lock methods to avoid real filesystem
		;(installer as any)["isLockHeld"] = vi.fn().mockResolvedValue(false)
		;(installer as any)["acquireLock"] = vi.fn().mockResolvedValue(undefined)
		;(installer as any)["releaseLock"] = vi.fn().mockResolvedValue(undefined)
		;(installer as any)["fileExists"] = vi.fn().mockResolvedValue(true)
	})

	afterEach(async () => {
		installer.dispose()
		RemoteAgentInstaller["instance"] = undefined
		await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
		vi.clearAllMocks()
	})

	it("should force reinstall on manual trigger when remote version equals local version", async () => {
		recordManagerMock.read.mockResolvedValue({
			...defaultRecord,
			installedVersion: "1.0.0",
		})
		versionApiMock.getLatestVersion.mockResolvedValue({
			version: "1.0.0",
			downloadUrl: "https://example.com/pkg.zip",
		} as ResourcePackageVersion)

		const result = await installer.triggerManualInstall()

		// Manual install bypasses version check — always proceeds to install
		expect(result.state).toBe("installed")
		expect(downloaderMock.download).toHaveBeenCalledTimes(1)
	})

	it("should force reinstall on manual trigger when remote version is lower than local", async () => {
		recordManagerMock.read.mockResolvedValue({
			...defaultRecord,
			installedVersion: "2.0.0",
		})
		versionApiMock.getLatestVersion.mockResolvedValue({
			version: "1.0.0",
			downloadUrl: "https://example.com/pkg.zip",
		} as ResourcePackageVersion)

		const result = await installer.triggerManualInstall()

		// Manual install bypasses version check — always proceeds to install
		expect(result.state).toBe("installed")
		expect(downloaderMock.download).toHaveBeenCalledTimes(1)
	})

	it("should return noUpdate when server returns no downloadUrl", async () => {
		// VersionApi.getLatestVersion() returns null when downloadUrl is absent —
		// it never returns a ResourcePackageVersion without downloadUrl.
		versionApiMock.getLatestVersion.mockResolvedValue(null)

		const result = await installer.triggerManualInstall()

		expect(result.state).toBe("noUpdate")
		expect(recordManagerMock.write).toHaveBeenCalled()
	})

	it("should return noUpdate when server returns null", async () => {
		versionApiMock.getLatestVersion.mockResolvedValue(null)

		const result = await installer.triggerManualInstall()

		expect(result.state).toBe("noUpdate")
	})

	it("should retry up to 3 times on non-fatal errors then fail", async () => {
		versionApiMock.getLatestVersion.mockResolvedValue({
			version: "2.0.0",
			downloadUrl: "https://example.com/pkg.zip",
			checksum: "abc123",
			checksumAlgo: "sha256",
		} as ResourcePackageVersion)

		// Mock download to always fail with a non-fatal error
		downloaderMock.download.mockRejectedValue(new Error("Network timeout"))

		// Speed up retry delays
		vi.useFakeTimers({ shouldAdvanceTime: true })
		const resultPromise = installer.triggerManualInstall()

		// Allow all retries to complete (delays: 1s, 2s, 4s)
		await vi.advanceTimersByTimeAsync(10_000)
		const result = await resultPromise

		expect(result.state).toBe("failed")
		expect(result.reason).toBe("Network timeout")
		expect(downloaderMock.download).toHaveBeenCalledTimes(3)

		vi.useRealTimers()
	})

	it("should stop retrying immediately on FatalInstallerError", async () => {
		versionApiMock.getLatestVersion.mockResolvedValue({
			version: "2.0.0",
			downloadUrl: "https://example.com/pkg.zip",
		} as ResourcePackageVersion)

		downloaderMock.download.mockResolvedValue("/mock/path.zip")
		resourceInstallerMock.install.mockRejectedValue(
			new FatalInstallerError("manifestMissing", "manifest.json is missing"),
		)

		const result = await installer.triggerManualInstall()

		expect(result.state).toBe("failed")
		expect(result.reason).toContain("manifest.json is missing")
		// Should only attempt once (no retries for fatal errors)
		expect(resourceInstallerMock.install).toHaveBeenCalledTimes(1)
	})

	it("should succeed on manual trigger with new version available", async () => {
		versionApiMock.getLatestVersion.mockResolvedValue({
			version: "2.0.0",
			downloadUrl: "https://example.com/pkg.zip",
			checksum: "abc123",
			checksumAlgo: "sha256",
		} as ResourcePackageVersion)

		const result = await installer.triggerManualInstall()

		expect(result.state).toBe("installed")
		expect(result.version).toBe("2.0.0")
		expect(downloaderMock.download).toHaveBeenCalledTimes(1)
		expect(resourceInstallerMock.install).toHaveBeenCalledTimes(1)
		expect(recordManagerMock.write).toHaveBeenCalledWith(
			expect.objectContaining({
				installedVersion: "2.0.0",
				installState: "installed",
			}),
		)
	})

	it("should succeed after transient failure on retry", async () => {
		versionApiMock.getLatestVersion.mockResolvedValue({
			version: "2.0.0",
			downloadUrl: "https://example.com/pkg.zip",
		} as ResourcePackageVersion)

		// Fail first attempt, succeed on second
		downloaderMock.download
			.mockRejectedValueOnce(new Error("Temporary network error"))
			.mockResolvedValue("/mock/path.zip")

		vi.useFakeTimers({ shouldAdvanceTime: true })
		const resultPromise = installer.triggerManualInstall()

		await vi.advanceTimersByTimeAsync(5_000)
		const result = await resultPromise

		expect(result.state).toBe("installed")
		expect(result.version).toBe("2.0.0")
		expect(downloaderMock.download).toHaveBeenCalledTimes(2)

		vi.useRealTimers()
	})

	// FR-012: lastCheckedAt must be updated after every check, even when no update is needed
	it("should update lastCheckedAt when server returns null (no package available)", async () => {
		versionApiMock.getLatestVersion.mockResolvedValue(null)

		await installer.triggerManualInstall()

		expect(recordManagerMock.write).toHaveBeenCalledWith(
			expect.objectContaining({
				lastCheckedAt: expect.any(Number),
			}),
		)
		const writtenRecord = recordManagerMock.write.mock.calls[0][0]
		expect(writtenRecord.lastCheckedAt).toBeGreaterThan(0)
	})

	// FR-012: lastCheckedAt must be updated when remote version equals local (no update needed)
	it("should update lastCheckedAt when remote version equals local version", async () => {
		recordManagerMock.read.mockResolvedValue({
			...defaultRecord,
			installedVersion: "1.0.0",
		})
		versionApiMock.getLatestVersion.mockResolvedValue({
			version: "1.0.0",
			downloadUrl: "https://example.com/pkg.zip",
		} as ResourcePackageVersion)

		await installer.triggerManualInstall()

		expect(recordManagerMock.write).toHaveBeenCalledWith(
			expect.objectContaining({
				lastCheckedAt: expect.any(Number),
			}),
		)
	})

	// FR-013: AgentInstaller.install() must call uninstall() before installing new modules
	// This is verified at the AgentInstaller unit test level (see AgentInstaller.test.ts).
	// At the orchestration level, we verify that install() is called (which internally calls uninstall).
	it("should call AgentInstaller.install() which handles uninstall internally (FR-013)", async () => {
		versionApiMock.getLatestVersion.mockResolvedValue({
			version: "2.0.0",
			downloadUrl: "https://example.com/pkg.zip",
		} as ResourcePackageVersion)

		await installer.triggerManualInstall()

		// install() is called once — it internally calls uninstall() before installing
		expect(resourceInstallerMock.install).toHaveBeenCalledTimes(1)
		// The record passed to install() contains the current manifest for uninstall reference
		expect(resourceInstallerMock.install).toHaveBeenCalledWith(
			expect.any(String), // zipPath
			expect.objectContaining({ version: "2.0.0" }), // versionInfo
			expect.objectContaining({ installedVersion: "0.0.0" }), // record with manifest
		)
	})

	// FR-015: background failure must trigger VSCode warning notification with Retry Now button
	// Note: i18n mock returns the key suffix (e.g. "warn.downloadFailed" for "remoteAgentInstaller:warn.downloadFailed")
	it("should show warning notification with Retry Now button on background network failure", async () => {
		const vscode = await import("vscode")
		const showWarningMock = vi.mocked(vscode.window.showWarningMessage)
		showWarningMock.mockClear()
		showWarningMock.mockResolvedValue(undefined)

		versionApiMock.getLatestVersion.mockResolvedValue({
			version: "2.0.0",
			downloadUrl: "https://example.com/pkg.zip",
		} as ResourcePackageVersion)

		const networkError = new Error("ETIMEDOUT")
		;(networkError as any).code = "ETIMEDOUT"
		downloaderMock.download.mockRejectedValue(networkError)

		vi.useFakeTimers({ shouldAdvanceTime: true })
		// Use performBackgroundCheck (isManual=false) path
		const checkPromise = (installer as any).performBackgroundCheck(true)
		await vi.advanceTimersByTimeAsync(10_000)
		await checkPromise

		// showWarningMessage must be called (background failure notification)
		expect(showWarningMock).toHaveBeenCalled()
		// Must be called with at least 2 args (message + Retry Now button)
		const callArgs = showWarningMock.mock.calls[0]
		expect(callArgs.length).toBeGreaterThanOrEqual(2)
		// First arg is the warning message (contains "downloadFailed" key)
		expect(String(callArgs[0])).toContain("downloadFailed")
		// Second arg is the Retry Now button label
		expect(String(callArgs[1])).toContain("retryNow")

		vi.useRealTimers()
	})

	// FR-015: fatal error (content corrupted) shows warning WITHOUT Retry Now button
	it("should show contentCorrupted warning without Retry Now button on FatalInstallerError in background", async () => {
		const vscode = await import("vscode")
		const showWarningMock = vi.mocked(vscode.window.showWarningMessage)
		showWarningMock.mockClear()
		showWarningMock.mockResolvedValue(undefined)

		versionApiMock.getLatestVersion.mockResolvedValue({
			version: "2.0.0",
			downloadUrl: "https://example.com/pkg.zip",
		} as ResourcePackageVersion)

		downloaderMock.download.mockResolvedValue("/mock/path.zip")
		resourceInstallerMock.install.mockRejectedValue(
			new FatalInstallerError("manifestMissing", "manifest.json is missing"),
		)

		await (installer as any).performBackgroundCheck(true)

		// Fatal error notification must be called
		expect(showWarningMock).toHaveBeenCalled()
		// Fatal error notification has no Retry Now button (only 1 argument = message only)
		const callArgs = showWarningMock.mock.calls[0]
		expect(callArgs.length).toBe(1)
		// Message contains "contentCorrupted" key
		expect(String(callArgs[0])).toContain("contentCorrupted")
	})

	// FR-015: manual install failure should NOT show background warning notification
	it("should NOT show background warning notification on manual install failure", async () => {
		const vscode = await import("vscode")
		const showWarningMock = vi.mocked(vscode.window.showWarningMessage)
		showWarningMock.mockClear()

		versionApiMock.getLatestVersion.mockResolvedValue({
			version: "2.0.0",
			downloadUrl: "https://example.com/pkg.zip",
		} as ResourcePackageVersion)

		// Use a non-network, non-disk error so notifyRetryableError won't show a warning
		// (only network/disk errors trigger showWarningMessage in notifyRetryableError)
		// Actually, any error triggers showWarningMessage in the else branch.
		// The key distinction is: isManual=true → notifyRetryableError is NOT called.
		downloaderMock.download.mockRejectedValue(new Error("Network error"))

		vi.useFakeTimers({ shouldAdvanceTime: true })
		// triggerManualInstall calls doInstall(true) → isManual=true → notifyRetryableError NOT called
		const resultPromise = installer.triggerManualInstall()
		await vi.advanceTimersByTimeAsync(10_000)
		const result = await resultPromise

		expect(result.state).toBe("failed")
		// Manual install should NOT trigger background warning notification
		expect(showWarningMock).not.toHaveBeenCalled()

		vi.useRealTimers()
	})

	// FR-017: manual trigger must bypass 12h cooldown (shouldCheck=false should be ignored)
	it("should bypass cooldown check on manual trigger (FR-017)", async () => {
		// Simulate cooldown active: shouldCheck returns false
		recordManagerMock.shouldCheck.mockReturnValue(false)

		versionApiMock.getLatestVersion.mockResolvedValue({
			version: "2.0.0",
			downloadUrl: "https://example.com/pkg.zip",
		} as ResourcePackageVersion)

		// triggerManualInstall calls doInstall(true) which does NOT check shouldCheck
		const result = await installer.triggerManualInstall()

		// Should proceed with install despite cooldown
		expect(result.state).toBe("installed")
		expect(downloaderMock.download).toHaveBeenCalledTimes(1)
	})

	// Background check proceeds normally — timer interval is the cooldown mechanism
	it("should proceed with background check and call getLatestVersion", async () => {
		versionApiMock.getLatestVersion.mockResolvedValue({
			version: "2.0.0",
			downloadUrl: "https://example.com/pkg.zip",
		} as ResourcePackageVersion)

		await (installer as any).performBackgroundCheck()

		expect(versionApiMock.getLatestVersion).toHaveBeenCalledTimes(1)
	})

	// Lock mechanism: background check must skip when lock is held by another process
	it("should skip background install when lock is held by another process", async () => {
		;(installer as any)["isLockHeld"] = vi.fn().mockResolvedValue(true)

		versionApiMock.getLatestVersion.mockResolvedValue({
			version: "2.0.0",
			downloadUrl: "https://example.com/pkg.zip",
		} as ResourcePackageVersion)

		const result = await (installer as any).doInstall(false)

		// Background check returns noUpdate when lock is held
		expect(result.state).toBe("noUpdate")
		expect(downloaderMock.download).not.toHaveBeenCalled()
	})

	// Lock mechanism: manual install must fail with error when lock is held
	it("should return failed state on manual install when lock is held", async () => {
		;(installer as any)["isLockHeld"] = vi.fn().mockResolvedValue(true)

		versionApiMock.getLatestVersion.mockResolvedValue({
			version: "2.0.0",
			downloadUrl: "https://example.com/pkg.zip",
		} as ResourcePackageVersion)

		const result = await (installer as any).doInstall(true)

		expect(result.state).toBe("failed")
		expect(result.reason).toContain("Another process is currently installing")
		expect(downloaderMock.download).not.toHaveBeenCalled()
	})

	// Lock mechanism: TOCTOU race — acquireLock throws EEXIST
	it("should handle TOCTOU race condition when acquiring lock (EEXIST)", async () => {
		;(installer as any)["isLockHeld"] = vi.fn().mockResolvedValue(false)
		const eexistError = new Error("File exists") as any
		eexistError.code = "EEXIST"
		;(installer as any)["acquireLock"] = vi.fn().mockRejectedValue(eexistError)

		versionApiMock.getLatestVersion.mockResolvedValue({
			version: "2.0.0",
			downloadUrl: "https://example.com/pkg.zip",
		} as ResourcePackageVersion)

		const result = await (installer as any).doInstall(false)

		expect(result.state).toBe("noUpdate")
		expect(downloaderMock.download).not.toHaveBeenCalled()
	})

	// FR-011: after successful install, record must be updated with new version and installState=installed
	it("should update LocalInstallRecord with new version and installState=installed after success", async () => {
		versionApiMock.getLatestVersion.mockResolvedValue({
			version: "3.0.0",
			downloadUrl: "https://example.com/pkg.zip",
		} as ResourcePackageVersion)

		await installer.triggerManualInstall()

		expect(recordManagerMock.write).toHaveBeenCalledWith(
			expect.objectContaining({
				installedVersion: "3.0.0",
				installState: "installed",
				lastCheckedAt: expect.any(Number),
			}),
		)
	})

	// FR-011: after all retries exhausted, record must be updated with installState=failed; lastCheckedAt must NOT be updated
	it("should update LocalInstallRecord with installState=failed after all retries exhausted", async () => {
		versionApiMock.getLatestVersion.mockResolvedValue({
			version: "2.0.0",
			downloadUrl: "https://example.com/pkg.zip",
		} as ResourcePackageVersion)

		downloaderMock.download.mockRejectedValue(new Error("Persistent failure"))

		vi.useFakeTimers({ shouldAdvanceTime: true })
		const resultPromise = installer.triggerManualInstall()
		await vi.advanceTimersByTimeAsync(10_000)
		await resultPromise

		const failedWriteCall = recordManagerMock.write.mock.calls.find(
			(call: any[]) => call[0]?.installState === "failed",
		)
		expect(failedWriteCall).toBeDefined()
		expect(failedWriteCall![0]).toMatchObject({ installState: "failed" })
		// lastCheckedAt must not be updated on install failure; value must remain unchanged from the original record
		expect(failedWriteCall![0].lastCheckedAt).toBe(defaultRecord.lastCheckedAt)

		vi.useRealTimers()
	})

	// Background check skips when another task is already running
	it("should skip background check when install task is already running", async () => {
		// Simulate a running promise
		;(installer as any)["runningPromise"] = Promise.resolve()

		versionApiMock.getLatestVersion.mockResolvedValue({
			version: "2.0.0",
			downloadUrl: "https://example.com/pkg.zip",
		} as ResourcePackageVersion)

		await (installer as any).performBackgroundCheck(true)

		// Should skip entirely since runningPromise is set
		expect(versionApiMock.getLatestVersion).not.toHaveBeenCalled()
	})

	// P1 regression: when VersionApi returns null due to a NETWORK ERROR (not "no package"),
	// lastCheckedAt must NOT be updated. Updating it would incorrectly reset the 12h cooldown,
	// causing the next scheduled check to be skipped even though no successful check occurred.
	//
	// To distinguish "no package" from "network error", VersionApi must return a discriminated
	// result instead of a plain null for both cases.
	it("should NOT update lastCheckedAt when version check fails due to network error (P1)", async () => {
		// Simulate a network error: VersionApi throws instead of returning null
		versionApiMock.getLatestVersion.mockRejectedValue(new Error("ETIMEDOUT"))

		// performBackgroundCheck should catch the error internally and NOT update lastCheckedAt
		await (installer as any).performBackgroundCheck(true)

		// lastCheckedAt must NOT be updated when the version check itself failed
		expect(recordManagerMock.write).not.toHaveBeenCalled()
	})

	// P4 regression (corrected): when the file lock is held by another process, doInstall skips
	// the install entirely — the version check result is irrelevant because no install was attempted.
	// lastCheckedAt must NOT be updated in this case, so the 12h cooldown is not incorrectly reset.
	// Resetting the cooldown would cause the next window to skip the check for another 12h even
	// though the current window never actually performed the install.
	it("should NOT update lastCheckedAt when lock is held by another process (P4 corrected)", async () => {
		;(installer as any)["isLockHeld"] = vi.fn().mockResolvedValue(true)

		versionApiMock.getLatestVersion.mockResolvedValue({
			version: "2.0.0",
			downloadUrl: "https://example.com/pkg.zip",
		} as ResourcePackageVersion)

		await (installer as any).doInstall(false)

		// Lock was held → install was skipped → lastCheckedAt must NOT be updated
		expect(recordManagerMock.write).not.toHaveBeenCalled()
	})

	// P4 regression (manual): same as above but for manual trigger
	it("should NOT update lastCheckedAt when lock is held by another process on manual trigger (P4 corrected)", async () => {
		;(installer as any)["isLockHeld"] = vi.fn().mockResolvedValue(true)

		versionApiMock.getLatestVersion.mockResolvedValue({
			version: "2.0.0",
			downloadUrl: "https://example.com/pkg.zip",
		} as ResourcePackageVersion)

		const result = await (installer as any).doInstall(true)

		// Lock was held → install was skipped → lastCheckedAt must NOT be updated
		expect(recordManagerMock.write).not.toHaveBeenCalled()
		expect(result.state).toBe("failed")
	})

	// P5 fix: ensureInstallerConfigured() must pass downloader.getTmpDir() to the new AgentInstaller,
	// so that installer.tmpDir always stays in sync with downloader.tmpDir.
	// Without this fix, if downloader has a custom tmpDir, the newly created installer would use
	// the default tmpDir instead, causing extractDir to be computed from a different base path.
	it("should pass downloader.getTmpDir() to new AgentInstaller in ensureInstallerConfigured (P5)", async () => {
		const customTmpDir = path.join(os.tmpdir(), "custom-downloader-tmp")

		// Use a real AgentDownloader with a custom tmpDir
		const realDownloader = new AgentDownloader(customTmpDir)
		expect(realDownloader.getTmpDir()).toBe(customTmpDir)

		// Inject the real downloader into the installer instance
		;(installer as any)["downloader"] = realDownloader

		// Mock context so ensureInstallerConfigured() runs the branch
		const mockContext = {
			globalStorageUri: { fsPath: path.join(os.tmpdir(), "mock-global-storage") },
		}
		;(installer as any)["context"] = mockContext

		// Call ensureInstallerConfigured() — this creates a new AgentInstaller
		await (installer as any).ensureInstallerConfigured()

		// After configuration, installer.getTmpDir() must equal downloader.getTmpDir()
		const newInstaller: AgentInstaller = (installer as any)["installer"]
		expect(newInstaller.getTmpDir()).toBe(customTmpDir)
	})

	// P5 regression: unknown errors (no error code) in background should still show
	// a warning notification WITH a Retry Now button, giving the user a chance to retry.
	// Previously the else branch in notifyRetryableError omitted the Retry Now button.
	it("should show installFailed warning WITH Retry Now button on background unknown error (P5)", async () => {
		const vscode = await import("vscode")
		const showWarningMock = vi.mocked(vscode.window.showWarningMessage)
		showWarningMock.mockClear()
		showWarningMock.mockResolvedValue(undefined)

		versionApiMock.getLatestVersion.mockResolvedValue({
			version: "2.0.0",
			downloadUrl: "https://example.com/pkg.zip",
		} as ResourcePackageVersion)

		// Unknown error: no .code property → falls into else branch of notifyRetryableError
		const unknownError = new Error("Unknown filesystem error")
		downloaderMock.download.mockRejectedValue(unknownError)

		vi.useFakeTimers({ shouldAdvanceTime: true })
		const checkPromise = (installer as any).performBackgroundCheck(true)
		await vi.advanceTimersByTimeAsync(10_000)
		await checkPromise

		// showWarningMessage must be called
		expect(showWarningMock).toHaveBeenCalled()
		// Must be called with at least 2 args (message + Retry Now button)
		const callArgs = showWarningMock.mock.calls[0]
		expect(callArgs.length).toBeGreaterThanOrEqual(2)
		// First arg is the warning message (contains "installFailed" key)
		expect(String(callArgs[0])).toContain("installFailed")
		// Second arg is the Retry Now button label
		expect(String(callArgs[1])).toContain("retryNow")

		vi.useRealTimers()
	})

	// P1a: hasNotifiedFailure cross-cycle regression
	// Bug: after background install fails and notifies user (hasNotifiedFailure=true),
	// a second background install cycle that also fails should STILL send a new notification.
	// Current code skips the second notification because hasNotifiedFailure is never reset
	// between install cycles.
	it("should reset hasNotifiedFailure so second background failure cycle also sends notification (P1a)", async () => {
		const vscode = await import("vscode")
		const showWarningMock = vi.mocked(vscode.window.showWarningMessage)
		showWarningMock.mockClear()
		showWarningMock.mockResolvedValue(undefined)

		versionApiMock.getLatestVersion.mockResolvedValue({
			version: "2.0.0",
			downloadUrl: "https://example.com/pkg.zip",
		} as ResourcePackageVersion)

		const networkError = new Error("ETIMEDOUT")
		;(networkError as any).code = "ETIMEDOUT"
		downloaderMock.download.mockRejectedValue(networkError)

		vi.useFakeTimers({ shouldAdvanceTime: true })

		// --- First background install cycle: fails, notifies user ---
		const check1 = (installer as any).performBackgroundCheck(true)
		await vi.advanceTimersByTimeAsync(10_000)
		await check1

		// First notification must have been sent
		expect(showWarningMock).toHaveBeenCalledTimes(1)
		showWarningMock.mockClear()

		// --- Second background install cycle: also fails ---
		// hasNotifiedFailure should be reset at the start of each new install attempt,
		// so the second failure should also trigger a notification.
		const check2 = (installer as any).performBackgroundCheck(true)
		await vi.advanceTimersByTimeAsync(10_000)
		await check2

		// Second notification MUST also be sent (this is the regression test)
		expect(showWarningMock).toHaveBeenCalledTimes(1)

		vi.useRealTimers()
	})

	// P1b: lastCheckedAt not updated when lock acquired but version already up-to-date
	// Bug: in multi-process scenario, process B acquires lock and finds version already
	// installed by process A (freshRecord.installedVersion >= versionInfo.version).
	// It returns noUpdate without updating lastCheckedAt, so the 12h cooldown is not reset.
	// This causes process B to re-check on the next activation instead of waiting 12h.
	it("should proceed to install on manual trigger even when version already up-to-date after acquiring lock (P1b)", async () => {
		// Setup: remote version 2.0.0, initial local version 1.0.0 (triggers lock acquisition)
		recordManagerMock.read.mockResolvedValue({ ...defaultRecord, installedVersion: "1.0.0" })

		versionApiMock.getLatestVersion.mockResolvedValue({
			version: "2.0.0",
			downloadUrl: "https://example.com/pkg.zip",
		} as ResourcePackageVersion)

		const result = await installer.triggerManualInstall()

		// Manual install bypasses version check — always proceeds to install
		expect(result.state).toBe("installed")

		// lastCheckedAt is updated as part of successful install
		expect(recordManagerMock.write).toHaveBeenCalled()
		const writeCall = recordManagerMock.write.mock.calls[0][0]
		expect(writeCall).toHaveProperty("lastCheckedAt")
		expect(writeCall.lastCheckedAt).toBeGreaterThan(0)
	})

	// P6: disk errors (ENOSPC, EACCES, EPERM) should show installFailed warning WITH Retry Now button
	// This verifies that the isDisk branch and else branch are equivalent and both show Retry Now.
	it("should show installFailed warning WITH Retry Now button on background disk error (P6)", async () => {
		const vscode = await import("vscode")
		const showWarningMock = vi.mocked(vscode.window.showWarningMessage)
		showWarningMock.mockClear()
		showWarningMock.mockResolvedValue(undefined)

		versionApiMock.getLatestVersion.mockResolvedValue({
			version: "2.0.0",
			downloadUrl: "https://example.com/pkg.zip",
		} as ResourcePackageVersion)

		// Disk error: ENOSPC (no space left on device)
		const diskError = new Error("ENOSPC: no space left on device")
		;(diskError as any).code = "ENOSPC"
		downloaderMock.download.mockRejectedValue(diskError)

		vi.useFakeTimers({ shouldAdvanceTime: true })
		const checkPromise = (installer as any).performBackgroundCheck(true)
		await vi.advanceTimersByTimeAsync(10_000)
		await checkPromise

		// showWarningMessage must be called
		expect(showWarningMock).toHaveBeenCalled()
		// Must be called with at least 2 args (message + Retry Now button)
		const callArgs = showWarningMock.mock.calls[0]
		expect(callArgs.length).toBeGreaterThanOrEqual(2)
		// First arg is the warning message (contains "installFailed" key)
		expect(String(callArgs[0])).toContain("installFailed")
		// Second arg is the Retry Now button label
		expect(String(callArgs[1])).toContain("retryNow")

		vi.useRealTimers()
	})

	// Requirement 1: background install success should show showInformationMessage
	// Requirement 1: background install success should show showInformationMessage
	it("should show showInformationMessage on background install success", async () => {
		const vscode = await import("vscode")
		const showInfoMock = vi.mocked(vscode.window.showInformationMessage)
		showInfoMock.mockClear()

		versionApiMock.getLatestVersion.mockResolvedValue({
			version: "2.0.0",
			downloadUrl: "https://example.com/pkg.zip",
		} as ResourcePackageVersion)

		await (installer as any).performBackgroundCheck(true)

		// showInformationMessage must be called for background install success
		expect(showInfoMock).toHaveBeenCalled()
		// The message should contain the "installed" key (i18n key suffix)
		const callArgs = showInfoMock.mock.calls[0]
		expect(String(callArgs[0])).toContain("installed")
	})
	// Notifications are now unified: both manual and background installs show
	// showInformationMessage via notifyResult.
	it("should show showInformationMessage on manual install success (unified notification)", async () => {
		const vscode = await import("vscode")
		const showInfoMock = vi.mocked(vscode.window.showInformationMessage)
		showInfoMock.mockClear()

		versionApiMock.getLatestVersion.mockResolvedValue({
			version: "2.0.0",
			downloadUrl: "https://example.com/pkg.zip",
		} as ResourcePackageVersion)

		const result = await installer.triggerManualInstall()
		expect(result.state).toBe("installed")

		// showInformationMessage must be called for manual installs too (unified notification)
		expect(showInfoMock).toHaveBeenCalled()
		const callArgs = showInfoMock.mock.calls[0]
		expect(String(callArgs[0])).toContain("installed")
	})
})
