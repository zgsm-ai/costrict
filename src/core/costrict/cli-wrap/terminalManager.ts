import { execSync, type ExecSyncOptionsWithStringEncoding } from "child_process"

import { getIdeaShellEnvWithUpdatePath } from "../../../utils/ideaShellEnvLoader"
import { getWorkspacePath } from "../../../utils/path"
import { isJetbrainsPlatform } from "../../../utils/platform"
import { getContextSyncService } from "./contextSync"
import { getShell } from "../../../utils/shell"
import * as vscode from "vscode"

const COSTRICT_CLI_INSTALL_DOCS_URL = "https://docs.costrict.ai/en/cli/guide/installation"

// Workspace storage key for tracking CLI ports across sessions
const COSTRICT_CLI_PORTS_KEY = "costrictCliPorts"

/**
 * Find the PID of the process listening on a given port.
 * Returns the PID, or null if no process is found.
 */
function findPidByPort(port: number): number | null {
	try {
		if (process.platform === "win32") {
			const result = execSync(`netstat -ano | findstr :${port} | findstr LISTENING`, {
				encoding: "utf-8",
				stdio: ["pipe", "pipe", "ignore"],
			})
			const line = result
				.trim()
				.split("\n")
				.find((l) => l.trim())
			if (line) {
				const parts = line.trim().split(/\s+/)
				const pid = parseInt(parts[parts.length - 1], 10)
				if (pid && !isNaN(pid)) {
					return pid
				}
			}
		} else {
			const result = execSync(`lsof -ti:${port} -sTCP:LISTEN`, {
				encoding: "utf-8",
				stdio: ["pipe", "pipe", "ignore"],
			})
			const pid = parseInt(result.trim().split("\n")[0], 10)
			if (!isNaN(pid)) {
				return pid
			}
		}
	} catch {
		// No process found on this port
	}
	return null
}

/**
 * Check if a given PID belongs to a CoStrict CLI (cs) process.
 */
function isCsProcess(pid: number): boolean {
	try {
		if (process.platform === "win32") {
			const result = execSync(`wmic process where ProcessId=${pid} get CommandLine /format:list`, {
				encoding: "utf-8",
				stdio: ["pipe", "pipe", "ignore"],
			})
			return /\bcs(\.exe|\.cmd)?\b/i.test(result)
		} else {
			// Read /proc/<pid>/cmdline first (Linux), fall back to ps (macOS)
			try {
				const cmdline = execSync(`cat /proc/${pid}/cmdline`, {
					encoding: "utf-8",
					stdio: ["pipe", "pipe", "ignore"],
				})
				return /\bcs\b/.test(cmdline)
			} catch {
				const result = execSync(`ps -p ${pid} -o comm=`, {
					encoding: "utf-8",
					stdio: ["pipe", "pipe", "ignore"],
				})
				return /\bcs\b/.test(result.trim())
			}
		}
	} catch {
		return false
	}
}

/**
 * Clean up any stale CoStrict CLI processes from previous sessions.
 * This should be called during extension activation.
 *
 * For each recorded port:
 * 1. Find the PID currently listening on that port
 * 2. Verify the PID is actually a cs process (avoid killing unrelated programs)
 * 3. Kill only if both checks pass
 */
export async function cleanupStaleProcesses(context: vscode.ExtensionContext): Promise<void> {
	try {
		const ports: number[] = context.workspaceState.get<number[]>(COSTRICT_CLI_PORTS_KEY) || []
		if (ports.length === 0) {
			return
		}

		console.log(`[TerminalManager] Checking ${ports.length} ports from previous sessions`)

		let cleanedCount = 0
		for (const port of ports) {
			const pid = findPidByPort(port)
			if (!pid) {
				continue
			}
			if (!isCsProcess(pid)) {
				console.log(`[TerminalManager] Port ${port} is occupied by non-cs process (pid ${pid}), skipping`)
				continue
			}
			try {
				if (process.platform === "win32") {
					execSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore" })
				} else {
					process.kill(pid, "SIGKILL")
				}
				console.log(`[TerminalManager] Killed stale cs process ${pid} on port ${port}`)
				cleanedCount++
			} catch {
				// Process may have exited between check and kill
			}
		}

		if (cleanedCount > 0) {
			console.log(`[TerminalManager] Cleaned up ${cleanedCount} stale CoStrict CLI processes`)
		}

		await context.workspaceState.update(COSTRICT_CLI_PORTS_KEY, [])
	} catch (error) {
		console.error(`[TerminalManager] Error cleaning up stale processes:`, error)
	}
}

/**
 * Record a port for cleanup tracking.
 */
async function recordPort(context: vscode.ExtensionContext, port: number): Promise<void> {
	try {
		const ports: number[] = context.workspaceState.get<number[]>(COSTRICT_CLI_PORTS_KEY) || []
		if (!ports.includes(port)) {
			ports.push(port)
			await context.workspaceState.update(COSTRICT_CLI_PORTS_KEY, ports)
		}
	} catch {
		// Ignore errors
	}
}

/**
 * Remove a port from cleanup tracking.
 */
async function removePort(context: vscode.ExtensionContext, port: number): Promise<void> {
	try {
		const ports: number[] = context.workspaceState.get<number[]>(COSTRICT_CLI_PORTS_KEY) || []
		const index = ports.indexOf(port)
		if (index > -1) {
			ports.splice(index, 1)
			await context.workspaceState.update(COSTRICT_CLI_PORTS_KEY, ports)
		}
	} catch {
		// Ignore errors
	}
}

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
	private extensionContext: vscode.ExtensionContext | null = null

	private constructor() {}

	static getInstance(): TerminalManager {
		if (!TerminalManager.instance) {
			TerminalManager.instance = new TerminalManager()
		}
		return TerminalManager.instance
	}

	setExtensionContext(context: vscode.ExtensionContext) {
		this.extensionContext = context
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

			// Record port for cleanup tracking
			if (this.extensionContext && this.port) {
				void recordPort(this.extensionContext, this.port)
			}

			// Register exit handler to kill PTY child process if Node.js exits unexpectedly
			this.exitHandler = () => {
				try {
					this.ptyProcess?.kill()
				} catch {
					// Ignore errors, process may have already exited
				}
			}
			process.on("exit", this.exitHandler)
			process.on("SIGTERM", this.exitHandler)
			process.on("SIGINT", this.exitHandler)

			// Start syncing editor context to CLI
			getContextSyncService().start()

			// Handle output from the process
			this.ptyProcess.onData((data: string) => {
				this.sendToWebview({ type: "CostrictCliOutput", data })
			})

			// Handle process exit
			this.ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
				// Remove port from tracking
				if (this.extensionContext && this.port) {
					void removePort(this.extensionContext, this.port)
				}
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
		// Remove port from tracking
		if (this.extensionContext && this.port) {
			void removePort(this.extensionContext, this.port)
		}

		// Remove exit handler to avoid dangling reference
		if (this.exitHandler) {
			process.removeListener("exit", this.exitHandler)
			process.removeListener("SIGTERM", this.exitHandler)
			process.removeListener("SIGINT", this.exitHandler)
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
