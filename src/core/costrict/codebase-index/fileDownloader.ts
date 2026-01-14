import * as fs from "fs"
import * as https from "https"
import * as http from "http"
import { URL } from "url"
import { PackageInfoResponse, VersionInfo } from "./types"
import path from "path"
import * as crypto from "crypto"
import { createLogger, ILogger } from "../../../utils/logger"
import { Package } from "../../../shared/package"
import { ZgsmAuthApi, ZgsmAuthConfig } from "../auth"

/**
 * Download progress callback function type
 * @param downloaded Number of bytes downloaded
 * @param total Total number of bytes
 * @param progress Download progress percentage (0-100)
 */
export type DownloadProgressCallback = (downloaded: number, total: number, progress: number) => void

/**
 * File downloader class
 * Used to download client files from remote server, supports progress callback and cancel operations
 */
export class FileDownloader {
	private publicKey: string
	private abortController: AbortController | null = null
	private timeout: number
	private logger: ILogger
	/**
	 * Constructor
	 * @param baseUrl API base URL, default is COSTRICT_BASE_URL || https://zgsm.sangfor.com
	 * @param timeout Request timeout (milliseconds), default is 30000ms (30 seconds)
	 */
	constructor(publicKey: string, timeout: number = 30000) {
		this.publicKey = publicKey
		this.timeout = timeout
		this.logger = createLogger(Package.outputChannel)
	}

	/**
	 * Download client file
	 * @param version Version string in format "major.minor.micro"
	 * @param targetPath File save path
	 * @param packageInfo Package information response object
	 * @param onProgress Download progress callback function
	 * @returns Promise<string> Returns file path after download completion
	 * @throws Throws error when download fails
	 */
	async downloadClient(
		targetPath: string,
		versionInfo: VersionInfo,
		packageInfo: PackageInfoResponse,
		onProgress?: DownloadProgressCallback,
	): Promise<string> {
		const { zgsmBaseUrl } = await ZgsmAuthApi.getInstance().getApiConfiguration()
		const baseUrl = zgsmBaseUrl || ZgsmAuthConfig.getInstance().getDefaultApiBaseUrl()
		const downloadUrl = `${baseUrl}/costrict${versionInfo.appUrl}`

		this.abortController = new AbortController()

		try {
			await this.downloadFileWithProgress(downloadUrl, targetPath, onProgress)

			// Verify file integrity
			await this.verifyFileChecksum(targetPath, packageInfo.checksum, packageInfo.checksumAlgo)
			// Verify file signature
			if (!(await this.verifySignature(packageInfo.checksum, packageInfo.sign, this.publicKey))) {
				fs.unlink(targetPath, () => {})
				throw new Error("File signature verification failed")
			} else {
				this.logger.info("File signature verification successful")
			}

			// If not Windows platform, set file executable permission
			if (packageInfo.os !== "windows") {
				await fs.promises.chmod(targetPath, 0o755)
			}

			// Return downloaded file path
			return targetPath
		} catch (error) {
			if (error instanceof Error) {
				throw new Error(`Failed to download client file: ${error.message}`)
			}
			throw new Error("Unknown error occurred while downloading client file")
		} finally {
			this.abortController = null
		}
	}

	/**
	 * Cancel current download operation
	 */
	cancelDownload(): void {
		if (this.abortController) {
			this.abortController.abort()
			this.abortController = null
		}
	}

	/**
	 * Download file using streaming, supports progress callback
	 * @param url Download URL
	 * @param targetPath Target file path
	 * @param onProgress Progress callback function
	 * @private
	 */
	private async downloadFileWithProgress(
		url: string,
		targetPath: string,
		onProgress?: DownloadProgressCallback,
		maxRetries: number = 3,
	): Promise<void> {
		const attemptDownload = async (attempt: number): Promise<void> => {
			return new Promise((resolve, reject) => {
				const parsedUrl = new URL(url)
				const isHttps = parsedUrl.protocol === "https:"
				const client = isHttps ? https : http

				const options = {
					hostname: parsedUrl.hostname,
					port: parsedUrl.port || (isHttps ? 443 : 80),
					path: parsedUrl.pathname + parsedUrl.search,
					method: "GET",
					timeout: this.timeout,
					signal: this.abortController?.signal,
				}

				const req = client.request(options, (res) => {
					if (res.statusCode !== 200) {
						reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`))
						return
					}

					const contentLength = parseInt(res.headers["content-length"] || "0", 10)
					let downloaded = 0

					const dir = path.dirname(targetPath)
					if (!fs.existsSync(dir)) {
						fs.mkdirSync(dir, { recursive: true })
					}

					const fileStream = fs.createWriteStream(targetPath)

					res.on("data", (chunk) => {
						downloaded += chunk.length

						if (onProgress && contentLength > 0) {
							const progress = Math.min(100, Math.round((downloaded / contentLength) * 100))
							onProgress(downloaded, contentLength, progress)
						}
					})

					res.pipe(fileStream)

					fileStream.on("finish", () => {
						fileStream.close()
						resolve()
					})

					fileStream.on("error", async (err) => {
						try {
							if (fs.existsSync(targetPath)) {
								await fs.promises.unlink(targetPath)
							}
						} catch (cleanupError) {
							this.logger.error(
								`[FileDownloader] Error occurred while cleaning up failed file: ${targetPath}`,
								cleanupError,
							)
						}
						reject(err)
					})
				})

				req.on("error", async (err) => {
					try {
						if (fs.existsSync(targetPath)) {
							await fs.promises.unlink(targetPath)
						}
					} catch (cleanupError) {
						this.logger.error(
							`[FileDownloader] Error occurred while cleaning up failed file: ${targetPath}`,
							cleanupError,
						)
					}
					reject(err)
				})

				req.on("timeout", () => {
					req.destroy()
					reject(new Error("Download request timeout"))
				})

				req.end()
			})
		}

		// Retry logic
		for (let attempt = 0; attempt <= maxRetries; attempt++) {
			try {
				await attemptDownload(attempt)
				return // Success
			} catch (error) {
				if (attempt === maxRetries) {
					throw new Error(
						`Download failed after ${maxRetries + 1} attempts. Last error: ${(error as Error).message}`,
					)
				}

				this.logger.info(`Download attempt ${attempt + 1} failed, retrying...`)
				await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, attempt)))
			}
		}
	}

	private verifySignature(checksum: string, signatureHex: string, publicKeyPem: string): boolean {
		const signature = Buffer.from(signatureHex, "hex")
		const verifier = crypto.createVerify("SHA256")
		verifier.update(checksum)
		verifier.end()
		return verifier.verify(publicKeyPem, signature)
	}

	/**
	 * Verify file checksum
	 * @param filePath File path
	 * @param expectedChecksum Expected checksum
	 * @param algorithm Checksum algorithm, default is md5
	 * @private
	 */
	async verifyFileChecksum(filePath: string, expectedChecksum: string, algorithm: string = "md5"): Promise<boolean> {
		return new Promise((resolve, reject) => {
			const hash = crypto.createHash(algorithm)
			const stream = fs.createReadStream(filePath)

			stream.on("data", (chunk) => {
				hash.update(chunk)
			})

			stream.on("end", () => {
				const actualChecksum = hash.digest("hex")
				if (actualChecksum.toLowerCase() === expectedChecksum.toLowerCase()) {
					resolve(true)
				} else {
					fs.unlink(filePath, () => {})
					reject(
						new Error(
							`File checksum verification failed: expected ${expectedChecksum}, actual ${actualChecksum}`,
						),
					)
				}
			})

			stream.on("error", (err) => {
				reject(err)
			})
		})
	}
}
