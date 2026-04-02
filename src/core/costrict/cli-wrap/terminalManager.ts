import { execSync, type ExecSyncOptionsWithStringEncoding } from "child_process"

import { getIdeaShellEnvWithUpdatePath } from "../../../utils/ideaShellEnvLoader"
import { getWorkspacePath } from "../../../utils/path"
import { isJetbrainsPlatform } from "../../../utils/platform"
import { getContextSyncService } from "./contextSync"
import { getShell } from "../../../utils/shell"

const COSTRICT_CLI_INSTALL_DOCS_URL = "https://docs.costrict.ai/en/cli/guide/installation"

export type CostrictCliErrorKind = "missing-cli" | "start-failed" | "startup-timeout"

const getCostrictCliErrorPayload = (
	kind: Extract<CostrictCliErrorKind, "missing-cli" | "start-failed">,
	fallbackError?: string,
) => {
	const normalizedError = fallbackError?.trim()

	if (kind === "missing-cli") {
		return {
			error: `CoStrict CLI was not found on this machine.\r\nInstall it first: ${COSTRICT_CLI_INSTALL_DOCS_URL}`,
			values: {
				kind,
				docsUrl: COSTRICT_CLI_INSTALL_DOCS_URL,
			},
		}
	}

	return {
		error: normalizedError ?? "CoStrict CLI failed to start.",
		values: {
			kind,
		},
	}
}

export const getCostrictCliInstallDocsUrl = () => COSTRICT_CLI_INSTALL_DOCS_URL

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
	kill(signal?: string): void
	onData(listener: (data: string) => void): void
	onExit(listener: (e: { exitCode: number }) => void): void
}

export class TerminalManager {
	private static instance: TerminalManager | null = null
	private ptyProcess: IPty | null = null
	private messageSender: MessageSender | null = null
	private isRunning = false
	private port: number | null = null
	private exitHandler: (() => void) | null = null

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

	private isCsInstalled(env: any): boolean {
		try {
			const cmd = process.platform === "win32" ? "where cs" : "which cs"
			execSync(cmd, { stdio: "ignore", env: { ...process.env, ...env } })
			return true
		} catch {
			return false
		}
	}

	private getCsCommand(): string {
		const shell = getShell()
		const opt = {
			stdio: "pipe",
			encoding: "utf-8",
			// shell,
			env: this.getEnvs({}),
		} as ExecSyncOptionsWithStringEncoding

		if (process.platform === "win32") {
			try {
				const cmdPath = execSync("where cs.cmd", opt).trim().split("\r\n")[0]
				if (cmdPath) {
					return cmdPath
				}
			} catch {
				// fall through
			}
			try {
				const cmdPath = execSync("where cs.exe", opt).trim().split("\r\n")[0]
				if (cmdPath) {
					return cmdPath
				}
			} catch {
				// fall through
			}

			return "cs.exe"
		}

		try {
			const cmdPath = execSync("which cs", opt).trim()
			if (cmdPath) {
				return cmdPath
			}
		} catch {
			// fall through
		}

		return "cs"
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
		const env = this.getEnvs(options.env)

		if (!this.isCsInstalled(env)) {
			this.port = null
			this.sendToWebview({
				type: "CostrictCliError",
				...getCostrictCliErrorPayload("missing-cli"),
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
			this.ptyProcess = ptyModule.spawn(this.getCsCommand(), ["--port", `${this.port}`], {
				name: "xterm-256color",
				cols: options.cols || 80,
				rows: options.rows || 24,
				cwd,
				env,
			})
			if (!this.ptyProcess) {
				throw new Error("Terminal process could not be started, please restart CLI")
			}

			this.isRunning = true

			// Register exit handler to kill PTY child process if Node.js exits unexpectedly
			this.exitHandler = () => {
				try {
					this.ptyProcess?.kill()
				} catch {
					// Ignore errors, process may have already exited
				}
			}
			process.on("exit", this.exitHandler)

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
				// Clean up exit handler to avoid dangling listener
				if (this.exitHandler) {
					process.removeListener("exit", this.exitHandler)
					this.exitHandler = null
				}
				this.sendToWebview({ type: "CostrictCliExit", exitCode })
			})
		} catch (error) {
			this.port = null
			// Clean up exit handler if it was registered before the error
			if (this.exitHandler) {
				process.removeListener("exit", this.exitHandler)
				this.exitHandler = null
			}
			const errorMessage = error instanceof Error ? error.message : String(error)
			const errorCode = error && typeof error === "object" ? (error as NodeJS.ErrnoException).code : undefined
			const errorKind =
				errorCode === "ENOENT" || /spawn .*ENOENT|not found|no such file or directory/i.test(errorMessage)
					? "missing-cli"
					: "start-failed"
			this.sendToWebview({
				type: "CostrictCliError",
				...getCostrictCliErrorPayload(errorKind, errorMessage),
			})
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

	async stop(signal?: string): Promise<void> {
		// Remove exit handler to avoid dangling reference
		if (this.exitHandler) {
			process.removeListener("exit", this.exitHandler)
			this.exitHandler = null
		}

		// Stop syncing editor context
		getContextSyncService().stop()

		if (this.ptyProcess) {
			try {
				this.ptyProcess.kill(signal)
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
