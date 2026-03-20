import * as vscode from "vscode"
import { getActiveFileContext, getOpenTabs } from "./editorContext"
import { getTerminalManager } from "./terminalManager"

/**
 * Context Sync Service
 *
 * Synchronizes VSCode editor context (active file, open tabs) to the CLI HTTP server.
 * The CLI can then use this context to provide better assistance.
 */
export class ContextSyncService {
	private static instance: ContextSyncService | null = null
	private disposables: vscode.Disposable[] = []
	private lastContext: string = ""
	private syncInterval: NodeJS.Timeout | null = null
	private debounceTimer: NodeJS.Timeout | null = null

	private constructor() {}

	static getInstance(): ContextSyncService {
		if (!ContextSyncService.instance) {
			ContextSyncService.instance = new ContextSyncService()
		}
		return ContextSyncService.instance
	}

	/**
	 * Start syncing editor context when the CLI is running.
	 */
	start(): void {
		// Stop any existing listeners
		this.stop()

		// Listen for active editor changes
		this.disposables.push(vscode.window.onDidChangeActiveTextEditor(() => this.debouncedSync()))

		// Listen for selection changes
		this.disposables.push(vscode.window.onDidChangeTextEditorSelection(() => this.debouncedSync()))

		// Listen for tab changes
		this.disposables.push(vscode.window.tabGroups.onDidChangeTabs(() => this.debouncedSync()))

		// Periodic sync as fallback (every 5 seconds)
		this.syncInterval = setInterval(() => this.syncContext(), 5000)

		// Initial sync
		this.syncContext()
	}

	/**
	 * Debounced sync to avoid excessive HTTP requests.
	 */
	public debouncedSync(): void {
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer)
		}
		this.debounceTimer = setTimeout(() => {
			this.syncContext()
			this.debounceTimer = null
		}, 100)
	}

	/**
	 * Sync editor context to the CLI.
	 */
	private async syncContext(): Promise<void> {
		const terminalManager = getTerminalManager()
		const port = terminalManager.getPort()

		// Only sync if CLI is running
		if (!port || !terminalManager.running) {
			return
		}

		const activeFile = getActiveFileContext()
		// Limit to the most recent 10 tabs
		const allTabs = getOpenTabs()
		const openTabs = allTabs.slice(0, 10)

		const contextData = {
			activeFile,
			openTabs,
		}

		// Skip if context hasn't changed (avoid unnecessary requests)
		const contextStr = JSON.stringify(contextData)
		if (contextStr === this.lastContext) {
			return
		}
		this.lastContext = contextStr

		console.log(`[ContextSync] Syncing ${openTabs.length} tabs to CLI on port ${port}`)
		console.log(`[ContextSync] Tabs: ${openTabs.join(", ")}`)

		try {
			const response = await fetch(`http://localhost:${port}/tui/context`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: contextStr,
			})

			if (!response.ok) {
				console.error(`[ContextSync] Failed to sync: ${response.status}`)
			} else {
				console.log(`[ContextSync] Sync successful`)
			}
		} catch (error) {
			// Silently fail - CLI might not be ready yet
			console.error("[ContextSync] Error:", error)
		}
	}

	/**
	 * Stop syncing and clean up resources.
	 */
	stop(): void {
		// Clear debounce timer
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer)
			this.debounceTimer = null
		}

		// Clear interval
		if (this.syncInterval) {
			clearInterval(this.syncInterval)
			this.syncInterval = null
		}

		// Dispose listeners
		this.disposables.forEach((d) => d.dispose())
		this.disposables = []

		// Reset state
		this.lastContext = ""
	}

	/**
	 * Dispose the service completely.
	 */
	dispose(): void {
		this.stop()
		ContextSyncService.instance = null
	}
}

export function getContextSyncService(): ContextSyncService {
	return ContextSyncService.getInstance()
}
