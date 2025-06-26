import * as os from "os"
import * as path from "path"
import * as vscode from "vscode"

export function getIPCPath() {
	// const sid = `${vscode.env.machineId}-${vscode.env.uriScheme}-shenma-login-sync`
	const sid = `${vscode.env?.machineId ?? "jFWyVy9wUKKSkX55TDBt2SuQWl7fDM1l"}-${vscode.env?.uriScheme ?? "vscode"}-shenma-login-sync`
	// Use a unique socket path for the IPC server
	return process.platform === "win32" ? `\\\\.\\pipe\\${sid}` : path.join(os.tmpdir(), sid)
}
