import * as fs from "fs"
import * as path from "path"
import * as os from "os"
import * as http from "http"
import { EventEmitter } from "events"
// import { spawn } from "child_process"
import which from "which"
import crossSpawn from "cross-spawn"
import * as vscode from "vscode"
import { getAssistantUIConfig } from "./config"

export type CsCloudServiceState = "idle" | "loading" | "running" | "error"
export type CsCloudProcessOwner = "extension" | "external"
export type CsCloudConnectionSource =
	| "configuredBaseUrl"
	| "serverUrlFile"
	| "bundledBinary"
	| "cliStatus"
	| "cliRestart"

type CsCloudConnectionRefreshOperation = {
	logBranch: string
	operationLabel: string
	startMessage: string
	successMessage: string
	validate?: () => void
	run: () => Promise<string>
}

/**
 * cs-cloud service manager.
 *
 * Discovery: configuredUrl → server_url file → bundled binary → CLI status → error
 * Crash detection: process exit, heartbeat (15s × 3), file watcher
 * Auto recovery: extension-owned process retries 3x with exponential backoff
 * Events: "crashed" { reason }, "urlChanged" { url }
 */
export class CsCloudService extends EventEmitter implements vscode.Disposable {
	state: CsCloudServiceState = "idle"
	processOwner: CsCloudProcessOwner = "extension"
	connectionSource: CsCloudConnectionSource = "bundledBinary"

	lastCrashReason?: string
	startupFailureReason?: string
	startupFailureIsUninstallCsc = false

	private baseUrl: string | undefined
	private watcher: fs.FSWatcher | undefined
	private operationPromise?: Promise<string>
	private childProcess?: ReturnType<typeof crossSpawn>
	private healthCheckTimer?: ReturnType<typeof setInterval>
	private healthCheckFailures = 0
	private autoReconnectCount = 0

	private readonly HEALTH_CHECK_INTERVAL = 15_000
	private readonly HEALTH_CHECK_FAILURE_THRESHOLD = 3
	private readonly MAX_AUTO_RECONNECTS = 3
	private readonly RESTART_READY_TIMEOUT = 30_000

	constructor(private readonly outputChannel: vscode.OutputChannel) {
		super()
	}

	get baseUrlValue(): string | undefined {
		return this.baseUrl
	}

	private log(step: number, branch: string, message: string) {
		if (process.env.NODE_ENV !== "development") return
		const prefix = step > 0 ? `[cs-cloud][Step${step}]` : `[cs-cloud]`
		this.outputChannel.appendLine(`${prefix}[${branch}] ${message}`)
	}

	private get serverUrlPath(): string {
		return path.join(os.homedir(), ".costrict", "cs-cloud", "server_url")
	}

	private get bundledBinPath(): string {
		const binName = process.platform === "win32" ? "cs-cloud.exe" : "cs-cloud"
		return path.join(os.homedir(), ".costrict", "bin", binName)
	}

	async ensureStarted(): Promise<string> {
		if (this.operationPromise) {
			this.log(0, "ensureStarted", "Operation already in progress, reusing existing Promise")
			return this.operationPromise
		}

		if (this.state === "running" && this.baseUrl) {
			this.log(0, "ensureStarted", `Already running: ${this.baseUrl}`)
			return this.baseUrl
		}

		this.log(0, "ensureStarted", `Current state: ${this.state}, starting launch sequence`)
		this.state = "loading"
		this.operationPromise = this.doEnsureStarted()

		try {
			const url = await this.operationPromise
			this.state = "running"
			this.lastCrashReason = undefined
			this.startupFailureReason = undefined
			this.startupFailureIsUninstallCsc = false
			this.startWatching()
			this.startHealthCheck()
			this.log(0, "ensureStarted", `✓ Started successfully → ${url}`)
			return url
		} catch (err) {
			this.state = "error"
			this.startupFailureReason = err instanceof Error ? err.message : String(err)
			this.startupFailureIsUninstallCsc = isUninstallCscError(err)
			this.log(0, "ensureStarted", `✗ Startup failed: ${this.startupFailureReason}`)
			throw err
		} finally {
			this.operationPromise = undefined
		}
	}

	private async doEnsureStarted(): Promise<string> {
		const config = getAssistantUIConfig()

		// Step1: user-configured baseUrl
		if (config.baseUrl.trim()) {
			this.log(1, "configuredUrl", `Using configured baseUrl: "${config.baseUrl}"`)
			this.baseUrl = trimTrailingSlash(config.baseUrl.trim())
			this.processOwner = "external"
			this.connectionSource = "configuredBaseUrl"
			return this.baseUrl
		}
		this.log(1, "configuredUrl", "No baseUrl configured, skipping")

		// Step2: server_url file
		const fileUrl = this.readServerUrlFile()
		if (fileUrl) {
			this.log(2, "serverUrlFile", `Found file: ${this.serverUrlPath}`)
			this.log(2, "serverUrlFile", `Address: ${fileUrl}`)

			const healthUrl = `${fileUrl}/api/v1/runtime/health`
			const healthy = await isHttpReady(healthUrl)
			this.log(2, "serverUrlFile", `health check [${healthUrl}] → ${healthy ? "OK" : "FAIL"}`)

			if (healthy) {
				this.baseUrl = `${fileUrl}/api/v1`
				this.processOwner = "external"
				this.connectionSource = "serverUrlFile"
				this.log(2, "serverUrlFile", "✓ Health check passed, using this address")
				return this.baseUrl
			}
			this.log(2, "serverUrlFile", "Address invalid, continuing to next step")
		} else {
			this.log(2, "serverUrlFile", `File does not exist: ${this.serverUrlPath}`)
		}

		// Step3: bundled binary
		const hasBin = fs.existsSync(this.bundledBinPath)
		this.log(3, "bundledBin", `Checking binary: ${this.bundledBinPath} → ${hasBin ? "exists" : "not found"}`)

		if (hasBin) {
			this.processOwner = "extension"
			this.connectionSource = "bundledBinary"

			this.log(3, "bundledBin", `spawn: ${this.bundledBinPath} cloud start --port ${config.port} --host 0.0.0.0`)
			try {
				await this.spawnBundledBinary(config.port)
				this.log(3, "bundledBin", "Process spawned, waiting for server_url file to be created...")
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err)
				this.log(3, "bundledBin", `Spawn failed: ${msg}`)
			}

			const url = await this.waitForServerUrlFile(5_000)
			if (url) {
				this.log(3, "bundledBin", `✓ server_url ready → ${url}`)
				return url
			}
			this.log(3, "bundledBin", "Timed out waiting for server_url, continuing to next step")
		}

		let cscCliPath = ""
		try {
			cscCliPath = await which(config.defaultCli)
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err)
			this.log(4, "cliStatus", `${msg}`)
			const _err = new Error(
				`${msg}\nInstall command: npm install @costrict/csc -g\nAfter installing csc, run: csc cloud start`,
			)
			// @ts-ignore
			_err["__IS_UNINSTALL_CSC_ERROR__"] = true
			throw _err
		}

		// Step4: CLI status
		this.log(4, "cliStatus", `Executing ${cscCliPath} cloud status detection...`)
		const cliUrl = await this.detectViaCliStatus(cscCliPath)
		if (cliUrl) {
			this.baseUrl = cliUrl
			this.processOwner = "external"
			this.connectionSource = "cliStatus"
			this.log(4, "cliStatus", `✓ Detected running instance → ${cliUrl}`)
			return cliUrl
		}
		this.log(4, "cliStatus", "No running instance detected")

		// Step5: all failed
		this.log(5, "failed", "All strategies failed")
		throw new Error("Please run manually: csc cloud start\n Then restart the editor")
	}

	async reconnect(): Promise<string> {
		return this.runConnectionRefreshOperation({
			logBranch: "reconnect",
			operationLabel: "Reconnect",
			startMessage: "Starting reconnect...",
			successMessage: "Reconnect successful",
			run: () => this.doEnsureStarted(),
		})
	}

	async restartServer(): Promise<string> {
		return this.runConnectionRefreshOperation({
			logBranch: "restartServer",
			operationLabel: "Server restart",
			startMessage: "Starting server restart...",
			successMessage: "Server restart successful",
			validate: () => {
				const config = getAssistantUIConfig()
				if (config.baseUrl.trim()) {
					throw new Error("Cannot restart configured external cs-cloud baseUrl")
				}
			},
			run: () => this.doRestartServer("restartServer"),
		})
	}

	private async runConnectionRefreshOperation(options: CsCloudConnectionRefreshOperation): Promise<string> {
		if (this.startupFailureIsUninstallCsc) {
			throw new Error(this.startupFailureReason ?? "csc is not installed")
		}

		options.validate?.()

		this.log(0, options.logBranch, options.startMessage)
		this.resetRuntimeStateForConnectionRefresh()
		this.operationPromise = options.run()

		try {
			const url = await this.operationPromise
			this.state = "running"
			this.startupFailureIsUninstallCsc = false
			this.startWatching()
			this.startHealthCheck()
			this.log(0, options.logBranch, `✓ ${options.successMessage} → ${url}`)
			return url
		} catch (err) {
			this.state = "error"
			this.startupFailureReason = err instanceof Error ? err.message : String(err)
			this.startupFailureIsUninstallCsc = isUninstallCscError(err)
			this.log(0, options.logBranch, `✗ ${options.operationLabel} failed: ${this.startupFailureReason}`)
			throw err
		} finally {
			this.operationPromise = undefined
		}
	}

	private resetRuntimeStateForConnectionRefresh(): void {
		this.stopWatching()
		this.stopHealthCheck()
		this.childProcess = undefined
		this.state = "loading"
		this.startupFailureReason = undefined
		this.startupFailureIsUninstallCsc = false
		this.lastCrashReason = undefined
		this.baseUrl = undefined
		this.operationPromise = undefined
	}

	dispose(): void {
		this.log(0, "dispose", "Cleaning up resources")
		this.stopWatching()
		this.stopHealthCheck()
		this.childProcess = undefined
		this.removeAllListeners()
	}

	private readServerUrlFile(): string | undefined {
		try {
			if (!fs.existsSync(this.serverUrlPath)) return undefined
			const content = fs.readFileSync(this.serverUrlPath, "utf-8").trim()
			if (!content) return undefined
			return trimTrailingSlash(content)
		} catch (err) {
			this.log(0, "readServerUrl", `Read failed: ${err instanceof Error ? err.message : String(err)}`)
			return undefined
		}
	}

	private async waitForServerUrlFile(timeoutMs: number): Promise<string | undefined> {
		const start = Date.now()
		while (Date.now() - start < timeoutMs) {
			const url = this.readServerUrlFile()
			if (url) {
				const baseUrl = `${url}/api/v1`
				if (await isHttpReady(`${baseUrl}/runtime/health`)) {
					this.baseUrl = baseUrl
					return baseUrl
				}
			}
			await sleep(1000)
		}
		return undefined
	}

	private async doRestartServer(logBranch: string): Promise<string> {
		if (fs.existsSync(this.bundledBinPath)) {
			this.processOwner = "extension"
			this.connectionSource = "bundledBinary"
			this.log(0, logBranch, `Executing bundled restart: ${this.bundledBinPath} restart`)
			await this.execCapture(this.bundledBinPath, ["restart"], 30_000, true)
			return this.waitForRestartReady()
		}

		let cscCliPath = ""
		try {
			const config = getAssistantUIConfig()
			cscCliPath = await which(config.defaultCli)
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err)
			const _err = new Error(
				`${msg}\nInstall command: npm install @costrict/csc -g\nAfter installing csc, run: csc cloud restart`,
			)
			// @ts-ignore
			_err["__IS_UNINSTALL_CSC_ERROR__"] = true
			throw _err
		}

		this.processOwner = "external"
		this.connectionSource = "cliRestart"
		this.log(0, logBranch, `Executing CLI restart: ${cscCliPath} cloud restart`)
		await this.execCapture(cscCliPath, ["cloud", "restart"], 30_000, true)
		return this.waitForRestartReady()
	}

	private async waitForRestartReady(): Promise<string> {
		const url = await this.waitForServerUrlFile(this.RESTART_READY_TIMEOUT)
		if (!url) {
			throw new Error("cs-cloud restart timed out waiting for server_url")
		}
		return url
	}

	private startWatching(): void {
		this.stopWatching()

		const dir = path.dirname(this.serverUrlPath)
		if (!fs.existsSync(dir)) {
			this.log(0, "fileWatcher", `Directory does not exist, skipping watcher: ${dir}`)
			return
		}

		this.log(0, "fileWatcher", `Starting watcher: ${dir}`)
		this.watcher = fs.watch(dir, (eventType, filename) => {
			if (filename !== "server_url") return

			this.log(0, "fileWatcher", `Event: ${eventType}`)

			if (eventType === "rename" && !fs.existsSync(this.serverUrlPath)) {
				this.log(0, "fileWatcher", "server_url deleted → cs-cloud has stopped")
				this.handleCrashDetected("cs-cloud process has stopped")
				return
			}

			if (eventType === "change") {
				const newUrl = this.readServerUrlFile()
				if (newUrl) {
					const newBaseUrl = `${newUrl}/api/v1`
					if (newBaseUrl !== this.baseUrl) {
						this.log(0, "fileWatcher", `URL changed: ${this.baseUrl} → ${newBaseUrl}`)
						this.baseUrl = newBaseUrl
						this.emit("urlChanged", { url: this.baseUrl })
					}
				}
			}
		})
	}

	private stopWatching(): void {
		if (this.watcher) {
			this.log(0, "fileWatcher", "Stopping watcher")
			this.watcher.close()
			this.watcher = undefined
		}
	}

	private startHealthCheck(): void {
		this.stopHealthCheck()
		this.healthCheckFailures = 0
		this.log(0, "healthCheck", `Starting heartbeat check, interval ${this.HEALTH_CHECK_INTERVAL}ms`)

		this.healthCheckTimer = setInterval(async () => {
			if (!this.baseUrl || this.state !== "running") return

			const healthy = await isHttpReady(`${this.baseUrl}/runtime/health`)
			if (healthy) {
				this.healthCheckFailures = 0
			} else {
				this.healthCheckFailures++
				this.log(
					0,
					"healthCheck",
					`Health check failed (${this.healthCheckFailures}/${this.HEALTH_CHECK_FAILURE_THRESHOLD})`,
				)
				if (this.healthCheckFailures >= this.HEALTH_CHECK_FAILURE_THRESHOLD) {
					this.handleCrashDetected("cs-cloud health check failed consecutively")
				}
			}
		}, this.HEALTH_CHECK_INTERVAL)
	}

	private stopHealthCheck(): void {
		if (this.healthCheckTimer) {
			this.log(0, "healthCheck", "Stopping heartbeat check")
			clearInterval(this.healthCheckTimer)
			this.healthCheckTimer = undefined
		}
		this.healthCheckFailures = 0
	}

	private handleCrashDetected(reason: string): void {
		this.log(0, "crash", `Crash detected: ${reason}`)
		this.stopWatching()
		this.stopHealthCheck()
		this.lastCrashReason = reason

		if (this.processOwner === "extension" && this.autoReconnectCount < this.MAX_AUTO_RECONNECTS) {
			this.autoReconnectCount++
			const delay = 5000 * Math.pow(2, this.autoReconnectCount - 1)
			this.log(
				0,
				"crash",
				`Auto-reconnect (${this.autoReconnectCount}/${this.MAX_AUTO_RECONNECTS}), retrying in ${delay}ms`,
			)

			setTimeout(async () => {
				try {
					await this.reconnect()
					this.autoReconnectCount = 0
					this.log(0, "crash", "Auto-reconnect succeeded")
				} catch (err) {
					this.log(0, "crash", `Auto-reconnect failed: ${err instanceof Error ? err.message : String(err)}`)
					this.state = "error"
					this.emit("crashed", { reason: this.lastCrashReason ?? reason })
				}
			}, delay)
			return
		}

		this.autoReconnectCount = 0
		if (this.state !== "error") {
			this.state = "error"
			this.emit("crashed", { reason })
		}
	}

	private spawnBundledBinary(port: number): Promise<void> {
		return new Promise((resolve, reject) => {
			this.log(
				0,
				"vscode.workspace.workspaceFolders",
				`${vscode.workspace.workspaceFolders?.map((f) => f.uri.fsPath).join(", ")}`,
			)
			const child = crossSpawn(this.bundledBinPath, ["start", "--port", String(port), "--host", "0.0.0.0"], {
				cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
				// detached: true,
				// stdio: "ignore",
				env: { ...process.env },
			})

			child.on("error", (err) => reject(err))

			this.childProcess = child
			child.on("exit", (code) => {
				if (this.state === "running") {
					this.handleCrashDetected(`cs-cloud process exited, exit code: ${code}`)
				}
			})

			child.unref()
			resolve()
		})
	}

	private async detectViaCliStatus(cscCliPath: string): Promise<string | undefined> {
		try {
			const output = await this.execCapture(cscCliPath, ["cloud", "status"], 15_000)
			this.log(4, "cliStatus", `Output: ${output.slice(0, 200)}...`)

			const match = output.match(/local_url:\s+(https?:\/\/[^\s]+)/)
			if (!match) {
				this.log(4, "cliStatus", "local_url field not found in output")
				return undefined
			}

			const url = trimTrailingSlash(match[1])
			const baseUrl = `${url}/api/v1`
			this.log(4, "cliStatus", `Detected local_url: ${url}`)

			const healthUrl = `${baseUrl}/runtime/health`
			const healthy = await isHttpReady(healthUrl)
			this.log(4, "cliStatus", `health check [${healthUrl}] → ${healthy ? "OK" : "FAIL"}`)

			return healthy ? baseUrl : undefined
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err)
			this.log(4, "cliStatus", `Execution failed: ${msg}`)
			return undefined
		}
	}

	private execCapture(command: string, args: string[], timeoutMs: number, rejectOnNonZero = false): Promise<string> {
		return new Promise((resolve, reject) => {
			const child = crossSpawn(command, args, {
				env: { ...process.env },
				stdio: "pipe",
			})

			const chunks: string[] = []
			let settled = false

			const timer = setTimeout(() => {
				if (settled) return
				settled = true
				child.kill()
				reject(new Error(`Timed out: ${command} ${args.join(" ")}`))
			}, timeoutMs)

			child.stdout?.on("data", (d) => chunks.push(String(d)))
			child.stderr?.on("data", (d) => chunks.push(String(d)))

			child.on("close", (code) => {
				if (settled) return
				settled = true
				clearTimeout(timer)
				const output = stripAnsi(chunks.join(""))
				if (rejectOnNonZero && typeof code === "number" && code !== 0) {
					reject(new Error(`Command failed (${code}): ${command} ${args.join(" ")}\n${output}`))
					return
				}
				resolve(output)
			})

			child.on("error", (err) => {
				if (settled) return
				settled = true
				clearTimeout(timer)
				reject(err)
			})
		})
	}
}

// ── Utilities ──

function isUninstallCscError(err: unknown): boolean {
	return typeof err === "object" && err !== null && "__IS_UNINSTALL_CSC_ERROR__" in err
}

function trimTrailingSlash(value: string): string {
	return value.replace(/\/+$/, "")
}

function isHttpReady(url: string): Promise<boolean> {
	return new Promise((resolve) => {
		const req = http.get(url, (res) => {
			res.resume()
			resolve(res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 500)
		})
		req.setTimeout(2_000, () => {
			req.destroy()
			resolve(false)
		})
		req.on("error", () => resolve(false))
	})
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

function stripAnsi(text: string): string {
	const ESC = String.fromCharCode(27)
	return text.replace(new RegExp(ESC + "\[[0-9;]*m", "g"), "")
}
