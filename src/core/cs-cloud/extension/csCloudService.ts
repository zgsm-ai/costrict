import * as fs from "fs"
import * as http from "http"
import * as path from "path"
import { spawn, execFile, type ChildProcessWithoutNullStreams, type ChildProcess } from "child_process"
import { EventEmitter } from "events"
import * as vscode from "vscode"
import { getAssistantUIConfig } from "./config"

/** cs-cloud 进程归属类型 */
export type CsCloudOwnership = "owned" | "unmanaged"
/** cs-cloud 来源辅助信息 */
export type CsCloudSource = "spawned" | "detected" | "configuredBaseUrl"

export class CsCloudService extends EventEmitter implements vscode.Disposable {
	private process: ChildProcessWithoutNullStreams | undefined
	private baseUrl: string | undefined
	private lastErrorLine: string | undefined

	// ── 状态与归属 ──
	state: "idle" | "starting" | "running" | "crashed" | "failed" = "idle"
	ownership: CsCloudOwnership = "owned"
	source: CsCloudSource = "spawned"

	// ── 并发保护 ──
	private generation = 0
	private expectedStopGenerations: Set<number> = new Set()
	private operationPromise?: Promise<string>

	// ── 持久化 crash 信息 ──
	lastCrashReason?: string
	startupFailureReason?: string

	// ── 健康检查 ──
	private failCount = 0
	private healthTimer?: NodeJS.Timeout

	constructor(private readonly outputChannel: vscode.OutputChannel) {
		super()
	}

	/** 暴露 baseUrl 供外部使用 */
	get baseUrlValue(): string | undefined {
		return this.baseUrl
	}

	// ═══════════════════════════════════════════════════════════════
	// ensureStarted() / doEnsureStarted()
	// ═══════════════════════════════════════════════════════════════

	async ensureStarted(): Promise<string> {
		if (this.operationPromise) return this.operationPromise

		// 如果已经 running，直接返回当前 baseUrl。
		// 尤其是 crash/restart 后 adopt 了新端口时，调用方会立刻重新加载 UI；
		// 这里不能再次探测并 fallback 到配置端口，否则 `cloud status` 短暂不可用
		// 时会错误地重新 spawn 旧端口。
		if (this.state === "running" && this.baseUrl) {
			return this.baseUrl
		}

		this.operationPromise = this.doEnsureStarted(false)
		try {
			const url = await this.operationPromise
			this.handleStartSuccess()
			return url
		} finally {
			this.operationPromise = undefined
		}
	}

	private async doEnsureStarted(skipDetection = false, forceStart = false): Promise<string> {
		const config = getAssistantUIConfig()
		if (config.baseUrl.trim()) {
			this.baseUrl = trimTrailingSlash(config.baseUrl.trim())
			this.ownership = "unmanaged"
			this.source = "configuredBaseUrl"
			return this.baseUrl
		}

		const detectedPort = skipDetection ? undefined : await detectCsCloudPort(config.defaultCli)
		if (detectedPort !== undefined) {
			const healthUrl = `http://127.0.0.1:${detectedPort}/api/v1/runtime/health`
			this.baseUrl = `http://127.0.0.1:${detectedPort}/api/v1`
			this.ownership = "unmanaged"
			this.source = "detected"

			if (await isHttpReady(healthUrl)) {
				await assertOpenCodeCompatible(this.baseUrl)
				return this.baseUrl
			}

			this.outputChannel.appendLine(
				`[AssistantUI] Detected cs-cloud on port ${detectedPort}, waiting for it to be ready...`,
			)
			await this.waitForHttpReady(healthUrl, 15_000)
			await assertOpenCodeCompatible(this.baseUrl)
			return this.baseUrl
		}

		const port = config.port
		const healthUrl = `http://127.0.0.1:${port}/api/v1/runtime/health`
		this.baseUrl = `http://127.0.0.1:${port}/api/v1`

		if (!skipDetection && (await isHttpReady(healthUrl))) {
			this.ownership = "unmanaged"
			this.source = "detected"
			await assertOpenCodeCompatible(this.baseUrl)
			return this.baseUrl
		}

		if (!config.autoStartCsCloud && !forceStart) {
			throw new Error("cs-cloud 没有运行，请先启动 cs-cloud 或设置 costrict.assistantUI.baseUrl")
		}

		// ── 自己 spawn ──
		this.ownership = "owned"
		this.source = "spawned"
		this.state = "starting"
		this.lastErrorLine = undefined
		this.startupFailureReason = undefined

		if (!this.process) {
			const cliExecutable = await resolveCliExecutable(config.defaultCli)
			if (!cliExecutable) {
				throw new Error(getCliExecutableErrorMessage(config.defaultCli))
			}

			this.outputChannel.appendLine(
				`[AssistantUI] Starting cs-cloud: ${cliExecutable} cloud start --port ${port}`,
			)
			// 仅首次启动时递增 generation；restart 路径已由 doRestart 递增
			if (!skipDetection) {
				this.generation++
			}
			this.process = spawn(cliExecutable, ["cloud", "start"].concat(port ? ["--port", String(port)] : []), {
				cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
				env: process.env,
			})

			const child = this.process
			const childGen = this.generation

			child.stdout.on("data", (data) => {
				const text = String(data).trimEnd()
				this.outputChannel.appendLine(`[cs-cloud] ${text}`)
				this.captureErrorLine(text)
			})
			child.stderr.on("data", (data) => {
				const text = String(data).trimEnd()
				this.outputChannel.appendLine(`[cs-cloud] ${text}`)
				this.captureErrorLine(text)
			})
			child.on("exit", (code, signal) => {
				this.outputChannel.appendLine(`[AssistantUI] cs-cloud exited code=${code ?? ""} signal=${signal ?? ""}`)

				// 只有当前进程引用一致时才清空，防止旧事件清掉新进程引用
				if (this.process === child) {
					this.process = undefined
				}

				// 按 generation 检查是否为主动 kill
				if (this.expectedStopGenerations.has(childGen)) {
					this.expectedStopGenerations.delete(childGen)
					return
				}

				// 旧 generation 事件忽略
				if (childGen !== this.generation) return

				// STARTING 阶段退出：仅非零退出码或 signal 才视为失败。
				// cs-cloud daemon 模式会 fork 后父进程 exit(0)，此时不应报错，
				// 让 waitForHttpReady 继续轮询等待 daemon HTTP 端口就绪。
				if (this.state === "starting") {
					if (code !== 0 || signal) {
						this.startupFailureReason = this.lastErrorLine ?? `code=${code} signal=${signal}`
						this.state = "failed"
					}
					return
				}

				// RUNNING 阶段退出 → 仅非零退出码或 signal 才视为崩溃。
				// daemon fork 后 child exit(0) 可能在 handleStartSuccess 之后才被
				// EventLoop 处理到（竞态），此时 state 已为 running，不应误判崩溃。
				if (this.state === "running") {
					if (code !== 0 || signal) {
						this.notifyCrash(`进程退出 (code=${code}, signal=${signal})`)
					}
					return
				}
			})
			child.on("error", (error) => {
				this.outputChannel.appendLine(`[AssistantUI] Failed to start cs-cloud: ${error.message}`)
				this.lastErrorLine = error.message
				this.startupFailureReason = error.message
				this.state = "failed"
			})
		}

		await this.waitForHttpReady(healthUrl, 15_000)
		await assertOpenCodeCompatible(this.baseUrl)
		return this.baseUrl
	}

	// ═══════════════════════════════════════════════════════════════
	// restart()
	// ═══════════════════════════════════════════════════════════════

	async restart(): Promise<string> {
		if (this.operationPromise) return this.operationPromise

		this.operationPromise = this.doRestart()
		try {
			return await this.operationPromise
		} finally {
			this.operationPromise = undefined
		}
	}

	private async doRestart(): Promise<string> {
		const shouldWaitForMovedDaemon = this.state === "crashed" || this.state === "failed" || this.failCount > 0
		// 清掉上一次 spawn 失败（例如 EACCES）的错误；否则检测到新端口但
		// 还没 ready 时，waitForHttpReady 会被旧 startupFailureReason 立即打断。
		this.startupFailureReason = undefined

		if (this.ownership === "unmanaged" && this.source === "configuredBaseUrl") {
			this.outputChannel.appendLine(
				`[AssistantUI] Restart requested for configured cs-cloud baseUrl ${this.baseUrl}; waiting for health check...`,
			)
			await this.waitForHealth()
			this.handleStartSuccess()
			return this.baseUrl!
		}

		if (this.ownership === "unmanaged") {
			this.outputChannel.appendLine(
				"[AssistantUI] Restarting previously detected cs-cloud as a managed cs-cloud daemon...",
			)
		}

		// ★ 重启前先检测 cs-cloud 是否已在运行（例如用户手动重启了服务，端口可能已变化）。
		// 如果已运行，则直接采纳为 detected（unmanaged），避免继续使用旧端口或 spawn 冲突。
		const detectedUrl = await this.detectAndAdoptCsCloudPort(
			shouldWaitForMovedDaemon ? { detectRetries: 15, detectDelayMs: 2000, readyTimeoutMs: 30_000 } : {},
		)
		if (detectedUrl) {
			this.handleStartSuccess()
			return detectedUrl
		}

		// owned 或自动检测到的 unmanaged：启动一个由扩展管理的新进程
		this.stopHealthMonitor()
		this.state = "starting"
		this.failCount = 0
		const oldProcess = this.process
		const oldGen = this.generation

		if (oldProcess && !oldProcess.killed) {
			this.expectedStopGenerations.add(oldGen)
			oldProcess.kill()
			await this.waitForProcessExit(oldProcess, 5000)
		}
		this.process = undefined
		this.generation++

		try {
			const url = await this.doEnsureStarted(true, true)
			this.handleStartSuccess()
			return url
		} finally {
			this.expectedStopGenerations.delete(oldGen)
		}
	}

	// ═══════════════════════════════════════════════════════════════
	// dispose()
	// ═══════════════════════════════════════════════════════════════

	dispose(): void {
		this.stopHealthMonitor()
		if (this.process && !this.process.killed) {
			const gen = this.generation
			this.expectedStopGenerations.add(gen)
			this.process.kill()
		}
		this.process = undefined
	}

	// ═══════════════════════════════════════════════════════════════
	// handleStartSuccess / notifyCrash / 健康检查
	// ═══════════════════════════════════════════════════════════════

	private handleStartSuccess(): void {
		this.state = "running"
		this.lastCrashReason = undefined
		this.failCount = 0
		this.startupFailureReason = undefined
		this.startHealthMonitor()
	}

	private notifyCrash(reason: string): void {
		if (this.state === "crashed") return
		this.state = "crashed"
		this.lastCrashReason = reason
		this.stopHealthMonitor()
		this.emit("crashed", { reason })
	}

	private startHealthMonitor(): void {
		this.stopHealthMonitor()
		const monitorGen = this.generation

		const doCheck = async () => {
			if (monitorGen !== this.generation || this.state !== "running") return

			const checkedHealthUrl = this.healthUrl
			const healthy = await isHttpReady(checkedHealthUrl)

			if (monitorGen !== this.generation || this.state !== "running") return

			if (healthy) {
				this.failCount = 0
			} else {
				this.failCount++

				// `csc cloud restart` may bring the daemon back on a different port.
				// Before showing the crash screen, re-read `cloud status` and adopt the
				// new port if it is already healthy/OpenCode-compatible.
				if (await this.tryRecoverByDetectingMovedDaemon(monitorGen, checkedHealthUrl)) {
					return
				}

				if (this.failCount >= 3) {
					this.notifyCrash("健康检查连续失败")
					return
				}
			}

			this.healthTimer = setTimeout(doCheck, 30_000)
		}

		this.healthTimer = setTimeout(doCheck, 30_000)
	}

	private stopHealthMonitor(): void {
		if (this.healthTimer) {
			clearTimeout(this.healthTimer)
			this.healthTimer = undefined
		}
	}

	private get healthUrl(): string {
		return this.baseUrl ? `${this.baseUrl}/runtime/health` : "http://127.0.0.1:0/api/v1/runtime/health"
	}

	// ═══════════════════════════════════════════════════════════════
	// Helpers
	// ═══════════════════════════════════════════════════════════════

	private async waitForHealth(timeoutMs = 30_000): Promise<void> {
		const startedAt = Date.now()
		while (Date.now() - startedAt < timeoutMs) {
			if (await isHttpReady(this.healthUrl)) return
			await new Promise((resolve) => setTimeout(resolve, 1000))
		}
		throw new Error("Timed out waiting for cs-cloud health check")
	}

	private async waitForProcessExit(proc: ChildProcess, timeoutMs: number): Promise<void> {
		await Promise.race([
			new Promise<void>((resolve) => proc.once("exit", () => resolve())),
			new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
		])
	}

	private async detectAndAdoptCsCloudPort(
		options: {
			onlyIfDifferentPort?: boolean
			detectRetries?: number
			detectDelayMs?: number
			readyTimeoutMs?: number
		} = {},
	): Promise<string | undefined> {
		const config = getAssistantUIConfig()
		const detectedPort = await detectCsCloudPort(config.defaultCli, options.detectRetries, options.detectDelayMs)
		if (detectedPort === undefined) return undefined
		if (options.onlyIfDifferentPort && detectedPort === getPortFromBaseUrl(this.baseUrl)) return undefined

		const detectedBaseUrl = csCloudBaseUrl(detectedPort)
		const detectedHealthUrl = csCloudHealthUrl(detectedPort)

		if (await isHttpReady(detectedHealthUrl)) {
			this.outputChannel.appendLine(
				`[AssistantUI] Detected already-running cs-cloud on port ${detectedPort}; adopting it.`,
			)
		} else {
			this.outputChannel.appendLine(
				`[AssistantUI] Detected cs-cloud on port ${detectedPort}, waiting for it to be ready...`,
			)
			await this.waitForHttpReady(detectedHealthUrl, options.readyTimeoutMs ?? 30_000)
		}

		await assertOpenCodeCompatible(detectedBaseUrl)

		this.baseUrl = detectedBaseUrl
		this.ownership = "unmanaged"
		this.source = "detected"
		return detectedBaseUrl
	}

	private async tryRecoverByDetectingMovedDaemon(monitorGen: number, failedHealthUrl: string): Promise<boolean> {
		try {
			const detectedUrl = await this.detectAndAdoptCsCloudPort({ onlyIfDifferentPort: true })
			if (!detectedUrl) return false
			if (monitorGen !== this.generation || this.state !== "running") return true

			this.outputChannel.appendLine(
				`[AssistantUI] cs-cloud health check failed at ${failedHealthUrl}; recovered on ${detectedUrl}.`,
			)
			this.handleStartSuccess()
			return true
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			this.outputChannel.appendLine(`[AssistantUI] Failed to adopt moved cs-cloud daemon: ${message}`)
			return false
		}
	}

	private captureErrorLine(text: string) {
		const clean = stripAnsi(text).toLowerCase()
		if (
			clean.includes("error") ||
			clean.includes("unauthorized") ||
			clean.includes("fatal") ||
			clean.includes("failed") ||
			clean.includes("panic") ||
			clean.includes("cannot")
		) {
			this.lastErrorLine = stripAnsi(text).trim()
		}
	}

	private async waitForHttpReady(url: string, timeoutMs: number, initialDelayMs = 1000) {
		const startedAt = Date.now()
		let lastError: unknown
		let attempt = 0

		while (Date.now() - startedAt < timeoutMs) {
			if (this.startupFailureReason) {
				throw new Error(`cs-cloud 启动失败: ${this.startupFailureReason}`)
			}

			try {
				if (await isHttpReady(url)) return
			} catch (error) {
				lastError = error
			}
			// 指数退避：1s, 2s, 4s, 4s, 4s...
			const delay = Math.min(initialDelayMs * Math.pow(2, attempt), 4000)
			attempt++
			await new Promise((resolve) => setTimeout(resolve, delay))
		}

		if (this.startupFailureReason) {
			throw new Error(`cs-cloud 启动失败: ${this.startupFailureReason}`)
		}

		throw new Error(
			`Timed out waiting for cs-cloud at ${url}${lastError instanceof Error ? `: ${lastError.message}` : ""}`,
		)
	}
}

async function detectCsCloudPort(defaultCli: "cs" | "csc", retries = 3, delayMs = 2000): Promise<number | undefined> {
	const cliExecutable = await resolveCliExecutable(defaultCli)
	if (!cliExecutable) return undefined

	for (let i = 0; i < retries; i++) {
		try {
			const output = await new Promise<string>((resolve) => {
				execFile(cliExecutable, ["cloud", "status"], { timeout: 5000 }, (err, stdout, stderr) => {
					// Some CLI renderers write status output to stderr instead of stdout.
					// Parse both streams so we still detect a restarted daemon's new port.
					resolve(`${stdout || ""}\n${stderr || ""}`)
				})
			})

			const cleanStdout = stripAnsi(output)

			// 匹配 local_url: http://127.0.0.1:PORT 或 local_url: https://...:PORT
			const match = cleanStdout.match(/local_url:\s+(https?:\/\/[^\s:]+:(\d+))/)
			if (match) {
				const port = parseInt(match[2], 10)
				if (port > 0) {
					return port
				}
			}
		} catch {
			// ignore detection failures
		}

		if (i < retries - 1) {
			await new Promise((resolve) => setTimeout(resolve, delayMs))
		}
	}
	return undefined
}

function csCloudBaseUrl(port: number): string {
	return `http://127.0.0.1:${port}/api/v1`
}

function csCloudHealthUrl(port: number): string {
	return `${csCloudBaseUrl(port)}/runtime/health`
}

function getPortFromBaseUrl(baseUrl: string | undefined): number | undefined {
	if (!baseUrl) return undefined
	try {
		const port = new URL(baseUrl).port
		return port ? Number(port) : undefined
	} catch {
		return undefined
	}
}

async function resolveCliExecutable(cli: "cs" | "csc"): Promise<string | undefined> {
	const candidates = getCliExecutableCandidates(cli)
	const seen = new Set<string>()

	for (const candidate of candidates) {
		if (!candidate || seen.has(candidate)) continue
		seen.add(candidate)
		if (isExecutableFile(candidate)) return candidate
	}

	const shellResolved = await resolveCliExecutableFromShell(cli)
	if (shellResolved && !seen.has(shellResolved) && isExecutableFile(shellResolved)) {
		return shellResolved
	}

	return undefined
}

function getCliExecutableCandidates(cli: "cs" | "csc"): string[] {
	return (process.env.PATH ?? "")
		.split(path.delimiter)
		.filter(Boolean)
		.map((dir) => path.join(dir, cli))
}

async function resolveCliExecutableFromShell(cli: "cs" | "csc"): Promise<string | undefined> {
	const shell = process.env.SHELL || "/bin/sh"
	const shellName = path.basename(shell)
	const command = `command -v ${cli}`
	const attempts =
		shellName === "bash" || shellName === "zsh"
			? [
					["-lc", command],
					["-ic", command],
				]
			: [["-c", command]]

	for (const args of attempts) {
		try {
			const output = await new Promise<string>((resolve) => {
				execFile(shell, args, { timeout: 3000 }, (_err, stdout) => resolve(stdout || ""))
			})
			const resolved = output
				.split(/\r?\n/)
				.find((line) => line.trim().startsWith("/"))
				?.trim()
			if (resolved) return resolved
		} catch {
			// Ignore shell resolution failures; caller will surface a generic CLI error.
		}
	}

	return undefined
}

function isExecutableFile(filePath: string): boolean {
	try {
		const stat = fs.statSync(filePath)
		if (!stat.isFile()) return false
		fs.accessSync(filePath, fs.constants.X_OK)
		return true
	} catch {
		return false
	}
}

function getCliExecutableErrorMessage(cli: "cs" | "csc"): string {
	return `无法执行 ${cli}：PATH 中没有找到可执行的 ${cli}。请检查 ${cli} 是否已安装，并确认 VS Code 扩展进程的 PATH 配置正确。`
}

function trimTrailingSlash(value: string) {
	return value.replace(/\/+$/, "")
}

function isHttpReady(url: string): Promise<boolean> {
	return new Promise((resolve) => {
		const req = http.get(url, (res) => {
			res.resume()
			resolve(res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 500)
		})
		req.setTimeout(1_000, () => {
			req.destroy()
			resolve(false)
		})
		req.on("error", () => resolve(false))
	})
}

async function assertOpenCodeCompatible(baseUrl: string): Promise<void> {
	const probeUrl = `${baseUrl}/conversations?roots=true&archived=true`
	const statusCode = await getStatusCode(probeUrl)
	if (statusCode >= 200 && statusCode < 500 && statusCode !== 404) {
		return
	}

	throw new Error(
		`cs-cloud at ${baseUrl} is not OpenCode-compatible yet; ${probeUrl} returned ${statusCode}. ` +
			"Restart the daemon built from the current cs-cloud sources or set costrict.assistantUI.baseUrl to a compatible /api/v1 endpoint.",
	)
}

function getStatusCode(url: string): Promise<number> {
	return new Promise((resolve) => {
		const req = http.get(url, (res) => {
			res.resume()
			resolve(res.statusCode ?? 0)
		})
		req.setTimeout(2_000, () => {
			req.destroy()
			resolve(0)
		})
		req.on("error", () => resolve(0))
	})
}

function stripAnsi(text: string): string {
	const ESC = String.fromCharCode(27)
	return text.replace(new RegExp(ESC + "\\[[0-9;]*m", "g"), "")
}
