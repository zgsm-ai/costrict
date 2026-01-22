import * as os from "os"
import * as path from "path"
import * as vscode from "vscode"

export function getIPCPath() {
	const scheme = vscode?.env?.uriScheme || "vscode"

	// Get current system username, fallback to a random value if not available
	const username = os.userInfo().username || process.env.USER || "unknown"

	// Include username in the sid for user isolation
	const sid = `${scheme}-costrict-login-sync-${username}`

	if (process.platform === "win32") {
		return `\\\\.\\pipe\\${sid}`
	} else {
		// On Linux/Mac, path becomes /tmp/code-server-costrict-login-sync-username.sock
		return path.join(os.tmpdir(), `${sid}.sock`)
	}
}
