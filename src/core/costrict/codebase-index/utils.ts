import fs from "fs"
import os from "os"
import { exec, spawn, SpawnOptions } from "child_process"
import path from "path"
import { jwtDecode } from "jwt-decode"
import { ZgsmAuthApi, ZgsmAuthConfig } from "../auth"
import { getClientId } from "../../../utils/getClientId"
import { ILogger } from "../../../utils/logger"
import { default as findWin32Process } from "find-process"

export function execPromise(command: string, opt: any = {}): Promise<string> {
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

export const getWellKnownConfig = () => {
	try {
		// const { homeDir } = this.getTargetPath()
		const wellKnownPath = path.join(os.homedir(), ".costrict", "share", ".well-known.json")

		// Check if wellKnownPath file exists
		if (!fs.existsSync(wellKnownPath)) {
			return {
				services: [],
			}
		}

		return JSON.parse(fs.readFileSync(wellKnownPath, "utf-8"))
	} catch (error) {
		return {
			services: [],
		}
	}
}

// Read information
export const readCostrictAccessToken = () => {
	const homeDir = os.homedir()

	if (!homeDir) {
		throw new Error("Unable to determine user home directory path")
	}

	const tokenDir = path.join(homeDir, ".costrict", "share")

	// Ensure directory exists
	if (!fs.existsSync(tokenDir)) {
		return null
	}
	const tokenFilePath = path.join(tokenDir, "auth.json")
	// Read token file
	if (!fs.existsSync(tokenFilePath)) {
		return null
	}
	return JSON.parse(fs.readFileSync(tokenFilePath, "utf8"))
}
export const writeCostrictAccessToken = async (accessToken: string) => {
	const homeDir = os.homedir()

	if (!homeDir) {
		throw new Error("Unable to determine user home directory path")
	}

	const tokenDir = path.join(homeDir, ".costrict", "share")

	// Ensure directory exists
	if (!fs.existsSync(tokenDir)) {
		fs.mkdirSync(tokenDir, { recursive: true })
	}
	const tokenFilePath = path.join(tokenDir, "auth.json")
	// Write token file
	const jwt = jwtDecode(accessToken) as any
	const { zgsmBaseUrl } = await ZgsmAuthApi.getInstance().getApiConfiguration()
	const baseUrl = zgsmBaseUrl || ZgsmAuthConfig.getInstance().getDefaultApiBaseUrl()

	const config = {
		id: jwt.id,
		name: jwt.displayName,
		access_token: accessToken,
		machine_id: getClientId(),
		base_url: baseUrl,
	}
	fs.writeFileSync(tokenFilePath, JSON.stringify(config, null, 2), "utf8")
}

export const getServiceConfig = (serverName: string) => {
	const { services } = getWellKnownConfig()
	const service = services.find((item: any) => item.name === serverName.split(".")[0])
	return service
}

export async function processIsRunning(processName: string, logger: ILogger): Promise<number[]> {
	const platform = os.platform()

	if (["linux", "darwin"].includes(platform)) {
		return await findProcess(processName)
	}

	const plist = await findWin32Process("name", processName, { strict: true })

	return plist.map((item) => item.pid)
}

export function spawnDetached(
	command: string,
	args: string[] = [],
	options: SpawnOptions = {},
): Promise<import("child_process").ChildProcess> {
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

			// Give process some time to start
			setTimeout(() => {
				resolve(child)
			}, 1000)

			child.unref()
		} else {
			// Linux / macOS spawn directly
			const child = spawn(command, args, {
				detached: true,
				stdio: "ignore",
				...options,
			})

			child?.on("error", (error) => {
				reject(error)
			})

			// Give process some time to start
			setTimeout(() => {
				resolve(child)
			}, 1000)

			child.unref()
		}
	})
}

export async function findProcess(name: string) {
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
