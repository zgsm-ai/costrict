import fs from "fs"
import os from "os"
import { exec, spawn, SpawnOptions } from "child_process"
import path from "path"
import { jwtDecode } from "jwt-decode"
import { ZgsmAuthApi, ZgsmAuthConfig } from "../auth"
import { getClientId } from "../../../utils/getClientId"
import { ILogger } from "../../../utils/logger"

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

export function processIsRunning(processName: string, logger: ILogger): Promise<number[]> {
	return new Promise((resolve, reject) => {
		const platform = os.platform()

		let cmd: string
		let args: string[]

		if (platform === "linux" || platform === "darwin") {
			cmd = "pgrep"
			args = ["-f", `/${processName}\b`]
		} else if (platform === "win32") {
			cmd = "tasklist"
			args = ["/FI", `IMAGENAME eq ${processName}`, "/FO", "CSV", "/NH"]
		} else {
			return reject(new Error(`Unsupported platform: ${platform}`))
		}

		const ps = spawn(cmd, args)

		const chunks: Buffer[] = []
		ps.stdout.on("data", (data) => chunks.push(data))
		ps.stderr.on("data", (data) => {
			const errorMsg = data.toString().trim()
			if (errorMsg) {
				logger.error(`stderr[${cmd}]:` + errorMsg)
			}
		})

		ps.on("close", (code) => {
			try {
				const output = Buffer.concat(chunks)
				const stdout = output.toString("utf8").trim()

				if (platform === "win32") {
					// Windows platform handling
					if (!stdout || stdout.includes("No tasks are running") || stdout.includes("Info:")) {
						return resolve([])
					}

					const lines = stdout.split("\n")
					const pids: number[] = []

					for (const line of lines) {
						if (!line.trim()) continue

						try {
							// More robust CSV parsing
							const parts = line.split('","').map((p) => p.replace(/^"|"$/g, ""))
							if (parts.length >= 2) {
								const pid = parseInt(parts[1], 10)
								if (!isNaN(pid) && pid > 0) {
									pids.push(pid)
								}
							}
						} catch (parseError) {
							logger.warn(`Failed to parse line: "${line}"` + parseError)
							continue
						}
					}

					return resolve(pids)
				} else {
					// Linux/macOS platform handling
					if (code === 0) {
						const pids = stdout
							.split("\n")
							.map((line) => line.trim())
							.filter((line) => line.length > 0)
							.map(Number)
							.filter((pid) => !isNaN(pid) && pid > 0)

						return resolve(pids)
					} else {
						// pgrep returning non-zero code usually means process not found
						return resolve([])
					}
				}
			} catch (error) {
				logger.error("Error processing process list: " + error.message)
				return resolve([]) // Return empty array on error instead of throwing exception
			}
		})

		ps.on("error", (err) => {
			logger.error(`Command execution failed [${cmd} ${args.join(" ")}]: ` + err.message)
			reject(err)
		})
	})
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
