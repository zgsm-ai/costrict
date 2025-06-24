import * as grpc from "@grpc/grpc-js"
import * as vscode from "vscode"
import { FileDownloader } from "./fileDownloader"

import * as path from "path"
import getPort, { portNumbers } from "get-port"
import * as fs from "fs"
import { exec } from "child_process"
import {
	SyncServiceClient,
	RegisterSyncResponse,
	ShareAccessTokenResponse,
	VersionResponse,
	SyncCodebaseResponse,
} from "./types/codebase_syncer"
import { ClineProvider } from "../webview/ClineProvider"
import { getWorkspacePath } from "../../utils/path"
import { PackageInfo, PackagesResponse } from "./types"

export class ZgsmCodeBaseSyncService {
	private static providerRef: WeakRef<ClineProvider>
	private static _instance: ZgsmCodeBaseSyncService

	private registerSyncTimeout?: NodeJS.Timeout
	private clientDaemonPollTimeout?: NodeJS.Timeout
	private clientUpdatePollTimeout?: NodeJS.Timeout
	private address = ""
	private curVersion = ""
	private accessToken = ""
	private serverEndpoint = ""

	public client?: SyncServiceClient

	get clientId() {
		return vscode.env.machineId
	}

	get workspacePath() {
		return getWorkspacePath()
	}

	get workspaceName() {
		return path.basename(this.workspacePath)
	}

	get apiBase() {
		return `${this.serverEndpoint}/codebaseSyncer_cli_tools`
	}

	get platform() {
		switch (process.platform) {
			case "win32":
				return "windows"
			case "darwin":
				return "darwin"
			default:
				return "linux"
		}
	}

	get arch() {
		switch (process.arch) {
			case "ia32":
			case "x64":
				return "amd64"
			default:
				return "arm64"
		}
	}

	static async setProvider(provider: ClineProvider) {
		ZgsmCodeBaseSyncService.providerRef = new WeakRef(provider)
	}

	static getInstance() {
		if (!ZgsmCodeBaseSyncService._instance) {
			return (ZgsmCodeBaseSyncService._instance = new ZgsmCodeBaseSyncService())
		}
		return ZgsmCodeBaseSyncService._instance
	}

	static async stopSync() {
		const _instance = ZgsmCodeBaseSyncService.getInstance()

		if (!_instance) return
		_instance.stopRegisterSyncPoll()
		_instance.stopClientDaemonPoll()
		_instance.stopClientUpdatePoll()

		try {
			await _instance.unregisterSync()
			_instance.client?.close()
		} catch (error) {
			console.error(error.message)
		}
	}

	private async fileExists(path: string): Promise<boolean> {
		try {
			await fs.promises.access(path, fs.constants.F_OK)
			return true
		} catch {
			return false
		}
	}

	// Supported platforms: linux/windows/mac
	private getTargetPath(version: string): { targetDir: string; targetPath: string } {
		const homeDir = this.platform === "windows" ? process.env.USERPROFILE : process.env.HOME
		if (!homeDir) {
			throw new Error("Failed to determine home directory path")
		}

		const targetDir = path.join(homeDir, ".zgsm", "bin", version, `${this.platform}_${this.arch}`)
		const targetPath = path.join(targetDir, `codebaseSyncer${this.platform === "windows" ? ".exe" : ""}`)
		return { targetDir, targetPath }
	}

	private async retryWrapper<T>(rid: string, fn: () => Promise<T>): Promise<T> {
		let lastError: Error | undefined

		for (let attempt = 0; attempt < 3; attempt++) {
			try {
				return await fn()
			} catch (error) {
				lastError = error instanceof Error ? error : new Error(String(error))
				console.warn(`[${rid}] Attempt ${attempt + 1} failed:`, lastError.message)
				if (attempt < 2) {
					await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, attempt)))
				}
			}
		}
		throw lastError || new Error("Operation failed after 3 attempts")
	}

	setToken(token: string) {
		this.accessToken = token
	}

	setServerEndpoint(serverEndpoint: string) {
		this.serverEndpoint = serverEndpoint
	}

	/** ====== grpc Communication ====== */
	async registerSync(): Promise<RegisterSyncResponse> {
		return this.retryWrapper("registerSync", () => {
			return new Promise((resolve, reject) => {
				if (!this.client) {
					return reject(new Error("client not init!"))
				}

				this.client.registerSync(
					{
						clientId: this.clientId,
						workspacePath: this.workspacePath,
						workspaceName: this.workspaceName,
					},
					(err: grpc.ServiceError | null, response?: RegisterSyncResponse) => {
						if (err) return reject(err)
						resolve(response!)
					},
				)
			})
		})
	}

	async unregisterSync(): Promise<void> {
		return this.retryWrapper("unregisterSync", () => {
			return new Promise((resolve, reject) => {
				if (!this.client) {
					return reject(new Error("client not init!"))
				}
				this.client.unregisterSync(
					{
						clientId: this.clientId,
						workspacePath: this.workspacePath,
						workspaceName: this.workspaceName,
					},
					(err: grpc.ServiceError | null) => {
						if (err) return reject(err)
						resolve()
					},
				)
			})
		})
	}

	async shareAccessToken(): Promise<ShareAccessTokenResponse> {
		return this.retryWrapper("shareAccessToken", () => {
			return new Promise((resolve, reject) => {
				if (!this.client) {
					return reject(new Error("client not init!"))
				}
				this.client.shareAccessToken(
					{
						accessToken: this.accessToken,
						clientId: this.clientId,
						serverEndpoint: this.serverEndpoint,
					},
					(err: grpc.ServiceError | null, response?: ShareAccessTokenResponse) => {
						if (err) return reject(err)
						resolve(response!)
					},
				)
			})
		})
	}

	async getLocalClientInfo(): Promise<VersionResponse> {
		return new Promise((resolve, reject) => {
			if (!this.client) {
				return reject(new Error("client not init!"))
			}
			this.client.getVersion(
				{ clientId: this.clientId },
				(err: grpc.ServiceError | null, response?: VersionResponse) => {
					if (err) return reject(err)
					resolve(response!)
				},
			)
		})
	}

	async syncCodebase(): Promise<SyncCodebaseResponse> {
		return this.retryWrapper("syncCodebase", () => {
			return new Promise((resolve, reject) => {
				if (!this.client) {
					return reject(new Error("client not init!"))
				}

				this.client.syncCodebase(
					{
						clientId: this.clientId,
						workspacePath: this.workspacePath,
						workspaceName: this.workspaceName,
					},
					(err: grpc.ServiceError | null, response?: SyncCodebaseResponse) => {
						if (err) return reject(err)
						resolve(response!)
					},
				)
			})
		})
	}

	async download(version: string): Promise<void> {
		// 1. Get version information
		const packagesData = await this.getVersionList()

		// 2. Get package information
		const packageInfoUrl = `${this.apiBase}${packagesData.latest.infoUrl}`
		const packageInfoResponse = await fetch(packageInfoUrl)
		const packageInfo = (await packageInfoResponse.json()) as PackageInfo
		const { major, minor, micro } = packagesData.latest.versionId

		const { targetDir, targetPath } = this.getTargetPath(version || `${major}.${minor}.${micro}`)
		await fs.promises.mkdir(targetDir, { recursive: true })

		// 3. Use FileDownloader to download and verify the file
		const downloadUrl = `${this.apiBase}${packagesData.latest.packageUrl}`
		const downloader = new FileDownloader({
			downloadUrl,
			targetPath,
			checksum: packageInfo.checksum,
			signature: packageInfo.sign,
			publicKey: process.env.ZGSM_PUBLIC_KEY!,
			platform: this.platform,
		})

		await downloader.download()
	}

	async getVersionList(): Promise<PackagesResponse> {
		const packagesUrl = `${this.apiBase}/packages-${this.platform}-${this.arch}/1.0/packages-${this.platform}-${this.arch}.json`
		return this.retryWrapper("getVersionList", async () => {
			const response = await fetch(packagesUrl)
			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`)
			}
			return response.json() as Promise<PackagesResponse>
		})
	}

	// Check if grpc client needs to be updated
	async updateCheck() {
		try {
			const provider = ZgsmCodeBaseSyncService.providerRef.deref()
			if (!provider) throw new Error("provider not init!")

			const json = await this.getVersionList()

			if (!json.versions.length) {
				throw new Error("Failed to get version list")
			}

			const { major, minor, micro } = json.latest.versionId
			const latestVersion = `${major}.${minor}.${micro}`

			const { targetPath } = await this.getTargetPath(latestVersion)
			return {
				updated: await this.fileExists(targetPath),
				version: latestVersion,
			}
		} catch (error) {
			return {
				updated: false,
				version: "",
			}
		}
	}

	async isProcessRunning(processName = "codebaseSyncer"): Promise<boolean> {
		// Skip retry for process checking as it's not a gRPC call
		try {
			let output: string
			switch (this.platform) {
				case "windows":
					output = await execPromise(`tasklist /fi "imagename eq ${processName}.exe"`)
					return output.includes(processName)
				case "darwin":
				case "linux":
					output = await execPromise(`pgrep -f ${processName}`)
					return output.trim().length > 0
				default:
					throw new Error("Unsupported platform")
			}
		} catch (e) {
			console.log(e.message)

			return false
		}
	}

	async killProcess(processName = "codebaseSyncer"): Promise<void> {
		try {
			if (this.platform === "windows") {
				await execPromise(`taskkill /F /IM "${processName}.exe"`)
			} else {
				await execPromise(`pkill -f ${processName} || true`)
			}
		} catch (err) {
			console.error(`[killProcess] Failed to kill process: ${err.message}`)
		}
	}

	// 2. Start new process with retry mechanism
	async startProcess(version: string, maxRetries = 5): Promise<void> {
		let attempts = 0

		const { targetPath } = this.getTargetPath(version)

		while (attempts < maxRetries) {
			attempts++
			try {
				const processOptions = {
					detached: true,
					stdio: "ignore" as const,
					encoding: "utf8" as const,
				}
				const port = await getPort({ port: portNumbers(51353, 65535) })
				const address = `localhost:${port}`
				const args = [
					`-clientid ${this.clientId}`,
					`-server ${this.serverEndpoint}`,
					`-token ${this.accessToken}`,
					`-grpc ${address}`,
				].join(" ")
				const command = this.platform === "windows" ? `"${targetPath}" ${args}` : `${targetPath} ${args}`
				const process = exec(command, processOptions)
				process.unref()

				// Wait a moment to check if the process is still running
				await new Promise((resolve) => setTimeout(resolve, attempts * 1000))
				const isRunning = await this.isProcessRunning()
				this.address = address
				if (isRunning) return
			} catch (err) {
				console.error(`Failed to start process (attempt ${attempts}/${maxRetries}): ${err}`)
				if (attempts >= maxRetries) {
					throw new Error(`Failed after max retries (${maxRetries})`)
				}
			}
		}
	}

	public async runSync(version: string): Promise<void> {
		this.stopRegisterSyncPoll()

		const { data } = await this.getLocalClientInfo().catch(() => ({
			data: { version: "" },
		}))
		const isRunning = await this.isProcessRunning()

		if (!(isRunning && data?.version === version)) {
			console.log(`Start service...`)
			await this.killProcess()
			await this.startProcess(version)
			console.log("✅ Service start successfully")
		}

		this.client?.close()
		this.client = new SyncServiceClient(this.address, grpc.credentials.createInsecure())
		this.client.waitForReady(Date.now() + 1000, async () => {
			await this.shareAccessToken()
			await this.registerSync()
			this.curVersion = version
			this.registerSyncPoll()
		})
	}

	registerSyncPoll() {
		const sync = () => {
			this.registerSync()
			this.registerSyncTimeout = setTimeout(sync, 1000 * 60 * 4.5)
		}
		this.registerSyncTimeout = setTimeout(sync, 1000 * 60 * 4.5)
	}

	stopRegisterSyncPoll() {
		clearTimeout(this.registerSyncTimeout)
	}

	async stopClientUpdatePoll() {
		clearTimeout(this.clientUpdatePollTimeout)
	}

	async clientUpdatePoll() {
		this.stopClientUpdatePoll()

		const run = () => {
			this.start().finally(() => {
				this.clientUpdatePollTimeout = setTimeout(run, 1000 * 60 * 60)
			})
		}

		this.clientUpdatePollTimeout = setTimeout(run, 1000 * 60 * 60)
	}

	async start() {
		const { updated, version } = await this.updateCheck()

		if (!updated) {
			await this.download(version)
		}

		await this.runSync(version)
	}

	clientDaemonPoll() {
		if (this.clientDaemonPollTimeout) {
			this.stopClientDaemonPoll()
		}

		const interval = 30 * 1000

		let attempts = 0

		const sync = async () => {
			try {
				const { data } = await this.getLocalClientInfo()

				if (data?.version !== this.curVersion) {
					throw new Error("Version is not match")
				}

				attempts = 0
			} catch (error) {
				if (attempts < 6) {
					console.warn(`[ClientDaemonPoll Attempt ${++attempts} failed:`, error.message)
					this.clientDaemonPollTimeout = setTimeout(sync, interval)
				} else {
					try {
						attempts = 0
						await this.start()
					} catch (error) {
						console.warn(`[ClientDaemonPoll restart failed:`, error.message)
					} finally {
						this.clientDaemonPollTimeout = setTimeout(sync, interval)
					}
				}
				return
			}

			this.clientDaemonPollTimeout = setTimeout(sync, interval)
		}
		this.clientDaemonPollTimeout = setTimeout(sync, interval)
	}

	stopClientDaemonPoll() {
		if (this.clientDaemonPollTimeout) {
			clearTimeout(this.clientDaemonPollTimeout)
			this.clientDaemonPollTimeout = undefined
		}
	}
}
function execPromise(command: string): Promise<string> {
	return new Promise((resolve, reject) => {
		exec(command, (error, stdout) => {
			if (error) {
				reject(error)
			} else {
				resolve(stdout)
			}
		})
	})
}
