// Import required modules
import * as vscode from "vscode"
import * as os from "os"
import * as path from "path"
import crypto from "crypto"

// Import filesystem functions
import { writeFileSync, existsSync, readFileSync, mkdirSync } from "fs"

// Cache for client ID
let clientIdCache: string | null = null

// Gets the path to client ID file
const getClientIdFilePath = (): string => {
	return path.join(os.homedir(), ".zgsm", ".clientId")
}

// Gets .zgsm directory path
const getZgsmDirPath = (): string => {
	return path.join(os.homedir(), ".zgsm")
}

// Generates new client ID
const generateNewClientId = (): string => {
	// Use vscode machineId as base, append random UUID prefix if remote
	return `${vscode?.env?.machineId}${vscode?.env?.remoteName ? `.${crypto.randomUUID().slice(0, 8)}` : ""}`
}

// Exported function to get client ID
export const getClientId = (): string => {
	// Return cached ID if available
	if (clientIdCache !== null) {
		return clientIdCache
	}

	try {
		// Get client ID file path
		const clientIdFilePath = getClientIdFilePath()

		// Read existing ID file if available
		if (existsSync(clientIdFilePath)) {
			const content = readFileSync(clientIdFilePath, "utf-8")
			if (content.trim()) {
				clientIdCache = content
				return content
			}
		}

		// Generate new ID
		const newClientId = generateNewClientId()
		const zgsmDir = getZgsmDirPath()

		// Create .zgsm directory if not exists
		if (!existsSync(zgsmDir)) {
			mkdirSync(zgsmDir, { recursive: true })
		}

		// Write new ID to file and cache it
		writeFileSync(clientIdFilePath, newClientId)
		clientIdCache = newClientId
		return newClientId
	} catch (error) {
		// Fallback with new ID if error occurs
		console.error("Error in getClientId:", error)
		const fallbackId = generateNewClientId()
		clientIdCache = fallbackId
		return fallbackId
	}
}
