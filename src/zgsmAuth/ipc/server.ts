import RootIPC from "node-ipc"
const IPC = RootIPC.IPC
import os from "os"
import fs from "fs"
import path from "path"

const ipc = new IPC()
ipc.config.id = "roo-token-sync"
ipc.config.retry = 1500
ipc.config.silent = true

const SOCKET_PATH = path.join(os.tmpdir(), "roo-token-sync")

let currentTokens: any = null

ipc.serve(() => {
	ipc.server.on("sendTokens", (data) => {
		currentTokens = data
		// 广播给所有已连接客户端
		ipc.server.broadcast("tokensUpdated", data)
	})
	ipc.server.on("getTokens", (data, socket) => {
		ipc.server.emit(socket, "tokensUpdated", currentTokens)
	})
})

export function startIPCServer() {
	try {
		fs.unlinkSync(SOCKET_PATH)
	} catch {}
	try {
		ipc.serve()
		ipc.server.start()
	} catch (e) {
		// 多个窗口可能启动服务端失败，可忽略
	}
}
