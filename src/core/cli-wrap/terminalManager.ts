import { execSync } from "child_process"

import { getIdeaShellEnvWithUpdatePath } from "../../utils/ideaShellEnvLoader"
import { getWorkspacePath } from "../../utils/path"
import { isJetbrainsPlatform } from "../../utils/platform"

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

	private isCsInstalled(): boolean {
		try {
			const cmd = process.platform === "win32" ? "where cs.cmd" : "which cs"
			execSync(cmd, { stdio: "ignore" })
			return true
		} catch {
			return false
		}
	}

	async start(options: TerminalOptions): Promise<void> {
		if (this.isRunning) {
			await this.stop()
		}

		if (!this.isCsInstalled()) {
			this.sendToWebview({
				type: "CostrictCliError",
				error: "Costrict CLI is not installed.\r\nPlease install it by running:\r\n\r\n  npm install @costrict/cs -g\r\n",
			})
			return
		}

		try {
			const ptyModule = await loadPty()
			const workspacePath = getWorkspacePath()
			const cwd = options.cwd || workspacePath || process.cwd()

			// Get shell based on platform
			const shell = this.getShell()

			// Prepare environment
			const env = {
				...process.env,
				TERM: "xterm-256color",
				COLORTERM: "truecolor",
				...(isJetbrainsPlatform() ? getIdeaShellEnvWithUpdatePath(process.env) : undefined),
				...options.env,
			}

			// Spawn PTY process with CostrictCli
			this.ptyProcess = ptyModule.spawn(process.platform === "win32" ? "cs.cmd" : "cs", [], {
				name: "xterm-256color",
				cols: options.cols || 80,
				rows: options.rows || 24,
				cwd,
				env,
			})

			this.isRunning = true

			// Handle output from the process
			this.ptyProcess.onData((data: string) => {
				this.sendToWebview({ type: "CostrictCliOutput", data })
			})

			// Handle process exit
			this.ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
				this.isRunning = false
				this.ptyProcess = null
				this.sendToWebview({ type: "CostrictCliExit", exitCode })
			})
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error)
			this.sendToWebview({ type: "CostrictCliError", error: errorMessage })
			throw error
		}
	}

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
		if (this.ptyProcess) {
			try {
				this.ptyProcess.kill()
			} catch (error) {
				// Ignore errors when killing process
			}
			this.ptyProcess = null
			this.isRunning = false
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
