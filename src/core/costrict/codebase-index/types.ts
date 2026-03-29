import { ILogger } from "../../../utils/logger"

/**
 * Version ID interface
 */
export interface VersionId {
	major: number
	minor: number
	micro: number
}

/**
 * Workspace event types
 */
export type WorkspaceEventType =
	| "open_workspace" // Open workspace
	| "close_workspace" // Close workspace
	| "add_file" // Added file
	| "modify_file" // Modified file (editing and saving counts as file modification)
	| "delete_file" // Deleted file/folder
	| "rename_file" // Renamed or moved file/folder

/**
 * Workspace event data
 */
export interface WorkspaceEventData {
	eventType: WorkspaceEventType
	eventTime: number | string
	sourcePath: string
	targetPath?: string
}

/**
 * Workspace event request
 */
export interface WorkspaceEventRequest {
	workspace: string
	data: WorkspaceEventData[]
}

/**
 * Manually trigger index build request
 */
export interface IndexBuildRequest {
	workspace: string
	path: string
	type: "codegraph" | "embedding" | "all"
}

/**
 * Check ignore files request
 */
export interface IgnoreFilesRequest {
	workspacePath: string
	workspaceName: string
	filePaths: string[]
}

/**
 * Index status information
 */
export interface IndexStatusInfo {
	status: "success" | "failed" | "running" | "pending"
	process: number
	totalFiles: number
	totalSucceed: number
	totalFailed: number
	failedReason: string
	failedFiles: string[]
	processTs: number
	totalChunks?: number
}

/**
 * Index status response
 */
export interface IndexStatusResponse {
	embedding: IndexStatusInfo
	codegraph: IndexStatusInfo
}

/**
 * Index function toggle request
 */
export interface IndexSwitchRequest {
	workspace: string
	switch: "on" | "off"
}

/**
 * API common response
 */
export interface ApiResponse<T = any> {
	code: string | number
	message: string
	success: boolean
	data: T
}

/**
 * Request header configuration
 */
export interface RequestHeaders {
	"X-Request-ID": string
	"Client-ID": string
	Authorization: string
	"Server-Endpoint": string
}

/**
 * Version information interface
 */
export interface VersionInfo {
	versionId: VersionId
	appUrl: string
	infoUrl: string
	packageInfo?: PackageInfoResponse
	status?: "downloading" | "downloaded" | "failed"
	updateAt?: number
}

/**
 * Platform response interface
 */
export interface PlatformResponse {
	packageName: string
	os: string
	arch: string
	newest: VersionInfo
	versions: VersionInfo[]
}

/**
 * Package information response interface
 */
export interface PackageInfoResponse {
	packageName: string
	packageType: string
	fileName: string
	os: string
	arch: string
	size: number
	checksum: string
	sign: string
	checksumAlgo: string
	versionId: VersionId
	build: string
	description: string
}

/**
 * CodebaseIndex manager interface
 */
export interface ICodebaseIndexManager {
	/**
	 * Initialize client
	 */
	initialize(): Promise<void>

	/**
	 * Restart client
	 */
	restartClient(): Promise<void>

	/**
	 * Check and upgrade client
	 */
	checkAndUpgradeClient(): Promise<"firstInstall" | "failed" | "upgraded" | "noUpdate" | "needCostrict" | "updating">

	/**
	 * Set logger provider
	 * @param logger Logger provider
	 */
	setLogger(logger: ILogger): void

	/**
	 * Publish workspace events
	 * @param request Workspace event request
	 */
	publishWorkspaceEvents(request: WorkspaceEventRequest): Promise<ApiResponse<number>>

	/**
	 * Manually trigger index build
	 * @param request Index build request
	 */
	triggerIndexBuild(request: IndexBuildRequest): Promise<ApiResponse<number>>

	/**
	 * Health check
	 */
	healthCheck(): Promise<{
		message: string
		status: string | boolean
		[key: string]: any
	}>

	/**
	 * Check ignore files
	 * @param request Ignore files request
	 */
	checkIgnoreFiles(request: IgnoreFilesRequest): Promise<ApiResponse<boolean>>

	/**
	 * Query index status
	 * @param workspace Workspace path
	 */
	getIndexStatus(workspace: string): Promise<ApiResponse<IndexStatusResponse>>

	/**
	 * Index function toggle
	 * @param request Toggle request
	 */
	toggleIndexSwitch(request: IndexSwitchRequest): Promise<ApiResponse<boolean>>
}

/**
 * Client configuration interface
 */
export interface CodebaseIndexClientConfig {
	/**
	 * Download timeout (milliseconds), default is 30000ms (30 seconds)
	 */
	downloadTimeout?: number

	/**
	 * Signature verification public key, uses default public key if not provided
	 */
	publicKey?: string

	getLocalVersion?: () => Promise<VersionInfo | undefined>
}

/**
 * Client download progress information interface
 */
export interface DownloadProgress {
	/**
	 * Number of bytes downloaded
	 */
	downloaded: number
	/**
	 * Total number of bytes
	 */
	total: number
	/**
	 * Download progress percentage (0-100)
	 */
	progress: number
}

/**
 * Client download result interface
 */
export interface DownloadResult {
	/**
	 * Whether successful
	 */
	success: boolean
	/**
	 * File save path
	 */
	filePath?: string
	/**
	 * Error message
	 */
	error?: string
	/**
	 * Version information
	 */
	versionInfo?: VersionInfo
	/**
	 * Package information
	 */
	packageInfo?: PackageInfoResponse
}
export interface ICostrictServiceInfo {
	potolocol: "http" | "https"
	port: number
	[key: string]: any
}
