import os from "os"
import fs from "fs"
import { PlatformDetector } from "./platform"
import { VersionApi } from "./versionApi"
import { PackageInfoApi } from "./packageInfoApi"
import { FileDownloader, DownloadProgressCallback } from "./fileDownloader"
import {
	PlatformResponse,
	PackageInfoResponse,
	VersionInfo,
	VersionId,
	CodebaseIndexClientConfig,
	DownloadProgress,
	DownloadResult,
	WorkspaceEventRequest,
	IndexBuildRequest,
	IgnoreFilesRequest,
	IndexStatusResponse,
	IndexSwitchRequest,
	ApiResponse,
	RequestHeaders,
	ICostrictServiceInfo,
} from "./types"
import path from "path"
import { execPromise, getServiceConfig, getWellKnownConfig, processIsRunning, spawnDetached } from "./utils"
import getPort, { portNumbers } from "get-port"
import { v7 as uuidv7 } from "uuid"
import { createLogger, ILogger } from "../../../utils/logger"
import { Package } from "../../../shared/package"
import { getClientId } from "../../../utils/getClientId"
import { ZgsmAuthApi, ZgsmAuthConfig } from "../auth"
import { COSTRICT_DEFAULT_HEADERS } from "../../../shared/headers"
// import { DEFAULT_HEADERS } from "../../../api/providers/constants"

/**
 * Main class for codebase-index client
 * Integrates all functional modules to provide complete client download and installation functionality
 */
export class CodebaseIndexClient {
	private platformDetector: PlatformDetector
	private versionApi: VersionApi
	private packageInfoApi: PackageInfoApi
	private fileDownloader: FileDownloader

	private logger: ILogger

	private config: CodebaseIndexClientConfig & { versionInfo?: VersionInfo }
	private serverHost: {
		potolocol: "http" | "https"
		port: number
		[key: string]: any
	} = {} as any
	lastHeaders = {} as any
	private clientId: string = getClientId()

	get processName() {
		return "costrict" + (this.platformDetector.platform === "windows" ? ".exe" : "")
	}
	get serverName() {
		return "codebase-indexer" + (this.platformDetector.platform === "windows" ? ".exe" : "")
	}

	/**
	 * Constructor
	 * @param config Client configuration
	 */
	constructor(config: CodebaseIndexClientConfig = {}) {
		this.logger = createLogger(Package.outputChannel)
		this.config = {
			downloadTimeout: config.downloadTimeout || 30_000,
			publicKey: config.publicKey || process.env.ZGSM_PUBLIC_KEY!,
			getLocalVersion: config.getLocalVersion,
		}

		if (!this.config.publicKey) {
			throw new Error("publicKey is required")
		}

		// Initialize all functional modules
		this.platformDetector = new PlatformDetector()
		this.versionApi = new VersionApi()
		this.packageInfoApi = new PackageInfoApi()
		this.fileDownloader = new FileDownloader(this.config.publicKey, this.config.downloadTimeout)
	}
	/**
	 * Set server endpoint
	 * @param endpoint Server endpoint address
	 */
	public setServerHost(hostInfo: ICostrictServiceInfo): void {
		this.serverHost = hostInfo
	}
	/**
	 * Set server endpoint
	 * @param endpoint Server endpoint address
	 */
	public async getServerEndpoint() {
		const { zgsmBaseUrl } = await ZgsmAuthApi.getInstance().getApiConfiguration()
		return zgsmBaseUrl || ZgsmAuthConfig.getInstance().getDefaultApiBaseUrl()
	}

	/**
	 * Set client ID
	 * @param clientId Client ID
	 */
	public setClientId(clientId: string): void {
		this.clientId = clientId
	}

	/**
	 * Get client ID
	 * @returns Client ID
	 */
	public getClientId(): string {
		return this.clientId
	}

	/**
	 * Get request headers
	 * @param token Access token
	 * @returns Request headers object
	 */
	private async getHeaders(token?: string): Promise<RequestHeaders> {
		return {
			...COSTRICT_DEFAULT_HEADERS,
			"X-Request-ID": uuidv7(),
			"Client-ID": this.clientId,
			Authorization: token ? `Bearer ${token}` : "",
			"Server-Endpoint": await this.getServerEndpoint(),
		}
	}

	/**
	 * Send HTTP request
	 * @param url Request URL
	 * @param options Request options
	 * @param token Access token
	 * @returns Response data
	 */
	private async makeRequest<T>(url: string, options: RequestInit = {}, token?: string): Promise<ApiResponse<T>> {
		const headers = await this.getHeaders(token)

		const finalOptions: RequestInit = {
			...options,
			headers: {
				"Content-Type": "application/json",
				...headers,
				...options.headers,
			},
		}

		const maxRetries = 2
		let lastError: Error = new Error("Unknown error")
		this.lastHeaders = finalOptions.headers
		for (let attempt = 0; attempt <= maxRetries; attempt++) {
			try {
				const response = await fetch(url, finalOptions)

				if (!response.ok) {
					const errorData = await response.text()
					throw new Error(errorData)
				}

				const data: ApiResponse<T> = await response.json()
				return data
			} catch (error) {
				lastError = error

				if (attempt < maxRetries) {
					// Wait before retrying (exponential backoff: 1s, 2s)
					await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)))
					continue
				}
			}
		}

		// All retries failed, throw the last error
		throw new Error(`${url} HTTP request error: ${lastError.message}`)
	}

	/**
	 * Get current platform information
	 * @returns Platform name: 'windows', 'darwin' or 'linux'
	 */
	get platform(): string {
		return this.platformDetector.platform
	}

	/**
	 * Get current architecture information
	 * @returns Architecture name: 'amd64' or 'arm64'
	 */
	get arch(): string {
		return this.platformDetector.arch
	}

	/**
	 * Get client version list
	 * @returns Promise<PlatformResponse> Returns platform version information
	 */
	async getVersionList(): Promise<PlatformResponse> {
		return this.versionApi.getVersionList()
	}

	/**
	 * Get latest version information
	 * @returns Promise<VersionInfo> Returns latest version information
	 */
	async getLatestVersion(): Promise<VersionInfo> {
		return this.versionApi.getLatestVersion()
	}

	/**
	 * Check if there are available updates
	 * @param currentVersion Current version
	 * @returns Promise<boolean> Returns true if there are available updates, otherwise returns false
	 */
	async shouldUpdate(currentVersion: VersionInfo): Promise<boolean> {
		return this.versionApi.shouldUpdate(currentVersion)
	}

	async shouldRunCostrict(canRun: boolean, targetPath: string): Promise<boolean> {
		let fileok = true
		if (this.config?.getLocalVersion) {
			try {
				const { packageInfo } = (await this.config.getLocalVersion()) ?? {}
				if (packageInfo) {
					await this.fileDownloader.verifyFileChecksum(
						targetPath,
						packageInfo.checksum,
						packageInfo.checksumAlgo,
					)
				}
			} catch (error) {
				this.logger.error(`[RunCostrict] Failed to verify checksum for ${targetPath}: ${error}`)
				fileok = false
			}
		}

		return canRun && fileok
	}

	/**
	 * Get package information for specified version
	 * @param version Version string in format "major.minor.micro"
	 * @returns Promise<PackageInfoResponse> Returns package information response
	 */
	async getPackageInfo(versionInfo: VersionInfo): Promise<PackageInfoResponse> {
		return this.packageInfoApi.getPackageInfo(versionInfo)
	}

	/**
	 * Download and install client (complete process)
	 * @param version Version string in format "major.minor.micro", uses latest version if not provided
	 * @param targetPath Target save path, uses default path if not provided
	 * @param onProgress Download progress callback function
	 * @returns Promise<DownloadResult> Returns download result
	 */
	async downloadAndInstallClient(
		versionInfo: VersionInfo,
		onProgress?: (progress: DownloadProgress) => void,
	): Promise<DownloadResult> {
		try {
			const packageInfo = await this.getPackageInfo(versionInfo)
			const downloadProgress = (downloaded: number, total: number, progress: number) => {
				if (onProgress) {
					onProgress({ downloaded, total, progress })
				}
			}
			const { targetPath } = this.getTargetPath()
			// Save file
			const filePath = await this.fileDownloader.downloadClient(
				targetPath,
				versionInfo,
				packageInfo,
				downloadProgress,
			)

			return {
				success: true,
				filePath,
				versionInfo: versionInfo,
				packageInfo: packageInfo,
			}
		} catch (error) {
			return {
				success: false,
				error:
					error instanceof Error
						? error.message
						: "Unknown error occurred while downloading and installing client",
			}
		}
	}

	/**
	 * Cancel current download operation
	 */
	cancelDownload(): void {
		this.fileDownloader.cancelDownload()
	}

	/**
	 * Stop existing client
	 */
	public async stopExistingClient(): Promise<void> {
		if (!(await this.isRunning())[0]) {
			return
		}
		try {
			if (this.platformDetector.platform === "windows") {
				await execPromise(`taskkill /F /IM "${this.processName}" /T`)
			} else {
				await execPromise(`pkill -x "${this.processName}"`).catch(() => {})
			}
		} catch (error) {
			this.logger.warn(`Failed to stop existing ${this.processName} process: ${error}`)
		}
	}

	async isRunning(processName = this.processName) {
		const pids = await processIsRunning(processName, this.logger)
		return [pids.length > 0, pids] as [boolean, number[]]
	}

	async startClient(versionInfo: VersionInfo, shouldStartCostrictKeeper: boolean, maxRetries = 3): Promise<void> {
		let attempts = 0
		const { targetPath } = this.getTargetPath()
		while (attempts < maxRetries) {
			attempts++
			try {
				if (
					await this.shouldRunCostrict(shouldStartCostrictKeeper || !(await this.isRunning())[0], targetPath)
				) {
					const defaultPort = await getPort({ port: portNumbers(9527, 65535) })
					// Start costrict management server
					const port = this.getCostrictServerPort(defaultPort)
					const args = ["server", "--listen", `localhost:${port}`]
					await spawnDetached(targetPath, args)
				}

				if ((await this.isRunning())[0]) {
					await this.initSubService(versionInfo)
					break
				}
			} catch (err: any) {
				if (attempts >= maxRetries) {
					throw new Error(
						`Failed to start ${this.processName} process after multiple retries: ${err.message}`,
					)
				}
				await new Promise((resolve) => setTimeout(resolve, attempts * 1000))
			}
		}
	}
	/**
	 * 1. Start getting service information: every 5 seconds within 5 minutes, every 30 seconds after 5 minutes, until service information is obtained to proceed to next step
	 * 2. Get codebase-indexer service address information (name, protocol, port)
	 */
	async initSubService(versionInfo: VersionInfo, retryTime = 0) {
		try {
			// Read wellKnownPath
			const { services } = getWellKnownConfig()
			const codebaseIndexerServiceConfig = services.find(
				(service: any) => service.name === this.serverName.split(".")[0],
			)

			if (!codebaseIndexerServiceConfig) {
				throw new Error("Failed to find codebase-indexer service in well-known.json")
			}
			const [isRun] = await this.isRunning(this.serverName)
			if (codebaseIndexerServiceConfig.status !== "running" && !isRun) {
				throw new Error("codebase-indexer service not running!")
			}

			await this.setServerHost(codebaseIndexerServiceConfig)
		} catch (error) {
			this.logger.error(`[CodebaseIndexService] ${error}`)
			// File does not exist, wait and try again
			const interval = retryTime < 300_000 ? 5000 : 30_000
			await new Promise((resolve) => setTimeout(resolve, interval))
			await this.initSubService({ ...versionInfo }, retryTime + interval)
		}
	}

	/**
	 * Format VersionId object to version string
	 * @param versionId Version ID object
	 * @returns Version string
	 * @private
	 */
	private formatVersionId(versionId: VersionId): string {
		return `${versionId?.major}.${versionId?.minor}.${versionId?.micro}`
	}

	/**
	 * Get file storage path information
	 * @param fileName File name
	 * @returns Returns object containing target path, directory and cache directory
	 */
	getTargetPath(fileName: string = this.processName): { targetPath: string; cacheDir: string; homeDir: string } {
		const homeDir = os.homedir()
		if (!homeDir) {
			throw new Error("Failed to determine home directory path")
		}

		const cacheDir = path.join(homeDir, ".costrict", "bin")
		const targetPath = path.join(cacheDir, `${fileName}`)

		return { targetPath, cacheDir, homeDir }
	}

	/**
	 * Publish workspace events
	 * @param request Workspace event request
	 * @param token Access token
	 * @returns Promise<ApiResponse<number>> Returns response data
	 */
	async publishWorkspaceEvents(
		request: WorkspaceEventRequest,
		token?: string,
		keepalive?: boolean,
	): Promise<ApiResponse<number>> {
		this.serverEndpointAndHostCheck()

		const url = `${this.getCodebaseIndexerServerHost(this.serverHost)}/codebase-indexer/api/v1/events`

		const options: RequestInit = {
			method: "POST",
			keepalive,
			body: JSON.stringify(request),
		}

		return this.makeRequest<number>(url, options, token)
	}

	publishSyncWorkspaceEvents<T>(request: WorkspaceEventRequest) {
		const url = `${this.getCodebaseIndexerServerHost(this.serverHost)}/codebase-indexer/api/v1/events`

		const headers = {
			...this.lastHeaders,
			"X-Request-ID": uuidv7(),
			"Content-Type": "application/json",
		} as {
			[key: string]: string
		}

		const httpModule = url.startsWith("https://") ? require("https") : require("http")
		const urlObj = new URL(url)

		const options = {
			hostname: urlObj.hostname,
			port: urlObj.port,
			path: urlObj.pathname + urlObj.search,
			method: "POST",
			headers: headers,
			timeout: 3000,
		}

		try {
			const req = httpModule.request(options)
			req.on("error", (error: Error) => {
				console.error("Failed to send workspace close event:", error.message)
			})
			req.write(JSON.stringify(request))
			req.end()
		} catch (error: any) {
			console.error("Failed to create HTTP request for workspace close event:", error.message)
		}
	}

	/**
	 * Manually trigger index build
	 * @param request Index build request
	 * @param token Access token
	 * @returns Promise<ApiResponse<number>> Returns response data
	 */
	async triggerIndexBuild(request: IndexBuildRequest, token?: string): Promise<ApiResponse<number>> {
		this.serverEndpointAndHostCheck()

		const url = `${this.getCodebaseIndexerServerHost(this.serverHost)}/codebase-indexer/api/v1/index`

		const options: RequestInit = {
			method: "POST",
			body: JSON.stringify(request),
		}

		return this.makeRequest<number>(url, options, token)
	}

	async syncToken(token?: string) {
		// Get token from auth service
		this.serverEndpointAndHostCheck()
		const url = `${this.getCodebaseIndexerServerHost(this.serverHost)}/codebase-indexer/api/v1/token`

		const options: RequestInit = {
			method: "POST",
			body: JSON.stringify({
				clientId: this.clientId,
				accessToken: token,
				serverEndpoint: await this.getServerEndpoint(),
			}),
		}

		return this.makeRequest<number>(url, options, token)
	}
	/**
	 * Health check interface
	 * @param token Access token
	 * @returns Promise<ApiResponse<number>> Returns response data
	 */
	async healthCheck(
		url: string,
		token?: string,
	): Promise<{
		message: string
		status: string | boolean
		[key: string]: any
	}> {
		this.serverEndpointAndHostCheck()

		const options: RequestInit = {
			method: "GET",
		}

		return this.makeRequest(url, options, token) as unknown as {
			message: string
			status: string
			[key: string]: any
		}
	}

	/**
	 * Check ignore files
	 * @param request Ignore files request
	 * @param token Access token
	 * @returns Promise<ApiResponse<boolean>> Returns response data
	 */
	async checkIgnoreFiles(request: IgnoreFilesRequest, token?: string): Promise<ApiResponse<boolean>> {
		this.serverEndpointAndHostCheck()

		const url = `${this.getCodebaseIndexerServerHost(this.serverHost)}/codebase-indexer/api/v1/files/ignore`

		const options: RequestInit = {
			method: "POST",
			body: JSON.stringify(request),
		}

		return this.makeRequest<boolean>(url, options, token)
	}

	/**
	 * Query index status
	 * @param clientId Client ID
	 * @param workspace Workspace path
	 * @param token Access token
	 * @returns Promise<ApiResponse<IndexStatusResponse>> Returns response data
	 */
	async getIndexStatus(workspace: string, token?: string): Promise<ApiResponse<IndexStatusResponse>> {
		this.serverEndpointAndHostCheck()

		const url = `${this.getCodebaseIndexerServerHost(this.serverHost)}/codebase-indexer/api/v1/index/status?workspace=${encodeURIComponent(workspace)}`

		const options: RequestInit = {
			method: "GET",
		}

		return this.makeRequest<IndexStatusResponse>(url, options, token)
	}

	/**
	 * Index function toggle
	 * @param request Toggle request
	 * @param token Access token
	 * @returns Promise<ApiResponse<boolean>> Returns response data
	 */
	async toggleIndexSwitch(request: IndexSwitchRequest, token?: string): Promise<ApiResponse<boolean>> {
		this.serverEndpointAndHostCheck()

		const url = `${this.getCodebaseIndexerServerHost(this.serverHost)}/codebase-indexer/api/v1/switch?workspace=${encodeURIComponent(request.workspace)}&switch=${request.switch}`

		const options: RequestInit = {
			method: "GET",
		}

		return this.makeRequest<boolean>(url, options, token)
	}

	serverEndpointAndHostCheck() {
		if (!this.serverHost) {
			throw new Error("codebase-indexer service not running!")
		}
	}

	getWellKnownConfig() {
		try {
			const { homeDir } = this.getTargetPath()
			const wellKnownPath = path.join(homeDir, ".costrict", "share", ".well-known.json")

			// Check if well-known file exists
			if (!fs.existsSync(wellKnownPath)) {
				return {
					services: [],
				}
			}

			return JSON.parse(fs.readFileSync(wellKnownPath, "utf-8"))
		} catch (error) {
			this.logger.error(`[getWellKnownConfig] ${error.message}`)
			return {
				services: [],
			}
		}
	}

	getCodebaseIndexerServerHost(defaultValue: ICostrictServiceInfo) {
		const service = getServiceConfig(this.serverName)

		return `${service?.protocol || defaultValue?.protocol || "http"}://localhost:${service?.port || defaultValue?.port}`
	}

	getServiceConfig(serverName: string) {
		const { services } = getWellKnownConfig()
		const service = services.find((item: any) => item.name === serverName.split(".")[0])
		return service
	}

	getCostrictServerPort(defaultValue: string | number) {
		const service = getServiceConfig("costrict")

		return service?.port ? service.port : defaultValue
	}
}

// Default export main client class
export default CodebaseIndexClient
