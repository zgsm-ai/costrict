import * as fs from "fs/promises"
import * as fsSync from "fs"
import * as http from "http"
import * as https from "https"
import * as os from "os"
import * as path from "path"
import * as crypto from "crypto"
import { URL } from "url"
import { createLogger } from "../../../utils/logger"
import { Package } from "../../../shared/package"
import { FatalInstallerError } from "./types"
import type { ResourcePackageVersion } from "./types"

const logger = createLogger(Package.outputChannel)
const LOG_PREFIX = "[remote-agent-installer:download]"

const DOWNLOAD_TIMEOUT_MS = 120_000
const MAX_REDIRECTS = 5

export interface DownloadProgress {
	downloaded: number
	total: number
	progress: number
}

export class AgentDownloader {
	private tmpDir: string

	constructor(tmpDir?: string) {
		// Use the OS-provided temp directory by default (auto-cleaned on reboot,
		// does not pollute the user's home directory with large zip files).
		this.tmpDir = tmpDir || path.join(os.tmpdir(), "costrict-remote-agent")
	}

	getTmpDir(): string {
		return this.tmpDir
	}

	async download(
		versionInfo: ResourcePackageVersion,
		onProgress?: (progress: DownloadProgress) => void,
	): Promise<string> {
		const version = versionInfo.version
		const zipFileName = `remote-agent-package-${version}.zip`
		const targetPath = path.join(this.tmpDir, zipFileName)
		const downloadingPath = `${targetPath}.downloading`

		// Clean up residual files before downloading; see cleanupResidualFiles() JSDoc for safety rationale.
		await this.cleanupResidualFiles(version)

		// No internal retry — all retry logic is handled by the outer runInstallWithRetries (FR-014).
		try {
			await fs.mkdir(this.tmpDir, { recursive: true })
			await this.downloadToFile(versionInfo.downloadUrl!, downloadingPath, onProgress)
			await fs.rename(downloadingPath, targetPath)

			if (versionInfo.checksum && versionInfo.checksumAlgo) {
				await this.verifyChecksum(targetPath, versionInfo.checksum, versionInfo.checksumAlgo)
			}

			logger.info(`${LOG_PREFIX} Download completed: ${zipFileName}`)
			return targetPath
		} catch (error: any) {
			logger.warn(`${LOG_PREFIX} Download failed: ${error.message}`)
			try {
				await fs.unlink(downloadingPath)
			} catch {
				// ignore cleanup error
			}
			try {
				await fs.unlink(targetPath)
			} catch {
				// ignore cleanup error
			}
			throw error
		}
	}

	/**
	 * Removes ALL `remote-agent-package-*` files and directories from the tmp directory.
	 * This includes the current version's zip if it happens to exist.
	 *
	 * This is safe to call at the start of `download()` because the outer retry logic in
	 * `RemoteAgentInstaller.runInstallWithRetries` only skips `download()` when a zip
	 * returned by a *previous* `download()` call still exists on disk. Since `download()`
	 * only returns after successfully writing the file, `cleanupResidualFiles` can never
	 * delete a zip that the outer retry logic is relying on.
	 */
	async cleanupResidualFiles(_currentVersion?: string): Promise<void> {
		try {
			const entries = await fs.readdir(this.tmpDir)
			const prefix = "remote-agent-package-"
			for (const entry of entries) {
				if (!entry.startsWith(prefix)) continue
				try {
					const entryPath = path.join(this.tmpDir, entry)
					const stat = await fs.stat(entryPath).catch(() => null)
					if (!stat) continue
					if (stat.isDirectory()) {
						await fs.rm(entryPath, { recursive: true, force: true })
					} else {
						await fs.unlink(entryPath)
					}
					logger.info(`${LOG_PREFIX} Cleaned up residual file: ${entry}`)
				} catch {
					// ignore individual cleanup errors
				}
			}
		} catch {
			// ignore if tmp dir does not exist
		}
	}

	private downloadToFile(
		url: string,
		filePath: string,
		onProgress?: (progress: DownloadProgress) => void,
		redirectCount = 0,
	): Promise<void> {
		return new Promise((resolve, reject) => {
			const parsed = new URL(url)
			const client = parsed.protocol === "https:" ? https : http

			let fileStream: fsSync.WriteStream | null = null

			const cleanupStream = () => {
				if (fileStream) {
					try {
						fileStream.close()
					} catch {
						// ignore
					}
					fileStream = null
				}
			}

			const request = client.get(url, { timeout: DOWNLOAD_TIMEOUT_MS }, (response) => {
				if (
					response.statusCode &&
					response.statusCode >= 300 &&
					response.statusCode < 400 &&
					response.headers.location
				) {
					if (redirectCount >= MAX_REDIRECTS) {
						// Consume the response to release the socket
						response.resume()
						reject(new Error(`Too many redirects (max ${MAX_REDIRECTS})`))
						return
					}
					// Consume the redirect response body to release the socket before following
					response.resume()
					this.downloadToFile(response.headers.location, filePath, onProgress, redirectCount + 1)
						.then(resolve)
						.catch(reject)
					return
				}

				if (response.statusCode !== 200) {
					// Consume the response to release the socket
					response.resume()
					reject(new Error(`HTTP ${response.statusCode}`))
					return
				}

				const total = parseInt(response.headers["content-length"] || "0", 10)
				let downloaded = 0

				fileStream = fsSync.createWriteStream(filePath)
				response.pipe(fileStream)

				response.on("data", (chunk: Buffer) => {
					downloaded += chunk.length
					if (onProgress && total > 0) {
						onProgress({
							downloaded,
							total,
							progress: Math.round((downloaded / total) * 100),
						})
					}
				})

				fileStream.on("finish", () => {
					fileStream!.close()
					resolve()
				})

				fileStream.on("error", (err) => {
					cleanupStream()
					reject(err)
				})
			})

			request.on("error", (err) => {
				cleanupStream()
				reject(err)
			})

			request.on("timeout", () => {
				request.destroy()
				cleanupStream()
				reject(new Error("Request timeout"))
			})
		})
	}

	private async verifyChecksum(filePath: string, expected: string, algo: string): Promise<void> {
		const hash = crypto.createHash(algo)
		const stream = fsSync.createReadStream(filePath)
		return new Promise((resolve, reject) => {
			stream.on("data", (chunk) => hash.update(chunk))
			stream.on("end", () => {
				const actual = hash.digest("hex")
				if (actual !== expected) {
					// Checksum mismatch is a fatal error (content corruption / MITM attack).
					// Throw FatalInstallerError so the outer retry logic stops immediately
					// instead of retrying 3 times with the same corrupted file.
					reject(
						new FatalInstallerError(
							"checksumMismatch",
							`Checksum mismatch: expected ${expected}, got ${actual}`,
						),
					)
				} else {
					resolve()
				}
			})
			stream.on("error", reject)
		})
	}
}
