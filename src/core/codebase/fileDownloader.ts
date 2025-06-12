import * as fs from "fs"
import * as crypto from "crypto"

export class FileDownloader {
	private readonly downloadUrl: string
	private readonly targetPath: string
	private readonly checksum: string
	private readonly signature: string
	private readonly publicKey: string
	private readonly platform: string
	private retryCount = 0
	private readonly maxRetries = 5
	private readonly retryDelay = 2000

	constructor(options: {
		downloadUrl: string
		targetPath: string
		checksum: string
		signature: string
		publicKey: string
		platform: string
	}) {
		this.downloadUrl = options.downloadUrl
		this.targetPath = options.targetPath
		this.checksum = options.checksum
		this.signature = options.signature
		this.publicKey = options.publicKey
		this.platform = options.platform
	}

	public async download(): Promise<void> {
		console.log(`Downloading file from: ${this.downloadUrl}`)

		while (this.retryCount < this.maxRetries) {
			try {
				const response = await fetch(this.downloadUrl)
				if (!response.ok) {
					throw new Error(`Download failed: ${response.statusText}`)
				}

				const blob = await response.blob()
				const arrayBuffer = await blob.arrayBuffer()
				const buffer = Buffer.from(arrayBuffer)

				await this.verifyChecksum(buffer)
				await this.verifySignature()
				await this.saveFile(buffer)
				return
			} catch (error) {
				this.retryCount++
				if (this.retryCount >= this.maxRetries) {
					throw new Error(`Download failed after ${this.maxRetries} attempts: ${error.message}`)
				}
				console.log(`Download attempt ${this.retryCount} failed, retrying in ${this.retryDelay}ms...`)
				await new Promise((resolve) => setTimeout(resolve, this.retryDelay))
			}
		}
	}

	private async verifyChecksum(buffer: Buffer): Promise<void> {
		console.log(`Verifying MD5...`)
		if (!this.verifyMD5(buffer, this.checksum)) {
			throw new Error("❌ MD5 verification failed")
		}
		console.log("✅ MD5 verification passed")
	}

	private verifyMD5(buffer: Buffer, expectedMD5: string): boolean {
		const hash = crypto.createHash("md5").update(buffer).digest("hex")
		return hash === expectedMD5.toLowerCase()
	}

	private async verifySignature(): Promise<void> {
		console.log(`Verifying signature...`)
		if (!this.verifySignatureInternal(this.checksum, this.signature, this.publicKey)) {
			throw new Error("❌ Signature verification failed")
		}
		console.log("✅ Signature verification passed")
	}

	private verifySignatureInternal(checksum: string, signatureHex: string, publicKeyPem: string): boolean {
		const signature = Buffer.from(signatureHex, "hex")
		const verifier = crypto.createVerify("SHA256")
		verifier.update(checksum)
		verifier.end()
		return verifier.verify(publicKeyPem, signature)
	}

	private async saveFile(buffer: Buffer): Promise<void> {
		console.log(`Saving file to ${this.targetPath}...`)
		await fs.promises.writeFile(this.targetPath, buffer)
		if (this.platform !== "windows") {
			await fs.promises.chmod(this.targetPath, 0o755)
		}
		console.log("✅ File saved successfully")
	}
}
