import * as http from "http"
import * as path from "path"
import { execFile, type ChildProcess } from "child_process"
import { EventEmitter } from "events"
import crossSpawn from "cross-spawn"
import which from "which"
import * as vscode from "vscode"
import { getAssistantUIConfig } from "./config"

/** cs-cloud 进程归属类型 */
export type CsCloudOwnership = "owned" | "unmanaged"
/** cs-cloud 来源辅助信息 */
export type CsCloudSource = "spawned" | "detected" | "configuredBaseUrl"

export class CsCloudService extends EventEmitter implements vscode.Disposable {
	private process: ChildProcess | undefined
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
			this.process = crossSpawn(cliExecutable, ["cloud", "start"].concat(port ? ["--port", String(port)] : []), {
				cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
				env: process.env,
			})

			const child = this.process
			const childGen = this.generation

			child.stdout?.on("data", (data) => {
				const text = String(data).trimEnd()
				this.outputChannel.appendLine(`[cs-cloud] ${text}`)
				this.captureErrorLine(text)
			})
			child.stderr?.on("data", (data) => {
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
			// Some CLI renderers write status output to stderr instead of stdout.
			// Parse both streams so we still detect a restarted daemon's new port.
			const output = await runCliCapture(cliExecutable, ["cloud", "status"], 5000)
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

function runCliCapture(executable: string, args: string[], timeoutMs: number): Promise<string> {
	return new Promise((resolve, reject) => {
		const child = crossSpawn(executable, args, { env: process.env })
		const chunks: string[] = []
		let settled = false
		let timer: NodeJS.Timeout | undefined

		const finish = (error?: Error) => {
			if (settled) return
			settled = true
			if (timer) clearTimeout(timer)
			if (error) {
				reject(error)
			} else {
				resolve(chunks.join(""))
			}
		}

		timer = setTimeout(() => {
			child.kill()
			finish(new Error(`Timed out running ${executable} ${args.join(" ")}`))
		}, timeoutMs)

		child.stdout?.on("data", (data) => chunks.push(String(data)))
		child.stderr?.on("data", (data) => chunks.push(String(data)))
		child.once("error", finish)
		child.once("close", () => finish())
	})
}

async function resolveCliExecutable(cli: "cs" | "csc"): Promise<string | undefined> {
	return (
		(await resolveCliExecutableFromPath(cli, getExtensionAndTerminalPath())) ??
		(await resolveCliExecutableFromKnownNpmGlobalBins(cli)) ??
		(await resolveCliExecutableFromNpmPrefix(cli)) ??
		(await resolveCliExecutableFromShell(cli))
	)
}

async function resolveCliExecutableFromPath(
	cli: "cs" | "csc",
	searchPath: string | undefined,
): Promise<string | undefined> {
	try {
		return (await which(cli, { path: searchPath, nothrow: true })) ?? undefined
	} catch {
		return undefined
	}
}

function getExtensionAndTerminalPath(): string | undefined {
	return joinSearchPaths(process.env.PATH, getConfiguredTerminalPath())
}

function getConfiguredTerminalPath(): string | undefined {
	const platform = process.platform === "win32" ? "windows" : process.platform === "darwin" ? "osx" : "linux"
	const terminalEnv = vscode.workspace
		.getConfiguration("terminal.integrated")
		.get<Record<string, string | null>>(`env.${platform}`)

	const configuredPath = terminalEnv?.PATH ?? terminalEnv?.Path ?? terminalEnv?.path
	if (!configuredPath) return undefined

	return configuredPath.replace(/\$\{env:PATH\}|\$env:PATH|%PATH%/gi, process.env.PATH ?? "")
}

async function resolveCliExecutableFromKnownNpmGlobalBins(cli: "cs" | "csc"): Promise<string | undefined> {
	const candidateBins = getKnownNpmGlobalBinPaths()
	if (candidateBins.length === 0) return undefined
	return resolveCliExecutableFromPath(cli, joinSearchPaths(...candidateBins))
}

function getKnownNpmGlobalBinPaths(): string[] {
	const paths: Array<string | undefined> = []

	if (process.env.npm_config_prefix) {
		paths.push(
			process.platform === "win32"
				? process.env.npm_config_prefix
				: path.join(process.env.npm_config_prefix, "bin"),
		)
	}

	if (process.platform === "win32") {
		paths.push(
			process.env.APPDATA ? path.join(process.env.APPDATA, "npm") : undefined,
			process.env.USERPROFILE ? path.join(process.env.USERPROFILE, "AppData", "Roaming", "npm") : undefined,
		)
	} else if (process.env.HOME) {
		paths.push(path.join(process.env.HOME, ".npm-global", "bin"), path.join(process.env.HOME, ".npm", "bin"))
	}

	return uniquePathParts(paths)
}

async function resolveCliExecutableFromNpmPrefix(cli: "cs" | "csc"): Promise<string | undefined> {
	const npmPrefix = await getNpmGlobalPrefix()
	if (!npmPrefix) return undefined

	const npmBin = process.platform === "win32" ? npmPrefix : path.join(npmPrefix, "bin")
	return resolveCliExecutableFromPath(cli, joinSearchPaths(npmBin))
}

async function getNpmGlobalPrefix(): Promise<string | undefined> {
	const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm"

	try {
		const output = await new Promise<string>((resolve) => {
			execFile(
				npmCommand,
				["prefix", "-g"],
				{ timeout: 3000, shell: process.platform === "win32" },
				(_err, stdout) => {
					resolve(stdout || "")
				},
			)
		})
		return output.split(/\r?\n/)[0]?.trim() || undefined
	} catch {
		return undefined
	}
}

async function resolveCliExecutableFromShell(cli: "cs" | "csc"): Promise<string | undefined> {
	for (const attempt of getShellResolveAttempts(cli)) {
		try {
			const output = await new Promise<string>((resolve) => {
				execFile(attempt.command, attempt.args, { timeout: 3000 }, (_err, stdout) => resolve(stdout || ""))
			})
			const resolved = output
				.split(/\r?\n/)
				.map((line) => line.trim())
				.find(Boolean)
			if (resolved) return resolved
		} catch {
			// Ignore shell resolution failures; caller will surface a generic CLI error.
		}
	}

	return undefined
}

type ShellResolveAttempt = { command: string; args: string[] }

function getShellResolveAttempts(cli: "cs" | "csc"): ShellResolveAttempt[] {
	const attempts: ShellResolveAttempt[] = []
	const seen = new Set<string>()
	const add = (command: string | undefined, args: string[]) => {
		if (!command) return
		const key = `${command}\0${args.join("\0")}`
		if (seen.has(key)) return
		seen.add(key)
		attempts.push({ command, args })
	}

	const shell = vscode.env.shell || process.env.SHELL || process.env.ComSpec
	const shellName = shell ? path.basename(shell).toLowerCase() : ""
	const posixCommand = `command -v ${cli}`
	const powershellCommand = `(Get-Command ${cli} -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Source)`
	// Keep the profile-loading PowerShell invocation first: VS Code terminals also
	// load user profiles by default, and many Windows setups adjust PATH there.
	const powershellWithProfileArgs = ["-NoLogo", "-Command", powershellCommand]
	const powershellNoProfileArgs = ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", powershellCommand]
	const cmdArgs = ["/d", "/s", "/c", `where ${cli}`]

	if (process.platform === "win32") {
		if (isPowerShellShell(shellName)) {
			add(shell, powershellWithProfileArgs)
			add(shell, powershellNoProfileArgs)
		} else if (isCmdShell(shellName)) {
			add(shell, cmdArgs)
		} else {
			// Unknown Windows shells: try POSIX-style flags first. If unsupported,
			// execFile fails and we continue to PowerShell/cmd fallbacks below.
			add(shell, ["-lc", posixCommand])
			add(shell, ["-ic", posixCommand])
			add(shell, ["-c", posixCommand])
		}

		add("powershell.exe", powershellWithProfileArgs)
		add("powershell.exe", powershellNoProfileArgs)
		add("pwsh.exe", powershellWithProfileArgs)
		add("pwsh.exe", powershellNoProfileArgs)
		add(process.env.ComSpec || "cmd.exe", cmdArgs)
		add("cmd.exe", cmdArgs)
		return attempts
	}

	// Most POSIX-compatible shells support -c; bash/zsh also commonly need -l/-i
	// to load user profile files where PATH may be adjusted. Try all variants and
	// ignore unsupported ones.
	add(shell, ["-lc", posixCommand])
	add(shell, ["-ic", posixCommand])
	add(shell, ["-c", posixCommand])
	add("/bin/sh", ["-c", posixCommand])
	return attempts
}

function isPowerShellShell(shellName: string): boolean {
	return (
		shellName === "powershell" || shellName === "powershell.exe" || shellName === "pwsh" || shellName === "pwsh.exe"
	)
}

function isCmdShell(shellName: string): boolean {
	return shellName === "cmd" || shellName === "cmd.exe"
}

function joinSearchPaths(...paths: Array<string | undefined>): string | undefined {
	const joined = uniquePathParts(paths.flatMap((value) => value?.split(path.delimiter) ?? []))
	return joined.length > 0 ? joined.join(path.delimiter) : undefined
}

function uniquePathParts(paths: Array<string | undefined>): string[] {
	const seen = new Set<string>()
	const result: string[] = []

	for (const value of paths) {
		const normalized = value?.trim()
		if (!normalized) continue

		const key = process.platform === "win32" ? normalized.toLowerCase() : normalized
		if (seen.has(key)) continue

		seen.add(key)
		result.push(normalized)
	}

	return result
}

function getCliExecutableErrorMessage(cli: "cs" | "csc"): string {
	return `无法执行 ${cli}：未能在 VS Code 扩展 PATH、Terminal PATH 或 npm 全局安装目录中找到可执行的 ${cli}。请检查 ${cli} 是否已安装，或重载 VS Code 窗口后重试。`
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
