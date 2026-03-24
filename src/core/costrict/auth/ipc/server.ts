import * as net from "net"
import * as fs from "fs"
import { getIPCPath } from "./utils"

const ipcPath = getIPCPath()
let server: net.Server | null = null
const clients: net.Socket[] = []

export function startIPCServer(): Promise<void> {
	return new Promise((resolve, reject) => {
		if (server) {
			resolve()
			return
		}

		// This is the server logic that will be instantiated if no other server is running
		const createServer = () => {
			server = net.createServer((socket) => {
				clients.push(socket)
				socket.on("data", (data) => {
					clients.forEach((client) => {
						// Broadcast to all other clients
						if (client !== socket && !client.destroyed) {
							client.write(data)
						}
					})
				})
				socket.on("end", () => {
					const index = clients.indexOf(socket)
					if (index !== -1) {
						clients.splice(index, 1)
					}
				})
				socket.on("error", (err) => {
					console.error("IPC socket error:", err)
					const index = clients.indexOf(socket)
					if (index !== -1) {
						clients.splice(index, 1)
					}
				})
			})

			server.on("error", (err) => {
				console.error("IPC server error:", err)
				reject(err)
			})

			// Clean up old socket before listening
			try {
				if (fs.existsSync(ipcPath)) {
					fs.unlinkSync(ipcPath)
				}
			} catch (e) {
				console.error(`Unable to unlink socket ${ipcPath}`, e)
			}

			server.listen(ipcPath, () => {
				console.log("IPC server started.")
				resolve()
			})
		}

		// Try to connect to see if a server is already running
		const testSocket = net.createConnection({ path: ipcPath })

		// Set a short timeout to avoid blocking extension activation when
		// a stale socket file exists but no server is listening (e.g. after
		// a previous VSCode window crashed without cleanup).
		testSocket.setTimeout(1000)

		testSocket.on("timeout", () => {
			console.log("IPC test connection timed out, assuming no server running.")
			testSocket.destroy()
			createServer()
		})

		testSocket.on("connect", () => {
			// A server is already running.
			console.log("IPC server already running.")
			testSocket.end()
			resolve()
		})

		testSocket.on("error", (err: NodeJS.ErrnoException) => {
			if (err.code === "ECONNREFUSED" || err.code === "ENOENT") {
				// No server running, or stale socket. Start a new one.
				createServer()
			} else {
				console.error("IPC test connection error:", err)
				reject(err)
			}
		})
	})
}

export function stopIPCServer() {
	if (server) {
		server.close()
		server = null
	}
	clients.length = 0
}
