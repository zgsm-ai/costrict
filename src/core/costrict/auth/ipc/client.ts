import * as net from "net"
import * as vscode from "vscode"
import { getIPCPath } from "./utils"
import { t } from "../../../../i18n"

let client: net.Socket | null = null
const ipcPath = getIPCPath()
const onTokensUpdateCallbacks: ((tokens: any) => void)[] = []
const onLogoutCallbacks: ((sessionId: string) => void)[] = []
const onCloseWindowCallbacks: ((sessionId: string) => void)[] = []
let isConnecting = false
let retryTimeout: NodeJS.Timeout | null = null
let retryCount = 0
const MAX_RETRIES = 10
const INITIAL_RETRY_DELAY = 3000 // 3 seconds

export function connectIPC() {
	if (client && !client.destroyed) {
		return
	}

	if (isConnecting) {
		return
	}

	isConnecting = true
	if (retryTimeout) clearTimeout(retryTimeout)

	console.log("Connecting to IPC server...")
	client = net.createConnection({ path: ipcPath })

	client.on("connect", () => {
		console.log("Connected to IPC server.")
		isConnecting = false
	})

	client.on("data", (data) => {
		try {
			const message = JSON.parse(data.toString())
			if (message.type === "zgsm-tokens") {
				onTokensUpdateCallbacks.forEach((cb) => cb(message.payload))
			}
			if (message.type === "zgsm-logout") {
				onLogoutCallbacks.forEach((cb) => cb(message.payload))
			}
			if (message.type === "zgsm-close-window") {
				onCloseWindowCallbacks.forEach((cb) => cb(message.payload))
			}
		} catch (error) {
			console.error("Failed to parse IPC message:", error)
		}
	})

	client.on("end", () => {
		console.log("Disconnected from IPC server.")
		client?.destroy()
		client = null
		isConnecting = false
		scheduleRetry()
	})

	client.on("error", (err: NodeJS.ErrnoException) => {
		console.error("IPC connection error:", err.message)
		isConnecting = false
		if (client) {
			client.destroy()
			client = null
		}
		// Retry on most errors with exponential backoff
		if (err.code === "ECONNREFUSED" || err.code === "ENOENT") {
			// Server not ready or socket not created yet - retry with backoff
			scheduleRetry()
		} else if (err.code === "EACCES") {
			// Permission error - don't retry
			console.error("IPC connection failed due to permission error:", err)
		} else {
			// Other errors - retry with backoff
			scheduleRetry()
		}
	})

	function scheduleRetry() {
		if (retryCount >= MAX_RETRIES) {
			console.error(`IPC connection: Maximum retries (${MAX_RETRIES}) reached. Giving up.`)
			showRetryFailedNotification()
			retryCount = 0
			return
		}

		const delay = getRetryDelay(retryCount)
		retryCount++
		console.log(`IPC connection: Retrying in ${delay}ms (attempt ${retryCount}/${MAX_RETRIES})`)

		if (retryTimeout) clearTimeout(retryTimeout)
		retryTimeout = setTimeout(() => {
			retryTimeout = null
			connectIPC()
		}, delay)
	}

	async function showRetryFailedNotification() {
		const message = t("common:ipc.connectionFailed")
		const reloadButton = t("common:ipc.reloadWindow")
		const retryButton = t("common:ipc.manualRetry")
		const result = await vscode.window.showErrorMessage(message, reloadButton, retryButton)

		if (result === reloadButton) {
			vscode.commands.executeCommand("workbench.action.reloadWindow")
		} else if (result === retryButton) {
			client?.destroy?.()
			connectIPC()
		}
	}

	function getRetryDelay(attempt: number): number {
		// Exponential backoff: 1s, 2s, 4s, 8s, 16s, max 30s
		const delay = Math.min(INITIAL_RETRY_DELAY * Math.pow(2, attempt), 30000)
		return delay
	}
}

export function sendZgsmTokens(tokens: { state: string; access_token: string; refresh_token: string }) {
	if (client && !client.destroyed) {
		try {
			const message = JSON.stringify({ type: "zgsm-tokens", payload: tokens })
			client.write(message)
		} catch (error) {
			console.error("Failed to send tokens over IPC:", error)
		}
	} else {
		console.warn("IPC client not connected, cannot send tokens.")
	}
}

export function sendZgsmLogout(sessionId: string) {
	if (client && !client.destroyed) {
		try {
			const message = JSON.stringify({ type: "zgsm-logout", payload: sessionId })
			client.write(message)
		} catch (error) {
			console.error("Failed to send tokens over IPC:", error)
		}
	} else {
		console.warn("IPC client not connected, cannot send tokens.")
	}
}
export function sendZgsmCloseWindow(sessionId: string) {
	if (!client || client.destroyed) {
		return
	}

	try {
		const message = JSON.stringify({ type: "zgsm-close-window", payload: sessionId })
		client.write(message)
	} catch (error) {
		console.error("Failed to send tokens over IPC:", error)
	}
}

export function onZgsmLogout(callback: (sessionId: string) => void) {
	onLogoutCallbacks.push(callback)
	return {
		dispose: () => {
			const index = onLogoutCallbacks.indexOf(callback)
			if (index > -1) {
				onLogoutCallbacks.splice(index, 1)
			}
		},
	}
}

export function onCloseWindow(callback: (sessionId: string) => void) {
	onCloseWindowCallbacks.push(callback)
	return {
		dispose: () => {
			const index = onCloseWindowCallbacks.indexOf(callback)
			if (index > -1) {
				onCloseWindowCallbacks.splice(index, 1)
			}
		},
	}
}

export function onZgsmTokensUpdate(
	callback: (tokens: { state: string; access_token: string; refresh_token: string }) => void,
) {
	onTokensUpdateCallbacks.push(callback)
	return {
		dispose: () => {
			const index = onTokensUpdateCallbacks.indexOf(callback)
			if (index > -1) {
				onTokensUpdateCallbacks.splice(index, 1)
			}
		},
	}
}

export function disconnectIPC() {
	if (retryTimeout) {
		clearTimeout(retryTimeout)
		retryTimeout = null
	}
	retryCount = 0 // Reset retry count on disconnect
	if (client) {
		client.destroy()
		client = null
	}
}

export function resetRetryCount() {
	retryCount = 0
}
