import * as vscode from "vscode"
import * as os from "os"

export const getClientId = () => {
	return `${vscode.env.machineId}${vscode.env.remoteName ? `.${os.hostname()}` : ""}`
}
