import * as grpc from "@grpc/grpc-js"
import * as vscode from "vscode"
import { FileDownloader } from "./fileDownloader"

import * as path from "path"
import getPort, { portNumbers } from "get-port"
import * as fs from "fs"
import fetch from "node-fetch"
import { exec } from "child_process"
import {
	SyncServiceClient,
	RegisterSyncRequest,
	RegisterSyncResponse,
	ShareAccessTokenRequest,
	ShareAccessTokenResponse,
	UnregisterSyncRequest,
	VersionRequest,
	VersionResponse,
} from "./types/codebase_syncer"
import { ClineProvider } from "../webview/ClineProvider"
import { getWorkspacePath } from "../../utils/path"

interface PackageInfo {
	packageName: string
	os: string
	arch: string
	size: number
	checksum: string
	sign: string
	checksumAlgo: string
	versionId: {
		major: number
		minor: number
		micro: number
		support: string
	}
	build: string
	versionDesc: string
}

interface VersionInfo {
	versionId: {
		major: number
		minor: number
		micro: number
		support: string
	}
	appUrl: string
	packageUrl: string
	infoUrl: string
}

interface PackagesResponse {
	os: string
	arch: string
	latest: VersionInfo
	versions: VersionInfo[]
}

export class ZgsmCodeBaseService {
	private static providerRef: WeakRef<ClineProvider>
	private static _instance: ZgsmCodeBaseService

	private client?: SyncServiceClient
	private registerSyncTimeout?: NodeJS.Timeout
	private updatePollTimeout?: NodeJS.Timeout

	private address = ""
	private accessToken = ""
	private serverEndpoint = ""

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

	public static async setProvider(provider: ClineProvider) {
		ZgsmCodeBaseService.providerRef = new WeakRef(provider)
	}

	public static async getInstance() {
		if (!ZgsmCodeBaseService._instance) {
			return (ZgsmCodeBaseService._instance = new ZgsmCodeBaseService())
		}
		return ZgsmCodeBaseService._instance
	}

	public static async stopSync() {
		const _instance = await ZgsmCodeBaseService.getInstance()

		if (!_instance) return
		_instance.stopRegisterSyncPoll()
		_instance.stopUpdatePollTimeout()
		_instance.client?.close()
		_instance.unregisterSync().catch(console.error)
	}

	setToken(token: string) {
		this.accessToken = token
	}

	setServerEndpoint(serverEndpoint: string) {
		this.serverEndpoint = serverEndpoint
	}

	/** ====== grpc Communication ====== */
	async registerSync(request: RegisterSyncRequest): Promise<RegisterSyncResponse> {
		return new Promise((resolve, reject) => {
			if (!this.client) {
				return reject(new Error("client not init!"))
			}
			this.client.registerSync(request, (err: grpc.ServiceError | null, response?: RegisterSyncResponse) => {
				if (err) return reject(err)
				resolve(response!)
			})
		})
	}

	async unregisterSync(
		request: UnregisterSyncRequest = {
			clientId: this.clientId,
			workspacePath: this.workspacePath,
			workspaceName: this.workspaceName,
		},
	): Promise<void> {
		return new Promise((resolve, reject) => {
			if (!this.client) {
				return reject(new Error("client not init!"))
			}
			this.client.unregisterSync(request, (err: grpc.ServiceError | null) => {
				if (err) return reject(err)
				resolve()
			})
		})
	}

	async shareAccessToken(request: ShareAccessTokenRequest): Promise<ShareAccessTokenResponse> {
		return new Promise((resolve, reject) => {
			if (!this.client) {
				return reject(new Error("client not init!"))
			}
			this.client.shareAccessToken(
				request,
				(err: grpc.ServiceError | null, response?: ShareAccessTokenResponse) => {
					if (err) return reject(err)
					resolve(response!)
				},
			)
		})
	}

	async getLocalClientInfo(request: VersionRequest): Promise<VersionResponse> {
		return new Promise((resolve, reject) => {
			if (!this.client) {
				return reject(new Error("client not init!"))
			}
			this.client.getVersion(request, (err: grpc.ServiceError | null, response?: VersionResponse) => {
				if (err) return reject(err)
				resolve(response!)
			})
		})
	}
	/** ====== grpc Communication ====== */

	/** ====== grpc 客户端获取与更新检测 ====== */
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

		const targetDir = path.join(homeDir, ".zgsm", version, `${this.platform}_${this.arch}`)
		const targetPath = path.join(targetDir, `codebaseSyncer${this.platform === "windows" ? ".exe" : ""}`)
		return { targetDir, targetPath }
	}

	public async download(version: string): Promise<void> {
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

		if (await this.isProcessRunning()) {
			console.log(`Restarting service...`)
			await this.killProcess()
			console.log("✅ Service restarted successfully")
		}
	}

	public async getVersionList() {
		const packagesUrl = `${this.apiBase}/packages-${this.platform}-${this.arch}/1.0/packages-${this.platform}-${this.arch}.json`
		const packagesResponse = await fetch(packagesUrl)

		return (await packagesResponse.json()) as PackagesResponse
	}

	// Check if grpc client needs to be updated
	public async updateCheck() {
		const provider = ZgsmCodeBaseService.providerRef.deref()

		if (!provider) throw new Error("provider not init!")

		const json = await this.getVersionList()

		if (!json.versions.length) {
			throw new Error("Failed to get version list")
		}

		const { major, minor, micro } = json.latest.versionId
		const latestVersion = `${major}.${minor}.${micro}`

		const { targetPath } = await this.getTargetPath(latestVersion)

		return { updated: await this.fileExists(targetPath), version: latestVersion }
	}
	/** ====== grpc Client Acquisition & Update Check ====== */

	/** ====== Process Management ====== */
	private async isProcessRunning(processName = "codebaseSyncer"): Promise<boolean> {
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

	public async killProcess(processName = "codebaseSyncer"): Promise<void> {
		try {
			if (this.platform === "windows") {
				await new Promise((resolve) => {
					exec(`taskkill /IM ${processName}.exe /F`, resolve)
				})
			} else {
				await new Promise((resolve) => {
					exec(`pkill -f ${processName} || true`, resolve) // Add ||true to avoid errors when process doesn't exist
				})
			}
		} catch (err) {
			console.error(`Failed to kill process: ${err}`)
		}
	}

	// 2. Start new process with retry mechanism
	public async startProcess(version: string, maxRetries = 5): Promise<void> {
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

				const command =
					this.platform === "windows" ? `"${targetPath}" -grpc ${address}` : `${targetPath} -grpc ${address}`
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

	public async startSync(version: string): Promise<void> {
		this.stopRegisterSyncPoll()

		const { data } = await this.getLocalClientInfo({ clientId: this.clientId }).catch((error) => {
			console.error(error)
			return { data: { version: "" } }
		})
		const isRunning = await this.isProcessRunning()

		if (!(isRunning && data?.version === version)) {
			await this.killProcess()
			await this.startProcess(version)
		}

		this.client?.close()
		this.client = new SyncServiceClient(this.address, grpc.credentials.createInsecure())
		this.client.waitForReady(1000, async () => {
			await this.shareAccessToken({
				accessToken: this.accessToken,
				clientId: this.clientId,
				serverEndpoint: this.serverEndpoint,
			})
			this.registerSync({
				clientId: this.clientId,
				workspacePath: this.workspacePath,
				workspaceName: this.workspaceName,
			})
			this.registerSyncPoll()
		})
	}

	registerSyncPoll() {
		const sync = () => {
			this.registerSync({
				clientId: this.clientId,
				workspacePath: this.workspacePath,
				workspaceName: this.workspaceName,
			})
			this.registerSyncTimeout = setTimeout(sync, 1000 * 60 * 4.5)
		}
		this.registerSyncTimeout = setTimeout(sync, 1000 * 60 * 4.5)
	}

	stopRegisterSyncPoll() {
		clearTimeout(this.registerSyncTimeout)
	}

	updateCLientPoll() {
		if (this.updatePollTimeout) {
			this.stopUpdatePollTimeout()
		}

		const sync = () => {
			this.updateCheck()
				.then(async (res) => {
					if (!res.updated) {
						await this.download(res.version)
					}
					this.startSync(res.version)
				})
				.catch(console.error)
			this.updatePollTimeout = setTimeout(sync, 60 * 60 * 1000)
		}
		this.updatePollTimeout = setTimeout(sync, 60 * 60 * 1000)
	}

	stopUpdatePollTimeout() {
		if (this.updatePollTimeout) {
			clearTimeout(this.updatePollTimeout)
			this.updatePollTimeout = undefined
		}
	}
	/** ====== grpc Client Acquisition & Update Check ====== */
}

function execPromise(command: string): Promise<string> {
	return new Promise((resolve, reject) => {
		exec(command, (error, stdout) => {
			if (error) {
				reject(error) // 命令执行失败返回false
			} else {
				resolve(stdout)
			}
		})
	})
}
