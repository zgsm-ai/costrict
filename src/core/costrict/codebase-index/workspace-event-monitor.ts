import * as vscode from "vscode"
import { watch, FSWatcher } from "chokidar"
import { ZgsmCodebaseIndexManager } from "./index"
import { WorkspaceEventData, WorkspaceEventRequest } from "./types"
import { TelemetryService } from "@roo-code/telemetry"
import { CodeBaseError } from "../telemetry/constants"
import { ILogger } from "../../../utils/logger"
import { computeHash } from "../base/common"
import { CoIgnoreController } from "./CoIgnoreController"
import { getWorkspacePath } from "../../../utils/path"
import type { ClineProvider } from "../../webview/ClineProvider"

/**
 * Workspace event monitoring configuration
 */
export interface WorkspaceEventMonitorConfig {
	enabled: boolean
	debounceMs: number
	batchSize: number
	maxRetries: number
	retryDelayMs: number
}

/**
 * Default configuration for codebase-indexer event handling
 */
const DEFAULT_CONFIG: WorkspaceEventMonitorConfig = {
	enabled: true,
	debounceMs: 1000,
	batchSize: 100,
	maxRetries: 2,
	retryDelayMs: 2000,
}

/**
 * Workspace event monitor (singleton pattern)
 * Responsible for monitoring workspace events and pushing them to the server
 */
export class WorkspaceEventMonitor {
	private static instance: WorkspaceEventMonitor
	private isInitialized = false
	private workspaceCache = ""
	private config: WorkspaceEventMonitorConfig = { ...DEFAULT_CONFIG }
	private disposables: vscode.Disposable[] = []
	private eventBuffer: Map<string, WorkspaceEventData> = new Map()
	private flushTimer: NodeJS.Timeout | null = null
	private lastFlushTime = 0
	private logger?: ILogger
	private clineProvider?: ClineProvider
	private ignoreController: CoIgnoreController
	// File system monitor to solve command line file deletion issues
	private fileSystemWatcher: FSWatcher | null = null

	// Document status tracking to solve save issues without content changes
	private documentContentCache: Map<string, { contentHash: string; version: number }> = new Map()

	/**
	 * Private constructor to ensure singleton pattern
	 */
	private constructor() {
		this.ignoreController = new CoIgnoreController(getWorkspacePath())
		this.ignoreController.initialize().catch((error) => {
			this.log.error("[WorkspaceEventMonitor] Failed to initialize ignore controller:", error.message)
		})
	}

	private get log(): ILogger | Console {
		return this.logger || console
	}
	/**
	 * Get singleton instance
	 */
	public static getInstance(): WorkspaceEventMonitor {
		if (!WorkspaceEventMonitor.instance) {
			WorkspaceEventMonitor.instance = new WorkspaceEventMonitor()
		}
		return WorkspaceEventMonitor.instance
	}

	/**
	 * Initialize event monitor
	 */
	public async initialize(): Promise<void> {
		if (this.isInitialized) {
			this.log.info("[WorkspaceEventMonitor] Event monitor already initialized, skipping")
			return
		}

		try {
			this.log.info("[WorkspaceEventMonitor] Starting to initialize event monitor")

			// Register VSCode event listeners
			this.registerEventListeners()

			// Handle currently opened workspaces
			this.handleInitialWorkspaceOpen()

			this.isInitialized = true
			this.log.info("[WorkspaceEventMonitor] Event monitor initialized successfully")
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Unknown error occurred while initializing event monitor"
			this.log.error("[WorkspaceEventMonitor] Initialization failed:", errorMessage)
			// Skip telemetry service in test environment
			try {
				if (TelemetryService.instance) {
					TelemetryService.instance.captureError(CodeBaseError.SyncFailed)
				}
			} catch {
				// Ignore telemetry service related errors
			}
			throw new Error(errorMessage)
		}
	}

	/**
	 * Handle VSCode close event
	 */
	public handleVSCodeClose() {
		this.log.info("[WorkspaceEventMonitor] VSCode close event detected")

		// Send workspace close events
		ZgsmCodebaseIndexManager.getInstance().client?.publishSyncWorkspaceEvents({
			workspace: this.workspaceCache,
			data: [
				{
					eventType: "close_workspace",
					eventTime: `${Date.now()}`,
					sourcePath: "",
					targetPath: "",
				},
			],
		})

		// Continue to destroy event monitor
		this.dispose()
	}

	/**
	 * Destroy event monitor
	 */
	public async dispose() {
		this.log.info("[WorkspaceEventMonitor] Starting to destroy event monitor")
		// Cancel timers
		if (this.flushTimer) {
			clearTimeout(this.flushTimer)
			this.flushTimer = null
		}

		// Clean up event listeners
		this.disposables.forEach((disposable) => disposable.dispose())
		this.disposables = []

		// Close file system monitor
		if (this.fileSystemWatcher) {
			this.fileSystemWatcher.close()
			this.fileSystemWatcher = null
			this.log.info("[WorkspaceEventMonitor] File system monitor closed")
		}

		// Clean up document content cache
		this.documentContentCache.clear()
		this.log.info("[WorkspaceEventMonitor] Document content cache cleared")

		// Send remaining events
		if (this.eventBuffer.size > 0) {
			await this.flushEventsSync()
		}

		this.isInitialized = false
		this.log.info("[WorkspaceEventMonitor] Event monitor disposed")
	}

	/**
	 * Update configuration
	 */
	public updateConfig(newConfig: Partial<WorkspaceEventMonitorConfig>): void {
		this.config = { ...this.config, ...newConfig }
		this.log.info("[WorkspaceEventMonitor] Configuration updated:", this.config)
	}

	/**
	 * Register event listeners
	 */
	private registerEventListeners(): void {
		// Safely check if VSCode API exists
		if (typeof vscode === "undefined" || !vscode.workspace) {
			this.log.warn("[WorkspaceEventMonitor] VSCode API not available, skipping event listener registration")
			return
		}

		try {
			// File save event
			if (vscode.workspace.onDidSaveTextDocument) {
				this.disposables.push(vscode.workspace.onDidSaveTextDocument(this.handleDocumentSave.bind(this)))
			}

			// File delete/rename events
			if (vscode.workspace.onDidDeleteFiles) {
				this.disposables.push(vscode.workspace.onDidDeleteFiles(this.handleFileDelete.bind(this)))
			}
			if (vscode.workspace.onDidRenameFiles) {
				this.disposables.push(vscode.workspace.onDidRenameFiles(this.handleFileRename.bind(this)))
			}

			// Workspace folder change events
			if (vscode.workspace.onDidChangeWorkspaceFolders) {
				this.disposables.push(
					vscode.workspace.onDidChangeWorkspaceFolders(this.handleWorkspaceChange.bind(this)),
				)
			}

			// Extension activation event
			if (vscode.workspace.onWillCreateFiles) {
				this.disposables.push(vscode.workspace.onWillCreateFiles(this.handleWillCreateFiles.bind(this)))
			}

			// Register file system monitor to solve command line file deletion issues
			this.registerFileSystemWatcher()
		} catch (error) {
			this.log.warn("[WorkspaceEventMonitor] Failed to register event listeners:", error)
		}
	}

	/**
	 * Register file system monitor
	 */
	private registerFileSystemWatcher(): void {
		const workspaceFolders = vscode.workspace.workspaceFolders
		if (!workspaceFolders || workspaceFolders.length === 0) {
			this.log.warn("[WorkspaceEventMonitor] No workspace folders, skipping file system monitor registration")
			return
		}

		// Monitor all workspace folders
		const watchPaths = workspaceFolders.map((folder) => folder.uri.fsPath)

		try {
			this.fileSystemWatcher = watch(watchPaths, {
				ignored: /(^|[\/\\])\../, // Ignore hidden files
				persistent: true,
				ignoreInitial: true, // Ignore initial scan
				awaitWriteFinish: {
					stabilityThreshold: 1000,
					pollInterval: 100,
				},
			})

			// Listen for file delete events
			this.fileSystemWatcher?.on("unlink", (filePath: string) => {
				this.handleFileSystemFileDelete(filePath)
			})

			this.log.info(
				`[WorkspaceEventMonitor] File system monitor registered, monitoring paths: ${watchPaths.join(", ")}`,
			)
		} catch (error) {
			this.log.error("[WorkspaceEventMonitor] Failed to register file system monitor:", error)
		}
	}

	/**
	 * Handle file delete event detected by file system
	 */
	private async handleFileSystemFileDelete(filePath: string) {
		if (!this.ignoreController.validateAccess(filePath)) return
		if (!(await this.ensureServiceEnabled())) return

		const eventKey = `delete:${filePath}`
		const eventData: WorkspaceEventData = {
			eventType: "delete_file",
			eventTime: `${Date.now()}`,
			sourcePath: filePath,
			targetPath: "",
		}

		this.addEvent(eventKey, eventData)
	}

	/**
	 * Handle document save event
	 */
	private async handleDocumentSave(document: vscode.TextDocument) {
		if (!(await this.ensureServiceEnabled())) return

		const uri = document.uri

		if (uri.scheme !== "file") return

		const filePath = uri.fsPath
		if (!this.ignoreController.validateAccess(filePath)) return
		const currentContentHash = computeHash(document.getText())
		const currentVersion = document.version

		// Debug log: record save event trigger
		this.log.info(`[WorkspaceEventMonitor] Document save event triggered: ${filePath}`)

		// Check if document content really changed
		const cachedInfo = this.documentContentCache.get(filePath)
		let hasContentChanged = false

		if (cachedInfo) {
			// Compare content
			hasContentChanged = cachedInfo.contentHash !== currentContentHash
			// this.log.info(
			// 	`[WorkspaceEventMonitor] Content ${hasContentChanged ? "Changed" : "No change"}`,
			// )
		} else {
			hasContentChanged = true
			// this.log.info(`[WorkspaceEventMonitor] First time saving document, no cache information`)
		}

		// Update cache
		this.documentContentCache.set(filePath, {
			contentHash: currentContentHash,
			version: currentVersion,
		})

		// Only trigger event when content really changes
		if (!hasContentChanged) {
			this.log.info(`[WorkspaceEventMonitor] Document content unchanged, skipping event trigger`)
			return
		}
		// this.log.info(`[WorkspaceEventMonitor] Triggering modify event`)
		const eventKey = `modify:${filePath}`
		const eventData: WorkspaceEventData = {
			eventType: "modify_file",
			eventTime: `${Date.now()}`,
			sourcePath: filePath,
			targetPath: filePath,
		}

		this.addEvent(eventKey, eventData)
	}

	/**
	 * Handle file delete event
	 */
	private async handleFileDelete(event: vscode.FileDeleteEvent) {
		if (!(await this.ensureServiceEnabled())) return

		// Debug log: record delete event trigger
		this.log.info(
			`[WorkspaceEventMonitor] File delete event triggered, number of deleted files: ${event.files.length}`,
		)

		event.files.forEach((uri) => {
			if (!this.ignoreController.validateAccess(uri.fsPath)) return
			if (uri.scheme !== "file") return

			this.log.info(`[WorkspaceEventMonitor] Deleting file: ${uri.fsPath}`)

			const eventKey = `delete:${uri.fsPath}`
			const eventData: WorkspaceEventData = {
				eventType: "delete_file",
				eventTime: `${Date.now()}`,
				sourcePath: uri.fsPath,
				targetPath: "",
			}

			this.addEvent(eventKey, eventData)
		})
	}

	/**
	 * Handle file rename/move event
	 */
	private async handleFileRename(event: vscode.FileRenameEvent) {
		if (!(await this.ensureServiceEnabled())) return

		event.files.forEach(({ oldUri, newUri }) => {
			if (!this.ignoreController.validateAccess(newUri.fsPath)) return
			if (oldUri.scheme !== "file" || newUri.scheme !== "file") return

			const eventKey = `rename:${oldUri.fsPath}:${newUri.fsPath}`
			const eventData: WorkspaceEventData = {
				eventType: "rename_file",
				eventTime: `${Date.now()}`,
				sourcePath: oldUri.fsPath,
				targetPath: newUri.fsPath,
			}

			this.addEvent(eventKey, eventData)
		})
	}

	/**
	 * Handle workspace change event
	 */
	private async handleWorkspaceChange(event: vscode.WorkspaceFoldersChangeEvent) {
		if (!(await this.ensureServiceEnabled())) return

		// Handle added workspaces
		event.added.forEach((folder) => {
			if (!this.ignoreController.validateAccess(folder.uri.fsPath)) return
			const eventKey = `workspace:open:${folder.uri.fsPath}`
			const eventData: WorkspaceEventData = {
				eventType: "open_workspace",
				eventTime: `${Date.now()}`,
				sourcePath: "",
			}
			this.addEvent(eventKey, eventData)
		})

		// Handle removed workspaces
		event.removed.forEach((folder) => {
			if (!this.ignoreController.validateAccess(folder.uri.fsPath)) return
			const eventKey = `workspace:close:${folder.uri.fsPath}`
			const eventData: WorkspaceEventData = {
				eventType: "close_workspace",
				eventTime: `${Date.now()}`,
				sourcePath: "",
			}
			this.addEvent(eventKey, eventData)
		})
	}

	/**
	 * Handle file creation event
	 */
	private async handleWillCreateFiles(event: vscode.FileWillCreateEvent) {
		if (!(await this.ensureServiceEnabled())) return

		event.files.forEach((uri) => {
			if (!this.ignoreController.validateAccess(uri.fsPath)) return
			if (uri.scheme !== "file") return

			const eventKey = `create:${uri.fsPath}`
			const eventData: WorkspaceEventData = {
				eventType: "add_file",
				eventTime: `${Date.now()}`,
				sourcePath: "",
				targetPath: uri.fsPath,
			}

			this.addEvent(eventKey, eventData)
		})
	}

	/**
	 * Handle workspace initial open event
	 */
	private async handleInitialWorkspaceOpen() {
		if (!(await this.ensureServiceEnabled())) return

		const workspaceFolders = vscode.workspace.workspaceFolders
		if (!workspaceFolders || workspaceFolders.length === 0) {
			return
		}

		workspaceFolders.forEach((folder) => {
			if (!this.ignoreController.validateAccess(folder.uri.fsPath)) return
			const eventKey = `workspace:initial:${folder.uri.fsPath}`
			const eventData: WorkspaceEventData = {
				eventType: "open_workspace",
				eventTime: `${Date.now()}`,
				sourcePath: "",
			}
			this.addEvent(eventKey, eventData)
		})
	}

	/**
	 * Add event to buffer
	 */
	private addEvent(key: string, event: WorkspaceEventData): void {
		// Deduplication: use event key as unique identifier
		this.eventBuffer.set(key, event)

		// Check if immediate flush is needed
		const now = Date.now()
		if (now - this.lastFlushTime >= this.config.debounceMs) {
			this.scheduleFlush()
		} else if (this.eventBuffer.size >= this.config.batchSize) {
			// If buffer is full, flush immediately
			this.flushEvents()
		}
	}

	/**
	 * Schedule event flush
	 */
	private scheduleFlush(): void {
		if (this.flushTimer) {
			clearTimeout(this.flushTimer)
		}

		this.flushTimer = setTimeout(async () => {
			try {
				await this.flushEvents()
			} catch (error) {
				this.log.error("[WorkspaceEventMonitor] Error occurred while flushing events:", error)
				// Ensure timer is reset even in error case
			} finally {
				this.flushTimer = null
			}
		}, this.config.debounceMs)
	}

	/**
	 * Flush events to server
	 */
	private async flushEvents(): Promise<void> {
		if (this.eventBuffer.size === 0) return

		// Get current workspace
		const workspace = this.getCurrentWorkspace()
		if (!workspace) {
			this.log.warn("[WorkspaceEventMonitor] Unable to determine current workspace")
			return
		}

		// Prepare event data
		const events = Array.from(this.eventBuffer.values())
		this.eventBuffer.clear()
		this.lastFlushTime = Date.now()

		if (this.flushTimer) {
			clearTimeout(this.flushTimer)
			this.flushTimer = null
		}

		// Send to server
		await this.sendEventsToServer(workspace, events)
	}

	/**
	 * Synchronously flush events to server (for emergency sending when VSCode closes)
	 */
	private async flushEventsSync(): Promise<void> {
		if (this.eventBuffer.size === 0) return

		// Get current workspace
		const workspace = this.getCurrentWorkspace()
		if (!workspace) {
			this.log.warn("[WorkspaceEventMonitor] Unable to determine current workspace")
			return
		}

		// Prepare event data
		const events = Array.from(this.eventBuffer.values())
		this.eventBuffer.clear()
		this.lastFlushTime = Date.now()

		if (this.flushTimer) {
			clearTimeout(this.flushTimer)
			this.flushTimer = null
		}

		// Send to server
		await this.sendEventsToServer(workspace, events)
	}

	/**
	 * Send events to server
	 */
	private async sendEventsToServer(workspace: string, events: WorkspaceEventData[]): Promise<void> {
		if (events.length === 0) return

		const request: WorkspaceEventRequest = {
			workspace,
			data: events,
		}
		const evts = [...new Set(events.map((v) => v.eventType))].join()
		let retryCount = 0
		const startTime = Date.now()
		const maxTotalRetryTime = 30000 // 30 seconds total retry time limit

		while (retryCount <= this.config.maxRetries) {
			try {
				const response = await ZgsmCodebaseIndexManager.getInstance().publishWorkspaceEvents(request)

				if (response.success) {
					this.log.info(
						`[WorkspaceEventMonitor] ${evts} events sent successfully, response: ${response.data}`,
					)
					return
				} else {
					this.log.warn(`[WorkspaceEventMonitor] ${evts} events send failed: ${response.message}`)
				}
			} catch (error) {
				// Check if total retry time limit is reached (prevent infinite loop)
				const elapsedTime = Date.now() - startTime
				if (elapsedTime >= maxTotalRetryTime) {
					this.log.error(
						`[WorkspaceEventMonitor] ${evts} reached total retry time limit(${maxTotalRetryTime}ms), giving up`,
					)
					break
				}

				if (retryCount < this.config.maxRetries) {
					// Use exponential backoff strategy
					const delayMs = Math.min(
						this.config.retryDelayMs * Math.pow(2, retryCount),
						10000, // Maximum delay 10 seconds
					)
					// this.log.error(`[WorkspaceEventMonitor] ${evts} Failed to send event (retry after ${delayMs}ms):`, errorMessage)
					this.log.info(
						`[WorkspaceEventMonitor] ${evts} ${retryCount + 1}/${this.config.maxRetries} retry failed`,
					)
					await this.delay(delayMs)
					retryCount++
				} else {
					this.log.error(
						`[WorkspaceEventMonitor] ${evts} reached maximum retry count(${this.config.maxRetries}), event send failed`,
					)
					try {
						TelemetryService.instance?.captureError?.(CodeBaseError.SyncFailed)
					} catch {
						// Ignore telemetry service related errors
					}
					break // Explicitly exit loop
				}
			}
		}
	}

	/**
	 * Get current workspace path
	 */
	private getCurrentWorkspace(): string | null {
		const workspaceFolders = vscode.workspace.workspaceFolders
		if (!workspaceFolders || workspaceFolders.length === 0) {
			return null
		}
		this.workspaceCache = workspaceFolders[0].uri.fsPath
		// If there are multiple workspaces, use the first one
		return this.workspaceCache
	}

	/**
	 * Delay function
	 */
	private delay(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms))
	}

	public setLogger(logger: ILogger): void {
		this.logger = logger
	}
	public setProvider(clineProvider: ClineProvider): void {
		this.clineProvider = clineProvider
	}
	/**
	 * Get current status
	 */
	public getStatus(): {
		isInitialized: boolean
		eventBufferSize: number
		config: WorkspaceEventMonitorConfig
	} {
		return {
			isInitialized: this.isInitialized,
			eventBufferSize: this.eventBuffer.size,
			config: { ...this.config },
		}
	}

	private async ensureServiceEnabled() {
		if (!this.clineProvider) {
			return false
		}

		const { apiConfiguration } = await this.clineProvider.getState()

		if (apiConfiguration.apiProvider !== "zgsm" || !apiConfiguration.zgsmCodebaseIndexEnabled) {
			return false
		}

		return this.config.enabled
	}
}

/**
 * Global workspace event monitor instance
 */
export const workspaceEventMonitor = WorkspaceEventMonitor.getInstance()
