import * as fs from "fs/promises"
import * as path from "path"
import * as vscode from "vscode"
import semverCompare from "semver-compare"
import { createLogger } from "../../../utils/logger"
import { Package } from "../../../shared/package"
import { getGlobalCostrictDirectory } from "../../../services/roo-config/index"
import { getSettingsDirectoryPath } from "../../../utils/storage"
import { t } from "../../../i18n"
// costrict: import ClineProvider for hot-reload after install
import { ClineProvider } from "../../webview/ClineProvider"
import { InstallRecordManager } from "./InstallRecordManager"
import { VersionApi } from "./VersionApi"
import { AgentDownloader } from "./AgentDownloader"
import { AgentInstaller } from "./AgentInstaller"
import { delay, getCheckIntervalMs } from "./utils"
import type {
	ResourcePackageVersion,
	LocalInstallRecord,
	InstallResult,
	UninstallResult,
	InstalledManifest,
} from "./types"
import { FatalInstallerError } from "./types"

const logger = createLogger(Package.outputChannel)
const LOG_PREFIX = "[remote-agent-installer]"
const LOCK_FILE_PATH = path.join(getGlobalCostrictDirectory(), "remote-agent-package.lock")
const LOCK_EXPIRE_MS = 30 * 60 * 1000
const OUTER_MAX_RETRIES = 3
const OUTER_RETRY_DELAYS_MS = [1_000, 2_000, 4_000]

export class RemoteAgentInstaller {
	private static instance?: RemoteAgentInstaller
	private context?: vscode.ExtensionContext
	private recordManager: InstallRecordManager
	private versionApi: VersionApi
	private downloader: AgentDownloader
	private installer: AgentInstaller
	private runningPromise: Promise<InstallResult> | null = null
	private checkTimeout?: NodeJS.Timeout
	private statusBarItem?: vscode.StatusBarItem
	private packageName: string = "Remote Resource Package"
	private hasNotifiedFailure = false
	private isDisposed = false

	private constructor(context?: vscode.ExtensionContext) {
		this.context = context
		this.recordManager = new InstallRecordManager()
		this.versionApi = new VersionApi()
		this.downloader = new AgentDownloader()
		this.installer = new AgentInstaller()
	}

	static getInstance(context?: vscode.ExtensionContext): RemoteAgentInstaller {
		if (!RemoteAgentInstaller.instance) {
			RemoteAgentInstaller.instance = new RemoteAgentInstaller(context)
		} else if (context && !RemoteAgentInstaller.instance.context) {
			// Update context on the existing instance if it was created without one.
			// This handles the case where registerCommands.ts calls getInstance() without
			// context before extension.ts calls getInstance(context) during activation.
			// Without this update, ensureInstallerConfigured() would skip settingsDir
			// configuration and AgentInstaller would use ~/.roo/ instead of globalStorageUri.
			RemoteAgentInstaller.instance.context = context
		}
		return RemoteAgentInstaller.instance
	}

	/**
	 * Dispose the singleton instance if it exists, without creating a new one.
	 * Use this in extension deactivate() instead of getInstance().dispose() to
	 * avoid accidentally creating a new instance just to immediately dispose it.
	 */
	static disposeInstance(): void {
		RemoteAgentInstaller.instance?.dispose()
	}

	getPackageName(): string {
		return this.packageName
	}

	scheduleBackgroundCheck(): void {
		const run = async () => {
			try {
				await this.performBackgroundCheck()
			} catch (error: any) {
				logger.error(`${LOG_PREFIX} Background check error: ${error.message}`)
			}
			this.scheduleNextCheck()
		}
		void run()
	}

	async triggerManualInstall(): Promise<InstallResult> {
		if (this.runningPromise) {
			void vscode.window.showWarningMessage(
				t("remoteAgentInstaller:warn.taskInProgress", { name: this.packageName }),
			)
			return { state: "failed", reason: "Task in progress" }
		}

		// NOTE: No race condition here despite the async gap between the runningPromise check
		// and its assignment below. JavaScript is single-threaded: code between two `await`
		// points runs atomically within the same event-loop tick. This method is only triggered
		// by user-initiated VSCode commands, which are dispatched one at a time. A second
		// invocation can only enter after the first `await` yields control, at which point
		// `runningPromise` is already set. Multi-process concurrency (different VSCode windows)
		// is handled separately by the file-based lock in doInstall().
		await this.ensureInstallerConfigured()

		const task = this.doInstall(true)
		this.runningPromise = task
		try {
			const result = await task
			this.notifyResult(result, true)
			return result
		} finally {
			this.runningPromise = null
		}
	}

	async triggerManualUninstall(): Promise<UninstallResult> {
		if (this.runningPromise) {
			void vscode.window.showWarningMessage(
				t("remoteAgentInstaller:warn.taskInProgress", { name: this.packageName }),
			)
			return { success: false, reason: "Task in progress" }
		}

		// Set runningPromise to block concurrent install/background-check during uninstall.
		// runningPromise is typed as Promise<InstallResult> (not Promise<UninstallResult>) because
		// it serves as a shared mutex for all task types (install, background-check, uninstall).
		// Uninstall does not produce an InstallResult, so we create a dummy Promise<InstallResult>
		// that resolves with { state: "noUpdate" } once the uninstall finishes. The resolved value
		// is never consumed — only the presence/absence of runningPromise matters for the mutex.
		let resolveRunning!: () => void
		this.runningPromise = new Promise<InstallResult>((resolve) => {
			resolveRunning = () => resolve({ state: "noUpdate" })
		})

		try {
			await this.ensureInstallerConfigured()
			const record = await this.recordManager.read()
			logger.info(`${LOG_PREFIX} Uninstalling ${this.packageName} ${record.installedVersion}`)
			await this.installer.uninstall(record)
			await this.recordManager.write({
				...record,
				installedVersion: "0.0.0",
				installState: "none",
				manifest: { agents: [], commands: [], skills: [], rules: [], mcp: [] },
			})
			logger.info(`${LOG_PREFIX} ${this.packageName} ${record.installedVersion} uninstalled successfully`)
			void this.hotReloadAfterInstall()
			return { success: true }
		} catch (error: any) {
			logger.error(`${LOG_PREFIX} Manual uninstall failed: ${error.message}`)
			return { success: false, reason: error.message }
		} finally {
			resolveRunning()
			this.runningPromise = null
		}
	}

	dispose(): void {
		this.isDisposed = true
		if (this.checkTimeout) {
			clearTimeout(this.checkTimeout)
			this.checkTimeout = undefined
		}
		this.statusBarItem?.dispose()
		this.releaseLock().catch(() => {})
		// Clear the singleton instance so that getInstance() returns a fresh
		// instance after dispose(), preventing use of a disposed/stale instance.
		if (RemoteAgentInstaller.instance === this) {
			RemoteAgentInstaller.instance = undefined
		}
	}

	private async ensureInstallerConfigured(): Promise<void> {
		if (this.context) {
			const settingsDir = await getSettingsDirectoryPath(this.context.globalStorageUri.fsPath)
			// Pass downloader.getTmpDir() so installer.tmpDir stays in sync with downloader.tmpDir.
			// This ensures extractDir (computed from installer.tmpDir) is always in the same
			// base directory as the downloaded zip file.
			this.installer = new AgentInstaller(this.downloader.getTmpDir(), undefined, settingsDir)
		}
	}

	private scheduleNextCheck(): void {
		// Do not schedule if already disposed — avoids timer leaks after dispose().
		if (this.isDisposed) {
			return
		}
		const intervalMs = getCheckIntervalMs()
		const nextCheckAt = new Date(Date.now() + intervalMs).toLocaleString()
		logger.info(`${LOG_PREFIX} Next background check scheduled in ${intervalMs / 60_000} min (at ${nextCheckAt})`)
		this.checkTimeout = setTimeout(() => {
			const run = async () => {
				try {
					await this.performBackgroundCheck()
				} catch (error: any) {
					logger.error(`${LOG_PREFIX} Background check error: ${error.message}`)
				}
				this.scheduleNextCheck()
			}
			void run()
		}, intervalMs)
	}

	private async performBackgroundCheck(): Promise<void> {
		if (this.runningPromise) {
			logger.info(`${LOG_PREFIX} Background check skipped, install task already running`)
			return
		}
		const task = this.doInstall(false)
		this.runningPromise = task
		try {
			const result = await task
			this.notifyResult(result, false)
		} catch (error: any) {
			// doInstall throws on network/HTTP errors (VersionApi throws instead of returning null).
			// Swallow the error here so lastCheckedAt is NOT updated on network failures —
			// the background check will be retried on the next scheduled interval.
			logger.warn(`${LOG_PREFIX} Background version check failed: ${error.message}`)
		} finally {
			this.runningPromise = null
		}
	}

	private async doInstall(isManual: boolean): Promise<InstallResult> {
		const record = await this.recordManager.read()

		// getLatestVersion() throws on network/HTTP errors; returns null only when the server
		// responds OK but has no downloadUrl (no package available). lastCheckedAt must NOT
		// be updated on network errors — only on successful checks.
		const versionInfo = await this.versionApi.getLatestVersion()

		if (!versionInfo) {
			logger.info(`${LOG_PREFIX} No remote resource package available`)
			await this.updateLastChecked(record)
			return { state: "noUpdate" }
		}

		this.packageName = versionInfo.name || "Remote Resource Package"

		// Only skip installation for automatic/background checks when the local
		// version is already installed and up to date. Manual installs always
		// proceed so the user can force a reinstall regardless of version.
		if (
			!isManual &&
			record.installState === "installed" &&
			semverCompare(versionInfo.version, record.installedVersion) <= 0
		) {
			logger.info(`${LOG_PREFIX} Local version ${record.installedVersion} is up to date, skipping installation.`)
			await this.updateLastChecked(record)
			return { state: "noUpdate" }
		}

		logger.info(
			`${LOG_PREFIX} ${this.packageName} remote: ${versionInfo.version}, local: ${record.installedVersion}, ${isManual ? "manual install" : "update needed"}`,
		)

		// Check lock for both manual and background triggers
		const lockHeld = await this.isLockHeld()
		if (lockHeld) {
			if (isManual) {
				logger.warn(`${LOG_PREFIX} Lock held by another process, cannot start manual install`)
				// Lock held → install skipped entirely. Do NOT update lastCheckedAt here:
				// resetting the cooldown would cause the next window to skip the check
				// even though no install was actually attempted in this window.
				return { state: "failed", reason: "Another process is currently installing" }
			}
			logger.warn(`${LOG_PREFIX} Lock held by another process, skipping background check`)
			// Same reasoning: do NOT update lastCheckedAt when install was skipped due to lock.
			return { state: "noUpdate" }
		}

		try {
			await this.acquireLock()
		} catch (error: any) {
			// EEXIST means another process just acquired the lock between our check and acquire (TOCTOU race)
			if (error.code === "EEXIST") {
				logger.warn(`${LOG_PREFIX} Lock already held by another process (race condition), skipping`)
				if (isManual) {
					return { state: "failed", reason: "Another process is currently installing" }
				}
				return { state: "noUpdate" }
			}
			logger.warn(`${LOG_PREFIX} Failed to acquire lock: ${error.message}`)
			if (isManual) {
				return { state: "failed", reason: "Failed to acquire lock" }
			}
			return { state: "noUpdate" }
		}

		// Determine if this is an upgrade (previously installed) or a fresh install,
		// so the progress notification can show the appropriate text.
		const isUpgrade = record.installState === "installed"
		const titleKey = isUpgrade ? "remoteAgentInstaller:info.upgrading" : "remoteAgentInstaller:info.installing"

		try {
			await this.ensureInstallerConfigured()
			// Show a progress notification for both manual and automatic installs.
			// The notification appears immediately and auto-dismisses when the promise resolves.
			return await vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: t(titleKey, { name: this.packageName }),
					cancellable: false,
				},
				async () => {
					return await this.runInstallWithRetries(versionInfo, record, isManual)
				},
			)
		} finally {
			await this.releaseLock()
		}
	}

	private async runInstallWithRetries(
		versionInfo: ResourcePackageVersion,
		record: LocalInstallRecord,
		isManual: boolean,
	): Promise<InstallResult> {
		// Reset hasNotifiedFailure at the start of each new install attempt so that
		// each background failure cycle can independently notify the user.
		this.hasNotifiedFailure = false
		let lastError: Error | undefined
		let zipPath: string | undefined
		const extractDir = path.join(this.installer.getTmpDir(), `remote-agent-package-${versionInfo.version}`)

		for (let attempt = 0; attempt < OUTER_MAX_RETRIES; attempt++) {
			try {
				// Reuse the zip from a previous successful download() call if it still exists.
				// Note: download() calls cleanupResidualFiles() internally, which deletes ALL
				// agent-package-* files. This is safe because:
				//   - On attempt 0: zipPath is undefined, so download() is always called.
				//   - On attempt 1+: zipPath points to the file returned by the previous download().
				//     Since download() only returns after writing the file, the file exists.
				//     cleanupResidualFiles() is only called at the START of download(), so it
				//     cannot delete a zip that was returned by a prior download() call.
				if (!zipPath || !(await this.fileExists(zipPath))) {
					zipPath = await this.downloader.download(versionInfo, (progress) => {
						this.showDownloadProgress(progress.progress)
					})
				}

				const manifest = await this.installer.install(zipPath, versionInfo, record)
				await this.recordManager.write({
					...record,
					installedVersion: versionInfo.version,
					lastCheckedAt: Date.now(),
					installState: "installed",
					manifest,
				})
				this.hideDownloadProgress()
				this.hasNotifiedFailure = false
				logger.info(`${LOG_PREFIX} ${this.packageName} updated to ${versionInfo.version}`)
				// costrict: hot-reload custom modes, skills after install
				void this.hotReloadAfterInstall()
				return { state: "installed", version: versionInfo.version }
			} catch (error: any) {
				lastError = error
				logger.warn(`${LOG_PREFIX} Install attempt ${attempt + 1} failed: ${error.message}`)

				if (error instanceof FatalInstallerError) {
					this.hideDownloadProgress()
					await this.installer.cleanup(zipPath, extractDir)
					if (!isManual) {
						this.notifyFatalError(error)
					}
					return { state: "failed", reason: error.message }
				}

				if (attempt < OUTER_MAX_RETRIES - 1) {
					await this.installer.cleanup(undefined, extractDir)
					await delay(OUTER_RETRY_DELAYS_MS[attempt])
				} else {
					this.hideDownloadProgress()
					await this.installer.cleanup(zipPath, extractDir)
					// lastCheckedAt is only updated on a successful version check, not on install failure.
					await this.recordManager.write({
						...record,
						installState: "failed",
					})
					if (!isManual && lastError) {
						this.notifyRetryableError(lastError)
					}
					return { state: "failed", reason: lastError?.message || "Unknown error" }
				}
			}
		}

		return { state: "failed", reason: lastError?.message || "Unknown error" }
	}

	private async updateLastChecked(record: LocalInstallRecord): Promise<void> {
		await this.recordManager.write({
			...record,
			lastCheckedAt: Date.now(),
		})
	}

	private showDownloadProgress(percentage: number): void {
		if (!this.statusBarItem) {
			this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100)
		}
		this.statusBarItem.text = `$(cloud-download) ${this.packageName} ${percentage}%`
		this.statusBarItem.show()
	}

	private hideDownloadProgress(): void {
		this.statusBarItem?.hide()
	}

	// hot-reload custom modes, skills after a successful remote agent install.
	// Invalidates the ClineProvider's in-memory custom modes cache and re-discovers skills so that
	// newly installed agents and skills are immediately visible in the UI without a VSCode restart.
	private async hotReloadAfterInstall(): Promise<void> {
		logger.info(`${LOG_PREFIX} Starting hot-reload after install (customModes, skills)`)
		try {
			const provider = await ClineProvider.getInstance()
			if (!provider) {
				logger.warn(`${LOG_PREFIX} Hot-reload skipped: no active ClineProvider instance`)
				return
			}
			// Invalidate custom modes cache so the next getState() re-reads custom_modes.yaml
			provider.invalidateCustomModesCache()
			// Re-discover skills from disk (also refreshes the commands list)
			await provider.getSkillsManager()?.discoverSkills()
			// Push updated state to webview so the mode dropdown updates immediately
			await provider.postStateToWebviewWithoutClineMessages()
			logger.info(`${LOG_PREFIX} Hot-reload completed: webview state pushed`)
		} catch (error: any) {
			logger.warn(`${LOG_PREFIX} hotReloadAfterInstall failed (non-blocking): ${error.message}`)
		}
	}

	private async isLockHeld(): Promise<boolean> {
		try {
			const data = await fs.readFile(LOCK_FILE_PATH, "utf-8")
			const lock = JSON.parse(data) as { pid: number; startTime: number }
			if (Date.now() - lock.startTime < LOCK_EXPIRE_MS) {
				return true
			}
			await fs.unlink(LOCK_FILE_PATH).catch(() => {})
			return false
		} catch {
			return false
		}
	}

	private async acquireLock(): Promise<void> {
		const lockData = JSON.stringify({ pid: process.pid, startTime: Date.now() })
		await fs.mkdir(path.dirname(LOCK_FILE_PATH), { recursive: true })
		// Use exclusive write (wx flag) to prevent concurrent lock acquisition
		await fs.writeFile(LOCK_FILE_PATH, lockData, { encoding: "utf-8", flag: "wx" })
	}

	private async releaseLock(): Promise<void> {
		try {
			await fs.unlink(LOCK_FILE_PATH)
		} catch {
			// ignore
		}
	}

	/**
	 * Show notification based on install result.
	 * - installed: always notify (both manual and background)
	 * - noUpdate: only notify for manual installs
	 * - failed: only notify for manual installs (background errors are handled
	 *   inside runInstallWithRetries via notifyFatalError / notifyRetryableError)
	 */
	private notifyResult(result: InstallResult, isManual: boolean): void {
		const name = this.packageName
		if (result.state === "installed") {
			void vscode.window.showInformationMessage(
				t("remoteAgentInstaller:info.installed", { name, version: result.version }),
			)
		} else if (isManual && result.state === "noUpdate") {
			void vscode.window.showInformationMessage(t("remoteAgentInstaller:info.noUpdate", { name }))
		} else if (isManual && result.state === "failed") {
			void vscode.window.showErrorMessage(
				t("remoteAgentInstaller:error.updateFailed", { name, reason: result.reason }),
			)
		}
	}

	private notifyFatalError(error: FatalInstallerError): void {
		if (this.hasNotifiedFailure) {
			return
		}
		this.hasNotifiedFailure = true
		void vscode.window.showWarningMessage(
			t("remoteAgentInstaller:warn.contentCorrupted", { name: this.packageName }),
		)
	}

	private notifyRetryableError(error: Error): void {
		if (this.hasNotifiedFailure) {
			return
		}
		this.hasNotifiedFailure = true
		const code = (error as any).code || ""
		const isNetwork = ["ETIMEDOUT", "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN"].includes(code)

		// Network errors show a "download failed" message; all other errors (disk, unknown, etc.)
		// show an "install failed" message. Both offer a "Retry Now" button.
		const messageKey = isNetwork
			? "remoteAgentInstaller:warn.downloadFailed"
			: "remoteAgentInstaller:warn.installFailed"
		void vscode.window
			.showWarningMessage(
				t(messageKey, {
					name: this.packageName,
					reason: error.message,
				}),
				t("remoteAgentInstaller:action.retryNow"),
			)
			.then((selection) => {
				if (selection === t("remoteAgentInstaller:action.retryNow")) {
					void this.triggerManualInstall()
				}
			})
	}

	private async fileExists(filePath: string): Promise<boolean> {
		try {
			await fs.access(filePath)
			return true
		} catch {
			return false
		}
	}
}
