import * as vscode from "vscode"
import { getActiveFileContext, getOpenTabs } from "./editorContext"
import { getTerminalManager } from "./terminalManager"
import { FileContext } from "./types"

/**
 * Context Sync Service
 *
 * Synchronizes VSCode editor context (active file, open tabs) to the CLI HTTP server.
 * The CLI can then use this context to provide better assistance.
 */
export class ContextSyncService {
	private static instance: ContextSyncService | null = null
	private disposables: vscode.Disposable[] = []
	private lastContext: { activeFile?: FileContext; openTabs: string[]; timestamp?: number }[] = []
	private syncInterval: NodeJS.Timeout | null = null
	private debounceTimer: NodeJS.Timeout | null = null
	private _paused: boolean = false

	private constructor() {}

	static getInstance(force = true): ContextSyncService | null {
		if (!ContextSyncService.instance && force) {
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
		this.disposables.push(
			vscode.window.onDidChangeActiveTextEditor(() => this.syncContext("onDidChangeActiveTextEditor")),
		)

		// Listen for selection changes
		this.disposables.push(
			vscode.window.onDidChangeTextEditorSelection(() => this.syncContext("onDidChangeTextEditorSelection")),
		)

		// Listen for tab changes
		this.disposables.push(vscode.window.tabGroups.onDidChangeTabs(() => this.syncContext("onDidChangeTabs")))

		// Periodic sync as fallback (every 5 seconds)
		// this.syncInterval = setInterval(() => this.debouncedSync(), 5000)

		// Initial sync
		this.syncContext()
	}

	/**
	 * Debounced sync to avoid excessive HTTP requests.
	 */
	private async debouncedSync(port?: number | string) {
		// Check if there's any context to sync
		if (this.lastContext.length === 0) {
			return
		}

		try {
			const contextData = this.lastContext.pop()
			if (!contextData) {
				return
			}

			const response = await fetch(`http://localhost:${port}/tui/context`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(contextData),
			})

			if (!response.ok) {
				console.error(`[ContextSync] Failed to sync: ${response.status}`)
			} else {
				console.log(`[ContextSync] Sync successful`)
			}
		} catch (error) {
			// Log error but don't throw - CLI might not be ready yet
			console.error("[ContextSync] Error syncing context:", error)
		}
	}

	/**
	 * Sync editor context to the CLI.
	 */
	public async syncContext(eventType?: string): Promise<void> {
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer)
			this.debounceTimer = null
		}
		const terminalManager = getTerminalManager()
		const port = terminalManager.getPort()

		// Only sync if CLI is running
		if (!port || !terminalManager.running) {
			return
		}

		if (this._paused) {
			console.log(`[ContextSync] Paused, not syncing context`)
			return
		}

		const activeFile = getActiveFileContext()
		// Limit to the most recent 10 tabs
		const allTabs = getOpenTabs()
		const openTabs = allTabs.slice(0, 10)
		if (this.lastContext.length >= 5) {
			this.lastContext.shift()
		}
		this.lastContext.push({ activeFile, openTabs, timestamp: Date.now() })
		this.debounceTimer = setTimeout(() => {
			this.debouncedSync(port)
		}, 500)
	}

	/**
	 * Pause syncing without disposing event listeners.
	 * Useful when the cs-cli tab is active and context sync is not needed.
	 */
	pause(): void {
		this._paused = true
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer)
			this.debounceTimer = null
		}
	}

	/**
	 * Resume syncing and immediately sync the latest context.
	 */
	resume(): void {
		this._paused = false
		this.syncContext()
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
		this._paused = false
		this.lastContext = []
	}

	/**
	 * Dispose the service completely.
	 */
	dispose(): void {
		this.stop()
		ContextSyncService.instance = null
	}
}

export function getContextSyncService(force = true): ContextSyncService | null {
	return ContextSyncService.getInstance(force)
}
