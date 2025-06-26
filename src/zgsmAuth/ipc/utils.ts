import * as os from "os"
import * as path from "path"

export function getIPCPath() {
	// Use a unique socket path for the IPC server
	return path.join(os.tmpdir(), "zgsm-ipc.sock")
}
