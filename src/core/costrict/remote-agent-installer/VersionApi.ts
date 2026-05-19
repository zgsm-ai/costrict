import { ClineProvider } from "../../webview/ClineProvider"
import { createLogger } from "../../../utils/logger"
import { Package } from "../../../shared/package"
import { COSTRICT_DEFAULT_HEADERS } from "../../../shared/headers"
import { v7 as uuidv7 } from "uuid"
import { redactUrl } from "./utils"
import type { ResourcePackageVersion } from "./types"
import { CostrictAuthConfig } from "../../../core/costrict/auth"

const logger = createLogger(Package.outputChannel)
const LOG_PREFIX = "[remote-agent-installer]"

const VERSION_TIMEOUT_MS = 30_000

function isValidSemVer(version: string): boolean {
	return /^\d+\.\d+\.\d+$/.test(version)
}

export class VersionApi {
	/**
	 * Fetch the latest resource package version from the server.
	 *
	 * Returns:
	 *   - `ResourcePackageVersion` — a new version is available for download
	 *   - `null` — the server responded successfully but no package is available
	 *     (downloadUrl is absent/empty, or costrictBaseUrl is not configured).
	 *     The caller should update lastCheckedAt and silently skip the update.
	 *
	 * Throws:
	 *   - Any network/HTTP error (timeout, connection refused, non-2xx status,
	 *     invalid JSON, invalid semver, etc.). The caller must NOT update
	 *     lastCheckedAt in this case, because no successful check occurred.
	 */
	async getLatestVersion(): Promise<ResourcePackageVersion | null> {
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
				logger.warn(`${LOG_PREFIX} Version API request timed out after ${VERSION_TIMEOUT_MS}ms`)
				throw new Error(`Version API request timed out after ${VERSION_TIMEOUT_MS}ms`)
			}
			logger.warn(`${LOG_PREFIX} Failed to fetch latest version: ${error.message}`)
			throw error
		}

		clearTimeout(timeout)

		if (!response.ok) {
			logger.warn(`${LOG_PREFIX} Version API returned status ${response.status}`)
			throw new Error(`Version API returned HTTP ${response.status}`)
		}

		let data: ResourcePackageVersion
		try {
			data = (await response.json()) as ResourcePackageVersion
		} catch (error: any) {
			logger.warn(`${LOG_PREFIX} Failed to parse version API response: ${error.message}`)
			throw new Error(`Failed to parse version API response: ${error.message}`)
		}

		if (!data.version || !isValidSemVer(data.version)) {
			logger.warn(`${LOG_PREFIX} Invalid or missing version in response: ${data.version}`)
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
			return apiConfiguration.costrictBaseUrl?.trim() || "" // not use default value here
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
