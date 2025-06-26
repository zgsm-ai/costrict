import RootIPC from "node-ipc"
const IPC = RootIPC.IPC
import os from "os"
import path from "path"

const ipc = new IPC()
ipc.config.id = "roo-token-sync"
ipc.config.retry = 1500
ipc.config.silent = true

const SOCKET_PATH = path.join(os.tmpdir(), "roo-token-sync")

let connected = false
let listeners: ((tokens: any) => void)[] = []

export function connectIPC() {
	if (connected) return
	ipc.connectTo("roo-token-sync", SOCKET_PATH, () => {
		const conn = ipc.of["roo-token-sync"]
		conn.on("connect", () => {
			connected = true
			conn.emit("getTokens")
		})
		conn.on("tokensUpdated", (tokens) => {
			if (tokens) {
				listeners.forEach((fn) => fn(tokens))
			}
		})
		conn.on("disconnect", () => {
			connected = false
		})
	})
}

export function sendTokens(tokens: any) {
	ipc.of["roo-token-sync"]?.emit("sendTokens", tokens)
}

export function onTokensUpdate(fn: (tokens: any) => void): { dispose: () => void } {
	listeners.push(fn)
	return {
		dispose: () => {
			const index = listeners.indexOf(fn)
			if (index !== -1) {
				listeners.splice(index, 1)
			}
		},
	}
}
