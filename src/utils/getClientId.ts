import * as vscode from "vscode"
import * as os from "os"
import * as path from "path"
import crypto from "crypto"

import { writeFileSync, existsSync, readFileSync, mkdirSync } from "fs"

let clientIdCache: string | null = null

const getClientIdFilePath = (): string => {
	return path.join(os.homedir(), ".zgsm", ".clientId")
}

const getZgsmDirPath = (): string => {
	return path.join(os.homedir(), ".zgsm")
}

const generateNewClientId = (): string => {
	return `${vscode.env.machineId}${vscode.env.remoteName ? `.${crypto.randomUUID().slice(0, 8)}` : ""}`
}

export const getClientId = (): string => {
	if (clientIdCache !== null) {
		return clientIdCache
	}

	try {
		const clientIdFilePath = getClientIdFilePath()

		if (existsSync(clientIdFilePath)) {
			const content = readFileSync(clientIdFilePath, "utf-8")
			if (content.trim()) {
				clientIdCache = content
				return content
			}
		}

		const newClientId = generateNewClientId()
		const zgsmDir = getZgsmDirPath()

		if (!existsSync(zgsmDir)) {
			mkdirSync(zgsmDir, { recursive: true })
		}
		writeFileSync(clientIdFilePath, newClientId)
		clientIdCache = newClientId
		return newClientId
	} catch (error) {
		console.error("Error in getClientId:", error)
		const fallbackId = generateNewClientId()
		clientIdCache = fallbackId
		return fallbackId
	}
}
