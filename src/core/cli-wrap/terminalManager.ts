import { exec } from "child_process"

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
	private resolvedCsCommand: string | null = null
	private resolveCsCommandPromise: Promise<string | null> | null = null

	private constructor() {}

	static getInstance(): TerminalManager {
		if (!TerminalManager.instance) {
			TerminalManager.instance = new TerminalManager()
		}
		return TerminalManager.instance
	}

	private logPerf(label: string, start: number) {
		console.info(`[TerminalManager][Perf] ${label}: ${(performance.now() - start).toFixed(1)}ms`)
	}

	private execCommand(command: string, env: Record<string, string>): Promise<string> {
		return new Promise((resolve, reject) => {
			exec(command, { env }, (error, stdout) => {
				if (error) {
					reject(error)
					return
				}
				resolve(stdout.trim())
			})
		})
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

	getEnvs(envs: any) {
		return {
			...process.env,
			COSTRICT_CALLER: "vscode",
			TERM: "xterm-256color",
			COLORTERM: "truecolor",
			...(isJetbrainsPlatform() ? getIdeaShellEnvWithUpdatePath(process.env) : undefined),
			...envs,
		}
	}

	private async resolveCsCommand(env: Record<string, string>): Promise<string | null> {
		if (this.resolvedCsCommand) {
			return this.resolvedCsCommand
		}

		if (this.resolveCsCommandPromise) {
			return this.resolveCsCommandPromise
		}

		this.resolveCsCommandPromise = (async () => {
			const mergedEnv = { ...process.env, ...env } as Record<string, string>

			if (process.platform === "win32") {
				for (const cmd of ["where cs.cmd", "where cs.exe"]) {
					try {
						const output = await this.execCommand(cmd, mergedEnv)
						const cmdPath = output.split(/\r?\n/).find(Boolean)?.trim()
						if (cmdPath) {
							this.resolvedCsCommand = cmdPath
							return cmdPath
						}
					} catch {
						// fall through
					}
				}
				return null
			}

			try {
				const cmdPath = await this.execCommand("which cs", mergedEnv)
				if (cmdPath) {
					this.resolvedCsCommand = cmdPath
					return cmdPath
				}
			} catch {
				// fall through
			}

			return null
		})()

		try {
			return await this.resolveCsCommandPromise
		} finally {
			this.resolveCsCommandPromise = null
		}
	}

	/**
	 * Allocate a random port in the ephemeral range for the CLI HTTP server.
	 */
	private allocatePort(): number {
		return Math.floor(Math.random() * (65535 - 16384 + 1)) + 16384
	}

	async start(options: TerminalOptions): Promise<void> {
		const startTime = performance.now()
		if (this.isRunning) {
			await this.stop()
		}

		// Prepare environment
		let stepStart = performance.now()
		const env = this.getEnvs(options.env)
		this.logPerf("start.getEnvs", stepStart)

		stepStart = performance.now()
		const csCommand = await this.resolveCsCommand(env)
		this.logPerf("start.resolveCsCommand", stepStart)
		if (!csCommand) {
			this.sendToWebview({
				type: "CostrictCliError",
				error: "Costrict CLI is not installed.\r\nPlease install Costrict CLI from https://docs.costrict.ai/en/cli/guide/installation",
			})
			return
		}

		try {
			stepStart = performance.now()
			const ptyModule = await loadPty()
			this.logPerf("start.loadPty", stepStart)

			const workspacePath = getWorkspacePath()
			const cwd = options.cwd || workspacePath || process.cwd()

			// Allocate a port for the CLI HTTP server
			this.port = this.allocatePort()

			stepStart = performance.now()
			// Spawn PTY process with CostrictCli, passing --port for HTTP API access
			this.ptyProcess = ptyModule.spawn(csCommand, ["--port", `${this.port}`], {
				name: "xterm-256color",
				cols: options.cols || 80,
				rows: options.rows || 24,
				cwd,
				env,
			})
			this.logPerf("start.spawn", stepStart)
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
			this.logPerf("start.total", startTime)
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
	async waitForReady(maxRetries = 10, intervalMs = 5000): Promise<boolean> {
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
