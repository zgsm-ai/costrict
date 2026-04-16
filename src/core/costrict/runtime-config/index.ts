import fs from "fs"
import os from "os"
import path from "path"
import { exec, spawn, SpawnOptions } from "child_process"

import getPort, { portNumbers } from "get-port"
import { default as findWin32Process } from "find-process"
import { jwtDecode } from "jwt-decode"

import { CostrictAuthApi } from "../auth/authApi"
import { CostrictAuthConfig } from "../auth/authConfig"
import { getClientId } from "../../../utils/getClientId"
import { createLogger } from "../../../utils/logger"
import { Package } from "../../../shared/package"

export interface CostrictWellKnownService {
	name: string
	protocol?: string
	port?: number
	status?: string
	[key: string]: unknown
}

export interface CostrictWellKnownConfig {
	services: CostrictWellKnownService[]
}

const COMPLETION_AGENT_NAME = "completion-agent"
const COSTRICT_SERVICE_NAME = "costrict"
const RUNTIME_PROCESS_NAME = `costrict${os.platform() === "win32" ? ".exe" : ""}`
const DEFAULT_RUNTIME_READY_WAIT_MS = 2_000
const EXTENDED_RUNTIME_READY_WAIT_MS = 60_000
const logger = createLogger(Package.outputChannel)

export const readCostrictWellKnownConfig = (): CostrictWellKnownConfig => {
	try {
		const wellKnownPath = path.join(os.homedir(), ".costrict", "share", ".well-known.json")

		if (!fs.existsSync(wellKnownPath)) {
			return { services: [] }
		}

		return JSON.parse(fs.readFileSync(wellKnownPath, "utf-8"))
	} catch {
		return { services: [] }
	}
}

export const getCostrictServiceConfig = (serverName: string) => {
	const { services } = readCostrictWellKnownConfig()
	return services.find((item) => item.name === serverName.split(".")[0])
}

export const getCompletionAgentServiceConfig = () => getCostrictServiceConfig(COMPLETION_AGENT_NAME)

export const waitForCompletionAgentConfig = async (
	timeoutMs = DEFAULT_RUNTIME_READY_WAIT_MS,
	pollIntervalMs = 200,
): Promise<CostrictWellKnownService | null> => {
	const deadline = Date.now() + timeoutMs

	while (Date.now() <= deadline) {
		const service = getCompletionAgentServiceConfig()
		if (service?.port) {
			return service
		}
		await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
	}

	return null
}

export const readCostrictAccessToken = () => {
	const homeDir = os.homedir()

	if (!homeDir) {
		throw new Error("Unable to determine user home directory path")
	}

	const tokenDir = path.join(homeDir, ".costrict", "share")
	if (!fs.existsSync(tokenDir)) {
		return null
	}

	const tokenFilePath = path.join(tokenDir, "auth.json")
	if (!fs.existsSync(tokenFilePath)) {
		return null
	}

	return JSON.parse(fs.readFileSync(tokenFilePath, "utf8"))
}

const execPromise = (command: string, opt: any = {}): Promise<string> => {
	return new Promise((resolve, reject) => {
		exec(command, opt, (error, stdout) => {
			if (error) {
				reject(error)
			} else {
				resolve(stdout?.toString())
			}
		})
	})
}

const findUnixProcess = async (name: string) => {
	try {
		const pattern = `(^|/)(${name})( |$)`
		const cmd = `pgrep -af -f '${pattern}'`
		const output = await execPromise(cmd, { encoding: "utf8" })

		if (!output) return []

		return output
			.split("\n")
			.map((line) => parseInt(line.split(" ")[0], 10))
			.filter((pid) => !isNaN(pid))
	} catch {
		return []
	}
}

const processIsRunning = async (processName: string): Promise<number[]> => {
	const platform = os.platform()

	if (["linux", "darwin"].includes(platform)) {
		return await findUnixProcess(processName)
	}

	const plist = await findWin32Process("name", processName, { strict: true })
	return plist.map((item) => item.pid)
}

const spawnDetached = (
	command: string,
	args: string[] = [],
	options: SpawnOptions = {},
): Promise<import("child_process").ChildProcess> => {
	return new Promise((resolve, reject) => {
		const isWindows = os.platform() === "win32"

		if (isWindows) {
			const child = exec(command + " " + args.join(" ") + " > NUL 2>&1", (err) => {
				if (err) {
					reject(err)
				} else {
					resolve(child)
				}
			})

			setTimeout(() => resolve(child), 1000)
			child.unref()
		} else {
			const child = spawn(command, args, {
				detached: true,
				stdio: "ignore",
				...options,
			})

			child.on("error", (error) => reject(error))
			setTimeout(() => resolve(child), 1000)
			child.unref()
		}
	})
}

export const ensureCompletionRuntimeReady = async (): Promise<void> => {
	const existingService = getCompletionAgentServiceConfig()
	if (existingService?.port && existingService.status !== "stopped") {
		return
	}

	const { ensureCostrictRuntimeInstalled, getRuntimeBinaryPath } = await import("./runtimeInstaller")
	const installState = await ensureCostrictRuntimeInstalled()
	if (installState === "failed") {
		logger.warn("[runtime-config] runtime install check failed, costrict-keeper runtime may stay unavailable")
		return
	}

	const binaryPath = getRuntimeBinaryPath()
	if (!fs.existsSync(binaryPath)) {
		logger.warn(`[runtime-config] runtime binary not found after install check: ${binaryPath}`)
		return
	}

	const runningPids = await processIsRunning(RUNTIME_PROCESS_NAME)
	let readyWaitMs = DEFAULT_RUNTIME_READY_WAIT_MS
	if (runningPids.length === 0) {
		const defaultPort = await getPort({ port: portNumbers(9527, 65535) })
		const managementService = getCostrictServiceConfig(COSTRICT_SERVICE_NAME)
		const port = managementService?.port ?? defaultPort
		readyWaitMs =
			installState === "firstInstall" || installState === "upgraded"
				? EXTENDED_RUNTIME_READY_WAIT_MS
				: DEFAULT_RUNTIME_READY_WAIT_MS
		logger.info(
			`[runtime-config] starting costrict-keeper runtime on localhost:${port} (installState=${installState}, wait=${readyWaitMs}ms)`,
		)
		await spawnDetached(binaryPath, ["server", "--listen", `localhost:${port}`])
	}

	const completionAgentService = await waitForCompletionAgentConfig(readyWaitMs)
	if (!completionAgentService?.port) {
		const currentPids = await processIsRunning(RUNTIME_PROCESS_NAME)
		logger.warn(
			`[runtime-config] completion-agent was not ready within ${readyWaitMs}ms; runtimePids=${currentPids.join(",") || "none"}`,
		)
		logger.warn(
			`[runtime-config] latest well-known services: ${JSON.stringify(readCostrictWellKnownConfig().services || [])}`,
		)
		return
	}

	logger.info(
		`[runtime-config] costrict completion runtime ready on ${completionAgentService.protocol || "http"}://localhost:${completionAgentService.port}`,
	)
}

export const writeCostrictRuntimeAuth = async (accessToken: string, refreshToken: string) => {
	const homeDir = os.homedir()

	if (!homeDir) {
		throw new Error("Unable to determine user home directory path")
	}

	const tokenDir = path.join(homeDir, ".costrict", "share")
	if (!fs.existsSync(tokenDir)) {
		fs.mkdirSync(tokenDir, { recursive: true })
	}

	const tokenFilePath = path.join(tokenDir, "auth.json")
	const jwt = jwtDecode(accessToken) as any
	const { costrictBaseUrl } = await CostrictAuthApi.getInstance().getApiConfiguration()
	const baseUrl = costrictBaseUrl || CostrictAuthConfig.getInstance().getDefaultApiBaseUrl()

	const config = {
		id: jwt.id,
		name: jwt.displayName,
		access_token: accessToken,
		refresh_token: refreshToken,
		machine_id: getClientId(),
		base_url: baseUrl,
	}

	fs.writeFileSync(tokenFilePath, JSON.stringify(config, null, 2), "utf8")
}
