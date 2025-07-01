import crypto from "node:crypto"

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16

function deriveKey(machineId: string): Buffer {
	return crypto.createHash("sha256").update(machineId).digest()
}

export function encryptTokens(data: any, machineId: string): string {
	const key = deriveKey(machineId)
	const iv = crypto.randomBytes(IV_LENGTH)
	const cipher = crypto.createCipheriv(ALGORITHM, key, iv)

	const json = JSON.stringify(data)
	const encrypted = Buffer.concat([cipher.update(json, "utf8"), cipher.final()])
	const authTag = cipher.getAuthTag()

	const payload = Buffer.concat([iv, encrypted, authTag])
	return payload.toString("base64")
}

export function decryptTokens(base64Data: string, machineId: string): any {
	const key = deriveKey(machineId)
	const payload = Buffer.from(base64Data, "base64")

	const iv = payload.slice(0, IV_LENGTH)
	const ciphertext = payload.slice(IV_LENGTH, -AUTH_TAG_LENGTH)
	const authTag = payload.slice(-AUTH_TAG_LENGTH)

	const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
	decipher.setAuthTag(authTag)

	const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8")
	return JSON.parse(decrypted)
}
