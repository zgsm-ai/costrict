import { execSync } from "child_process"

import { getIdeaShellEnvWithUpdatePath } from "../../utils/ideaShellEnvLoader"
import { getWorkspacePath } from "../../utils/path"
import { isJetbrainsPlatform } from "../../utils/platform"
import { getContextSyncService } from "./contextSync"

// Lazy load node-pty to avoid blocking extension activation if module is missing
let pty: typeof import("node-pty") | null = null

async function loadPty(): Promise<typeof import("node-pty")> {
	if (!pty) {
		pty = await import("node-pty")
	}
	return pty
}

export interface TerminalOptions {
	cols: number
	rows: number
	cwd?: string
	env?: Record<string, string>
}

export type MessageSender = (message: any) => Promise<void> | void

interface IPty {
	write(data: string): void
	resize(cols: number, rows: number): void
	kill(): void
	onData(listener: (data: string) => void): void
	onExit(listener: (e: { exitCode: number }) => void): void
}

export class TerminalManager {
	private static instance: TerminalManager | null = null
	private ptyProcess: IPty | null = null
	private messageSender: MessageSender | null = null
	private isRunning = false
	private port: number | null = null

	private constructor() {}

	static getInstance(): TerminalManager {
		if (!TerminalManager.instance) {
			TerminalManager.instance = new TerminalManager()
		}
		return TerminalManager.instance
	}

	setMessageSender(sender: MessageSender) {
		this.messageSender = sender
	}

	/**
	 * Returns the HTTP port the CLI is listening on, or null if not available.
	 */
	getPort() {
		return this.port
	}

	private isCsInstalled(env: any): boolean {
		try {
			const cmd = process.platform === "win32" ? "where cs" : "which cs"
			execSync(cmd, { stdio: "ignore", env: { ...process.env, ...env } })
			return true
		} catch {
			return false
		}
	}

	/**
	 * Allocate a random port in the ephemeral range for the CLI HTTP server.
	 */
	private allocatePort(): number {
		return Math.floor(Math.random() * (65535 - 16384 + 1)) + 16384
	}

	async start(options: TerminalOptions): Promise<void> {
		if (this.isRunning) {
			await this.stop()
		}

		// Prepare environment
		const env = {
			...process.env,
			COSTRICT_CALLER: "vscode",
			TERM: "xterm-256color",
			COLORTERM: "truecolor",
			...(isJetbrainsPlatform() ? getIdeaShellEnvWithUpdatePath(process.env) : undefined),
			...options.env,
		}

		if (!this.isCsInstalled(env)) {
			this.sendToWebview({
				type: "CostrictCliError",
				error: "Costrict CLI is not installed.\r\nPlease install Costrict CLI from https://docs.costrict.ai/en/cli/guide/installation",
			})
			return
		}

		try {
			const ptyModule = await loadPty()
			const workspacePath = getWorkspacePath()
			const cwd = options.cwd || workspacePath || process.cwd()

			// Allocate a port for the CLI HTTP server
			this.port = this.allocatePort()
			// Spawn PTY process with CostrictCli, passing --port for HTTP API access
			this.ptyProcess = ptyModule.spawn(
				process.platform === "win32" ? "cs.exe" : "cs",
				["--port", `${this.port}`],
				{
					name: "xterm-256color",
					cols: options.cols || 80,
					rows: options.rows || 24,
					cwd,
					env,
				},
			)
			if (!this.ptyProcess) {
				throw new Error("Terminal process could not be started, please restart CLI")
			}

			this.isRunning = true

			// Start syncing editor context to CLI
			getContextSyncService().start()

			// Handle output from the process
			this.ptyProcess.onData((data: string) => {
				this.sendToWebview({ type: "CostrictCliOutput", data })
			})

			// Handle process exit
			this.ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
				this.isRunning = false
				this.ptyProcess = null
				this.port = null
				this.sendToWebview({ type: "CostrictCliExit", exitCode })
			})
		} catch (error) {
			this.port = null
			const errorMessage = error instanceof Error ? error.message : String(error)
			this.sendToWebview({ type: "CostrictCliError", error: errorMessage })
			throw error
		}
	}

	/**
	 * Wait for the CLI HTTP server to become ready.
	 * Polls the /app endpoint up to maxRetries times with the given interval.
	 * Returns true if the server is reachable, false otherwise.
	 */
	async waitForReady(maxRetries = 10, intervalMs = 200): Promise<boolean> {
		if (!this.port) {
			return false
		}
		for (let i = 0; i < maxRetries; i++) {
			try {
				await fetch(`http://localhost:${this.port}/app`)
				return true
			} catch {
				// Not ready yet
			}
			await new Promise((resolve) =>
				setTimeout(() => {
					resolve(true)
					getContextSyncService().syncContext()
				}, intervalMs),
			)
		}
		return false
	}

	// /**
	//  * Inject text into the CLI prompt via the HTTP API.
	//  * Throws if the port is not available or the request fails.
	//  */
	// async appendPrompt(text: string): Promise<void> {
	// 	if (!this.port) {
	// 		throw new Error("CLI HTTP port is not available")
	// 	}
	// 	const response = await fetch(`http://localhost:${this.port}/tui/append-prompt`, {
	// 		method: "POST",
	// 		headers: { "Content-Type": "application/json" },
	// 		body: JSON.stringify({ text }),
	// 	})
	// 	if (!response.ok) {
	// 		throw new Error(`appendPrompt failed: ${response.status} ${response.statusText}`)
	// 	}
	// }

	async write(data: string): Promise<void> {
		if (this.ptyProcess && this.isRunning) {
			this.ptyProcess.write(data)
		}
	}

	async resize(cols: number, rows: number): Promise<void> {
		if (this.ptyProcess && this.isRunning) {
			this.ptyProcess.resize(cols, rows)
		}
	}

	async stop(): Promise<void> {
		// Stop syncing editor context
		getContextSyncService().stop()

		if (this.ptyProcess) {
			try {
				this.ptyProcess.kill()
			} catch (error) {
				// Log error but continue cleanup
				const errorMessage = error instanceof Error ? error.message : String(error)
				console.error(`[TerminalManager] Error killing process: ${errorMessage}`)
			}
			this.ptyProcess = null
			this.isRunning = false
			this.port = null
		}
	}

	async restart(options: TerminalOptions): Promise<void> {
		await this.stop()
		await this.start(options)
	}

	get running(): boolean {
		return this.isRunning
	}

	private getShell(): string {
		if (process.platform === "win32") {
			return process.env.COMSPEC || "cmd.exe"
		}
		return process.env.SHELL || "/bin/bash"
	}

	private sendToWebview(message: any): void {
		if (this.messageSender) {
			this.messageSender(message)
		}
	}

	dispose(): void {
		this.stop()
		TerminalManager.instance = null
	}
}

export function getTerminalManager(): TerminalManager {
	return TerminalManager.getInstance()
}
