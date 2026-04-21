import * as fs from "fs/promises"
import * as os from "os"
import * as path from "path"
import { execFile } from "child_process"
import { promisify } from "util"

export type CostrictCloudMode = "normal" | "cloud"

export type CostrictAuthFile = {
	access_token?: string
	refresh_token?: string
	state?: string
	machine_id?: string
	base_url?: string
	expiry_date?: string | number
	updated_at?: string
	expired_at?: string
}

const execFileAsync = promisify(execFile)

export const COSTRICT_CLOUD_CONFIG_SECTION = "costrict"
export const COSTRICT_CLOUD_MODE_KEY = "mode"

export function getCostrictShareDir(): string {
	return path.join(os.homedir(), ".costrict", "share")
}

export function getCostrictAppDir(): string {
	return path.join(os.homedir(), ".costrict", "app")
}

export function getCostrictCsCloudDir(): string {
	return path.join(os.homedir(), ".costrict", "cs-cloud")
}

export function getAuthJsonPath(): string {
	return path.join(getCostrictShareDir(), "auth.json")
}

export function getServerUrlPath(): string {
	return path.join(getCostrictAppDir(), "server.url")
}

export function getCsCloudPidPath(): string {
	return path.join(getCostrictCsCloudDir(), "cs-cloud.pid")
}

export async function readCostrictAuthFile(authPath = getAuthJsonPath()): Promise<CostrictAuthFile | null> {
	try {
		const raw = await fs.readFile(authPath, "utf8")
		const parsed = JSON.parse(raw) as CostrictAuthFile
		if (!parsed.access_token || !parsed.base_url) {
			return null
		}
		return parsed
	} catch {
		return null
	}
}

export async function readCsCloudServerUrl(serverUrlPath = getServerUrlPath()): Promise<string | null> {
	try {
		const raw = await fs.readFile(serverUrlPath, "utf8")
		const serverUrl = raw.trim().replace(/\/+$/, "")
		return serverUrl.length > 0 ? serverUrl : null
	} catch {
		return null
	}
}

export async function resolveCsCloudServerUrl(): Promise<string | null> {
		const configured = await readCsCloudServerUrl()
		if (configured) {
			return configured
		}
		return detectRunningCsCloudServerUrl()
}

export async function detectRunningCsCloudServerUrl(pidPath = getCsCloudPidPath()): Promise<string | null> {
	try {
		const rawPid = await fs.readFile(pidPath, "utf8")
		const pid = rawPid.trim()
		if (!/^\d+$/.test(pid)) {
			return null
		}
		const { stdout } = await execFileAsync("ss", ["-ltnp"])
		const line = stdout
			.split(/\r?\n/)
			.find((entry) => entry.includes(`pid=${pid}`) && entry.includes("127.0.0.1:"))
		if (!line) {
			return null
		}
		const match = line.match(/127\.0\.0\.1:(\d+)/)
		if (!match) {
			return null
		}
		return `http://127.0.0.1:${match[1]}`
	} catch {
		return null
	}
}

export async function checkCsCloudHealth(serverUrl: string, timeoutMs = 3_000): Promise<boolean> {
	try {
		const response = await fetch(`${serverUrl}/api/v1/runtime/health`, {
			method: "GET",
			signal: AbortSignal.timeout(timeoutMs),
		})
		return response.ok
	} catch {
		return false
	}
}
