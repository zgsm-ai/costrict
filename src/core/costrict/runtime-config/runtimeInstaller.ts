import crypto from "crypto"
import fs from "fs"
import http from "http"
import https from "https"
import os from "os"
import path from "path"
import { URL } from "url"

import { Package } from "../../../shared/package"
import { getClientId } from "../../../utils/getClientId"
import { createLogger, type ILogger } from "../../../utils/logger"
import { CostrictAuthApi } from "../auth/authApi"
import { CostrictAuthConfig } from "../auth/authConfig"

export interface RuntimeVersionId {
	major: number
	minor: number
	micro: number
}

export interface RuntimePackageInfoResponse {
	packageName: string
	packageType: string
	fileName: string
	os: string
	arch: string
	size: number
	checksum: string
	sign: string
	checksumAlgo: string
	versionId: RuntimeVersionId
	build: string
	description: string
}

export interface RuntimeVersionInfo {
	versionId: RuntimeVersionId
	appUrl: string
	infoUrl: string
	packageInfo?: RuntimePackageInfoResponse
	status?: "downloading" | "downloaded" | "failed"
	updateAt?: number
}

export interface RuntimePlatformResponse {
	packageName: string
	os: string
	arch: string
	newest: RuntimeVersionInfo
	versions: RuntimeVersionInfo[]
}

export interface RuntimeDownloadProgress {
	downloaded: number
	total: number
	progress: number
}

export type RuntimeInstallState = "firstInstall" | "upgraded" | "noUpdate" | "failed"

export interface RuntimeMetadataFileSystem {
	existsSync(filePath: string): boolean
	mkdirSync(dirPath: string, options?: { recursive?: boolean }): void
	readFileSync(filePath: string, encoding: BufferEncoding): string
	writeFileSync(filePath: string, data: string, encoding: BufferEncoding): void
}

export interface RuntimeFileDownloaderLike {
	downloadClient(
		targetPath: string,
		versionInfo: RuntimeVersionInfo,
		packageInfo: RuntimePackageInfoResponse,
		onProgress?: (progress: RuntimeDownloadProgress) => void,
	): Promise<string>
}

export interface RuntimeVersionApiLike {
	getLatestVersion(): Promise<RuntimeVersionInfo>
}

export interface RuntimePackageInfoApiLike {
	getPackageInfo(versionInfo: RuntimeVersionInfo): Promise<RuntimePackageInfoResponse>
}

export interface RuntimePaths {
	homeDir: string
	cacheDir: string
	versionDir: string
	packageDir: string
	targetPath: string
	versionFilePath: string
	packageInfoPath: string
	packageVersionInfoPath: string
}

export interface CostrictRuntimeInstallerDeps {
	fileSystem?: RuntimeMetadataFileSystem
	homeDir?: string
	logger?: ILogger
	platformDetector?: PlatformDetector
	versionApi?: RuntimeVersionApiLike
	packageInfoApi?: RuntimePackageInfoApiLike
	fileDownloader?: RuntimeFileDownloaderLike
	createFileDownloader?: () => RuntimeFileDownloaderLike
	now?: () => number
	sleep?: (ms: number) => Promise<void>
}

const nodeRuntimeFileSystem: RuntimeMetadataFileSystem = {
	existsSync: (filePath) => fs.existsSync(filePath),
	mkdirSync: (dirPath, options) => fs.mkdirSync(dirPath, options),
	readFileSync: (filePath, encoding) => fs.readFileSync(filePath, encoding),
	writeFileSync: (filePath, data, encoding) => fs.writeFileSync(filePath, data, encoding),
}

const DOWNLOAD_STALE_MS = 60_000
const DOWNLOAD_WAIT_TIMEOUT_MS = 120_000
const DOWNLOAD_WAIT_INTERVAL_MS = 10_000

export const getRuntimeProcessName = () => `costrict${process.platform === "win32" ? ".exe" : ""}`

export const getRuntimePaths = (homeDir = os.homedir(), processName = getRuntimeProcessName()): RuntimePaths => {
	const cacheDir = path.join(homeDir, ".costrict", "bin")
	const versionDir = path.join(homeDir, ".costrict", "share")
	const packageDir = path.join(homeDir, ".costrict", "package")
	const targetPath = path.join(cacheDir, processName)
	const versionFilePath = path.join(versionDir, "version.json")
	const packageInfoPath = path.join(packageDir, "costrict.json")
	const packageVersionInfoPath = path.join(packageDir, `${path.parse(processName).name}.json`)

	return {
		homeDir,
		cacheDir,
		versionDir,
		packageDir,
		targetPath,
		versionFilePath,
		packageInfoPath,
		packageVersionInfoPath,
	}
}

export const compareRuntimeVersions = (latest: RuntimeVersionInfo, current: RuntimeVersionInfo) => {
	if (current.status === "failed") {
		return 1
	}
	if (latest.versionId.major !== current.versionId.major) {
		return latest.versionId.major - current.versionId.major
	}
	if (latest.versionId.minor !== current.versionId.minor) {
		return latest.versionId.minor - current.versionId.minor
	}
	return latest.versionId.micro - current.versionId.micro
}

export class PlatformDetector {
	get platform(): string {
		switch (process.platform) {
			case "win32":
				return "windows"
			case "darwin":
				return "darwin"
			default:
				return "linux"
		}
	}

	get arch(): string {
		switch (process.arch) {
			case "ia32":
			case "x64":
				return "amd64"
			default:
				return "arm64"
		}
	}
}

const getCostrictBaseUrl = async () => {
	const { costrictBaseUrl } = await CostrictAuthApi.getInstance().getApiConfiguration()
	return costrictBaseUrl || CostrictAuthConfig.getInstance().getDefaultApiBaseUrl()
}

const formatRuntimeVersion = (versionInfo: RuntimeVersionInfo) =>
	`${versionInfo.versionId.major}.${versionInfo.versionId.minor}.${versionInfo.versionId.micro}`

export class RuntimeVersionApi implements RuntimeVersionApiLike {
	private platformDetector: PlatformDetector

	constructor(platformDetector = new PlatformDetector()) {
		this.platformDetector = platformDetector
	}

	async getLatestVersion(): Promise<RuntimeVersionInfo> {
		const baseUrl = await getCostrictBaseUrl()
		const url = `${baseUrl}/costrict/costrict/${this.platformDetector.platform}/${this.platformDetector.arch}/platform.json`
		const response = await fetch(url, {
			method: "GET",
			headers: {
				"Content-Type": "application/json",
				"zgsm-request-id": getClientId(),
			},
		})

		if (!response.ok) {
			const errorData = await response.text()
			throw new Error(`Failed to get runtime version list: ${errorData}`)
		}

		const data: RuntimePlatformResponse = await response.json()
		return data.newest
	}
}

export class RuntimePackageInfoApi implements RuntimePackageInfoApiLike {
	async getPackageInfo(versionInfo: RuntimeVersionInfo): Promise<RuntimePackageInfoResponse> {
		const baseUrl = await getCostrictBaseUrl()
		const url = `${baseUrl}/costrict${versionInfo.infoUrl}`
		const response = await fetch(url, {
			method: "GET",
			headers: {
				"Content-Type": "application/json",
				"zgsm-request-id": getClientId(),
			},
		})

		if (!response.ok) {
			const errorData = await response.text()
			throw new Error(`Failed to get runtime package information (${url}): ${errorData}`)
		}

		return response.json()
	}
}

export class RuntimeFileDownloader implements RuntimeFileDownloaderLike {
	private abortController: AbortController | null = null
	private logger: ILogger

	constructor(
		private readonly publicKey: string,
		private readonly timeout = 30_000,
	) {
		if (!this.publicKey) {
			throw new Error("COSTRICT_PUBLIC_KEY is required to verify runtime signature")
		}
		this.logger = createLogger(Package.outputChannel)
	}

	async downloadClient(
		targetPath: string,
		versionInfo: RuntimeVersionInfo,
		packageInfo: RuntimePackageInfoResponse,
		onProgress?: (progress: RuntimeDownloadProgress) => void,
	): Promise<string> {
		const baseUrl = await getCostrictBaseUrl()
		const downloadUrl = `${baseUrl}/costrict${versionInfo.appUrl}`
		this.abortController = new AbortController()

		try {
			await this.downloadFileWithProgress(downloadUrl, targetPath, onProgress)
			await this.verifyFileChecksum(targetPath, packageInfo.checksum, packageInfo.checksumAlgo)
			if (!this.verifySignature(packageInfo.checksum, packageInfo.sign, this.publicKey)) {
				fs.unlink(targetPath, () => {})
				throw new Error("Runtime signature verification failed")
			}
			if (packageInfo.os !== "windows") {
				await fs.promises.chmod(targetPath, 0o755)
			}
			return targetPath
		} finally {
			this.abortController = null
		}
	}

	private async downloadFileWithProgress(
		url: string,
		targetPath: string,
		onProgress?: (progress: RuntimeDownloadProgress) => void,
		maxRetries = 3,
	): Promise<void> {
		const attemptDownload = async () => {
			await new Promise<void>((resolve, reject) => {
				const parsedUrl = new URL(url)
				const client = parsedUrl.protocol === "https:" ? https : http
				const dir = path.dirname(targetPath)
				if (!fs.existsSync(dir)) {
					fs.mkdirSync(dir, { recursive: true })
				}

				const request = client.request(
					{
						hostname: parsedUrl.hostname,
						port: parsedUrl.port || (parsedUrl.protocol === "https:" ? 443 : 80),
						path: parsedUrl.pathname + parsedUrl.search,
						method: "GET",
						timeout: this.timeout,
						signal: this.abortController?.signal,
					},
					(response) => {
						if (response.statusCode !== 200) {
							reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`))
							return
						}

						const total = parseInt(response.headers["content-length"] || "0", 10)
						let downloaded = 0
						const fileStream = fs.createWriteStream(targetPath)
						response.on("data", (chunk) => {
							downloaded += chunk.length
							if (onProgress && total > 0) {
								onProgress({
									downloaded,
									total,
									progress: Math.min(100, Math.round((downloaded / total) * 100)),
								})
							}
						})
						response.pipe(fileStream)
						fileStream.on("finish", () => {
							fileStream.close()
							resolve()
						})
						fileStream.on("error", async (error) => {
							if (fs.existsSync(targetPath)) {
								await fs.promises.unlink(targetPath).catch(() => undefined)
							}
							reject(error)
						})
					},
				)

				request.on("error", async (error) => {
					if (fs.existsSync(targetPath)) {
						await fs.promises.unlink(targetPath).catch(() => undefined)
					}
					reject(error)
				})

				request.on("timeout", () => {
					request.destroy()
					reject(new Error("Runtime download request timeout"))
				})

				request.end()
			})
		}

		for (let attempt = 0; attempt <= maxRetries; attempt++) {
			try {
				await attemptDownload()
				return
			} catch (error) {
				if (attempt === maxRetries) {
					throw new Error(
						`Runtime download failed after ${maxRetries + 1} attempts: ${(error as Error).message}`,
					)
				}
				this.logger.info(`[runtime-installer] download attempt ${attempt + 1} failed, retrying`)
				await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, attempt)))
			}
		}
	}

	private verifySignature(checksum: string, signatureHex: string, publicKeyPem: string) {
		const signature = Buffer.from(signatureHex, "hex")
		const verifier = crypto.createVerify("SHA256")
		verifier.update(checksum)
		verifier.end()
		return verifier.verify(publicKeyPem, signature)
	}

	private async verifyFileChecksum(filePath: string, expectedChecksum: string, algorithm: string) {
		await new Promise<void>((resolve, reject) => {
			const hash = crypto.createHash(algorithm)
			const stream = fs.createReadStream(filePath)

			stream.on("data", (chunk) => hash.update(chunk))
			stream.on("end", () => {
				const actualChecksum = hash.digest("hex")
				if (actualChecksum.toLowerCase() === expectedChecksum.toLowerCase()) {
					resolve()
					return
				}
				fs.unlink(filePath, () => {})
				reject(
					new Error(
						`Runtime checksum verification failed: expected ${expectedChecksum}, actual ${actualChecksum}`,
					),
				)
			})
			stream.on("error", reject)
		})
	}
}

export class CostrictRuntimeInstaller {
	private ensurePromise: Promise<RuntimeInstallState> | null = null
	private readonly logger: ILogger
	private readonly fileSystem: RuntimeMetadataFileSystem
	private readonly homeDir: string
	private readonly platformDetector: PlatformDetector
	private readonly versionApi: RuntimeVersionApiLike
	private readonly packageInfoApi: RuntimePackageInfoApiLike
	private readonly createFileDownloader: () => RuntimeFileDownloaderLike
	private readonly now: () => number
	private readonly sleep: (ms: number) => Promise<void>

	constructor(deps: CostrictRuntimeInstallerDeps = {}) {
		this.logger = deps.logger || createLogger(Package.outputChannel)
		this.fileSystem = deps.fileSystem || nodeRuntimeFileSystem
		this.homeDir = deps.homeDir || os.homedir()
		this.platformDetector = deps.platformDetector || new PlatformDetector()
		this.versionApi = deps.versionApi || new RuntimeVersionApi(this.platformDetector)
		this.packageInfoApi = deps.packageInfoApi || new RuntimePackageInfoApi()
		this.createFileDownloader =
			deps.createFileDownloader ||
			(() =>
				deps.fileDownloader ||
				new RuntimeFileDownloader(process.env.COSTRICT_PUBLIC_KEY || process.env.ZGSM_PUBLIC_KEY || ""))
		this.now = deps.now || (() => Date.now())
		this.sleep = deps.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
	}

	public getTargetPath(fileName = this.processName) {
		return getRuntimePaths(this.homeDir, fileName)
	}

	public get processName() {
		return `costrict${this.platformDetector.platform === "windows" ? ".exe" : ""}`
	}

	public async readLocalVersion(): Promise<RuntimeVersionInfo | undefined> {
		try {
			const { versionFilePath } = this.getTargetPath()
			if (!this.fileSystem.existsSync(versionFilePath)) {
				return undefined
			}
			const versionData = JSON.parse(this.fileSystem.readFileSync(versionFilePath, "utf8"))
			if (!versionData || typeof versionData !== "object") {
				return undefined
			}
			return versionData
		} catch (error) {
			this.logger.error(
				`[runtime-installer] failed to read local runtime version: ${error instanceof Error ? error.message : String(error)}`,
			)
			return undefined
		}
	}

	public async writeLocalVersion(versionInfo: RuntimeVersionInfo): Promise<void> {
		const paths = this.getTargetPath()
		if (!this.fileSystem.existsSync(paths.versionDir)) {
			this.fileSystem.mkdirSync(paths.versionDir, { recursive: true })
		}
		if (!this.fileSystem.existsSync(paths.packageDir)) {
			this.fileSystem.mkdirSync(paths.packageDir, { recursive: true })
		}
		const versionData = {
			...versionInfo,
			updateAt: this.now(),
		}
		const packageVersionInfoPath = path.join(
			paths.packageDir,
			`${path.parse(this.processName).name}-${versionInfo.versionId.major}.${versionInfo.versionId.minor}.${versionInfo.versionId.micro}.json`,
		)
		this.fileSystem.writeFileSync(paths.versionFilePath, JSON.stringify(versionData, null, 2), "utf8")
		this.fileSystem.writeFileSync(
			paths.packageInfoPath,
			JSON.stringify(versionData.packageInfo || {}, null, 2),
			"utf8",
		)
		this.fileSystem.writeFileSync(
			packageVersionInfoPath,
			JSON.stringify(versionData.packageInfo || {}, null, 2),
			"utf8",
		)
	}

	public async ensureInstalled(): Promise<RuntimeInstallState> {
		if (this.ensurePromise) {
			return this.ensurePromise
		}

		this.ensurePromise = this.doEnsureInstalled()
		try {
			return await this.ensurePromise
		} finally {
			this.ensurePromise = null
		}
	}

	private async doEnsureInstalled(): Promise<RuntimeInstallState> {
		const { targetPath } = this.getTargetPath()
		let localVersion = await this.readLocalVersion()

		if (localVersion?.status === "downloading") {
			const elapsed = this.now() - (localVersion.updateAt || 0)
			if (elapsed <= DOWNLOAD_STALE_MS) {
				localVersion = await this.waitForDownloadCompletion()
			} else {
				await this.writeLocalVersion({
					...localVersion,
					status: "failed",
				})
				localVersion = await this.readLocalVersion()
			}
		}

		const binaryExists = this.fileSystem.existsSync(targetPath)
		let latestVersion: RuntimeVersionInfo

		try {
			latestVersion = await this.versionApi.getLatestVersion()
		} catch (error) {
			if (binaryExists) {
				this.logger.warn(
					`[runtime-installer] failed to check runtime updates, continuing with existing binary: ${error instanceof Error ? error.message : String(error)}`,
				)
				return "noUpdate"
			}
			this.logger.error(
				`[runtime-installer] failed to fetch runtime version metadata: ${error instanceof Error ? error.message : String(error)}`,
			)
			return "failed"
		}

		try {
			if (!localVersion || !binaryExists) {
				await this.downloadAndInstallRuntime(latestVersion)
				return "firstInstall"
			}

			if (compareRuntimeVersions(latestVersion, localVersion) > 0) {
				await this.downloadAndInstallRuntime(latestVersion)
				return "upgraded"
			}

			return "noUpdate"
		} catch (error) {
			this.logger.error(
				`[runtime-installer] failed to install runtime: ${error instanceof Error ? error.message : String(error)}`,
			)
			return binaryExists ? "noUpdate" : "failed"
		}
	}

	private async waitForDownloadCompletion() {
		const deadline = this.now() + DOWNLOAD_WAIT_TIMEOUT_MS
		while (this.now() <= deadline) {
			await this.sleep(DOWNLOAD_WAIT_INTERVAL_MS)
			const versionInfo = await this.readLocalVersion()
			if (!versionInfo || versionInfo.status !== "downloading") {
				return versionInfo
			}
		}
		throw new Error("Timed out while waiting for runtime download to complete")
	}

	private async downloadAndInstallRuntime(versionInfo: RuntimeVersionInfo) {
		await this.writeLocalVersion({
			...versionInfo,
			status: "downloading",
		})
		const packageInfo = await this.packageInfoApi.getPackageInfo(versionInfo)
		const { targetPath } = this.getTargetPath()
		const downloader = this.createFileDownloader()
		const versionString = formatRuntimeVersion(versionInfo)

		this.logger.info(`[runtime-installer] starting runtime download: ${versionString}`)
		try {
			await downloader.downloadClient(targetPath, versionInfo, packageInfo, (progress) => {
				this.logger.info(
					`[runtime-installer] download progress: ${progress.progress === 100 && progress.downloaded !== progress.total ? 99 : progress.progress}% ${progress.downloaded === progress.total ? "" : Math.random() > 0.5 ? "......" : "..."}`,
				)
			})
			await this.writeLocalVersion({
				...versionInfo,
				packageInfo,
				status: "downloaded",
			})
			this.logger.info(`[runtime-installer] runtime downloaded and installed successfully: ${targetPath}`)
		} catch (error) {
			await this.writeLocalVersion({
				...versionInfo,
				packageInfo,
				status: "failed",
			})
			throw error
		}
	}
}

let defaultRuntimeInstaller: CostrictRuntimeInstaller | null = null

const getDefaultRuntimeInstaller = () => {
	if (!defaultRuntimeInstaller) {
		defaultRuntimeInstaller = new CostrictRuntimeInstaller()
	}
	return defaultRuntimeInstaller
}

export const readLocalRuntimeVersion = () => getDefaultRuntimeInstaller().readLocalVersion()

export const ensureCostrictRuntimeInstalled = () => getDefaultRuntimeInstaller().ensureInstalled()

export const getRuntimeBinaryPath = () => getDefaultRuntimeInstaller().getTargetPath().targetPath
