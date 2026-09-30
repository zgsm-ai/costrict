import * as fs from "fs"
import * as os from "os"
import * as path from "path"

// The daemon renamed its data dir from "cs-cloud" to "cs-bridge" in v1.2.72
// (daemon-side internal/platform/paths.go preferredAppDir: cs-bridge wins when
// its dir exists; legacy cs-cloud is kept only for machines that already have
// it). Readers resolve the same way: the first root holding a server_url file
// wins, so a leftover dir without one never shadows the root the daemon
// actually wrote to; when no root has it, default to cs-bridge like a fresh
// daemon install.

/** server_url candidate paths in resolution order (current first, legacy last). */
export function serverUrlPaths(homeDir: string = os.homedir()): string[] {
	const base = path.join(homeDir, ".costrict")
	return [path.join(base, "cs-bridge", "server_url"), path.join(base, "cs-cloud", "server_url")]
}

/** Daemon state root discovered the same way the daemon picks it. */
export function resolveCsCloudRoot(homeDir: string = os.homedir()): string {
	const candidates = serverUrlPaths(homeDir)
	const found = candidates.find((candidate) => fs.existsSync(candidate))
	return path.dirname(found ?? candidates[0])
}
