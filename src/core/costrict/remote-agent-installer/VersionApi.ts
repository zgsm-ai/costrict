import { ClineProvider } from "../../webview/ClineProvider"
import { createLogger } from "../../../utils/logger"
import { Package } from "../../../shared/package"
import { COSTRICT_DEFAULT_HEADERS } from "../../../shared/headers"
import { v7 as uuidv7 } from "uuid"
import { redactUrl, delay } from "./utils"
import type { ResourcePackageVersion } from "./types"
import { CostrictAuthConfig } from "../../../core/costrict/auth"

const logger = createLogger(Package.outputChannel)
const LOG_PREFIX = "[remote-agent-installer]"

const VERSION_TIMEOUT_MS = 30_000
const VERSION_MAX_RETRIES = 3
const VERSION_RETRY_DELAYS_MS = [1_000, 1_000, 1_000]

function isValidSemVer(version: string): boolean {
	return /^\d+\.\d+\.\d+$/.test(version)
}

export class VersionApi {
	/**
	 * Fetch the latest resource package version from the server with retry.
	 *
	 * Returns:
	 *   - `ResourcePackageVersion` — a new version is available for download
	 *   - `null` — the server responded successfully but no package is available
	 *     (downloadUrl is absent/empty, or costrictBaseUrl is not configured).
	 *     The caller should update lastCheckedAt and silently skip the update.
	 *
	 * Throws:
	 *   - Any network/HTTP error (timeout, connection refused, non-2xx status,
	 *     invalid JSON, invalid semver, etc.) after all retry attempts exhausted.
	 *     The caller must NOT update lastCheckedAt in this case, because no
	 *     successful check occurred.
	 */
	async getLatestVersion(): Promise<ResourcePackageVersion | null> {
		let lastError: Error | undefined

		for (let attempt = 0; attempt < VERSION_MAX_RETRIES; attempt++) {
			try {
				return await this.fetchLatestVersion()
			} catch (error: any) {
				lastError = error
				if (attempt < VERSION_MAX_RETRIES - 1) {
					logger.warn(
						`${LOG_PREFIX} Version check attempt ${attempt + 1}/${VERSION_MAX_RETRIES} failed: ${error.message}, retrying in ${VERSION_RETRY_DELAYS_MS[attempt]}ms`,
					)
					await delay(VERSION_RETRY_DELAYS_MS[attempt])
				} else {
					logger.warn(
						`${LOG_PREFIX} Version check failed after ${VERSION_MAX_RETRIES} attempts: ${error.message}`,
					)
				}
			}
		}

		throw lastError
	}

	/**
	 * Single attempt to fetch the latest version from the server.
	 * Retries are handled by the calling getLatestVersion() method.
	 */
	private async fetchLatestVersion(): Promise<ResourcePackageVersion | null> {
		const baseUrl = await this.getBaseUrl()

		if (!baseUrl) {
			logger.info(`${LOG_PREFIX} Skipping version check: costrictBaseUrl is not configured`)
			return null
		}

		const url = `${baseUrl}/costrict-static/agent-package/latest.json`

		logger.info(`${LOG_PREFIX} Checking latest version from ${redactUrl(url)}`)

		const controller = new AbortController()
		const timeout = setTimeout(() => controller.abort(), VERSION_TIMEOUT_MS)

		let response: Response
		try {
			const headers = await this.getRequestHeaders()
			response = await fetch(url, {
				method: "GET",
				headers,
				signal: controller.signal,
			})
		} catch (error: any) {
			clearTimeout(timeout)
			if (error.name === "AbortError") {
				throw new Error(`Version API request timed out after ${VERSION_TIMEOUT_MS}ms`)
			}
			throw error
		}

		clearTimeout(timeout)

		if (!response.ok) {
			throw new Error(`Version API returned HTTP ${response.status}`)
		}

		let data: ResourcePackageVersion
		try {
			data = (await response.json()) as ResourcePackageVersion
		} catch (error: any) {
			throw new Error(`Failed to parse version API response: ${error.message}`)
		}

		if (!data.version || !isValidSemVer(data.version)) {
			throw new Error(`Invalid or missing version in response: ${data.version}`)
		}

		if (!data.downloadUrl) {
			// Server responded successfully but no package is available — silent skip.
			// Caller should update lastCheckedAt to record that a successful check occurred.
			logger.info(`${LOG_PREFIX} No downloadUrl provided, skipping resource package update`)
			return null
		}

		const resolved: ResourcePackageVersion = {
			name: data.name,
			version: data.version,
			downloadUrl: this.resolveUrl(data.downloadUrl, baseUrl),
			checksum: data.checksum,
			checksumAlgo: data.checksumAlgo,
			agents: data.agents,
		}

		logger.info(`${LOG_PREFIX} Remote version: ${resolved.version}, url: ${redactUrl(resolved.downloadUrl || "")}`)
		return resolved
	}

	private async getBaseUrl(): Promise<string> {
		const provider = await ClineProvider.getInstance()
		if (!provider) {
			return ""
		}
		try {
			let apiConfiguration = (await provider.getState()).apiConfiguration
			return apiConfiguration.costrictBaseUrl?.trim() || CostrictAuthConfig.getInstance().getDefaultApiBaseUrl()
		} catch {
			// ignore
		}
		return ""
	}

	private async getRequestHeaders(): Promise<Record<string, string>> {
		try {
			const provider = await ClineProvider.getInstance()
			if (!provider) {
				return {}
			}
			const currentName = provider.getValue("currentApiConfigName") || "default"
			const profile = await provider.providerSettingsManager.getProfile({ name: currentName })
			const headers: Record<string, string> = {
				"Content-Type": "application/json",
				"X-Request-ID": uuidv7(),
				"Accept-Language": provider.getValue("language") || "",
				...COSTRICT_DEFAULT_HEADERS,
			}
			if (profile.costrictAccessToken) {
				headers["Authorization"] = `Bearer ${profile.costrictAccessToken}`
			}
			return headers
		} catch {
			// ignore header errors
		}
		return {}
	}

	private resolveUrl(downloadUrl: string, baseUrl: string): string {
		if (!downloadUrl) {
			return ""
		}
		if (downloadUrl.startsWith("http://") || downloadUrl.startsWith("https://")) {
			return downloadUrl
		}
		const base = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl
		const path = downloadUrl.startsWith("/") ? downloadUrl : `/${downloadUrl}`
		return `${base}${path}`
	}
}
