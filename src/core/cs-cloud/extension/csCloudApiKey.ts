import * as fs from "fs"
import * as os from "os"
import * as path from "path"
import { resolveCsCloudRoot } from "./csCloudPaths"

// Mirrors the JetBrains plugin's CsCloudEndpointResolver key priority so both
// IDEs authenticate against cs-cloud with the same local control-plane key.
export function resolveCsCloudApiKey(
	env: NodeJS.ProcessEnv = process.env,
	homeDir: string = os.homedir(),
): string | undefined {
	const fromEnv = env.CS_BRIDGE_API_KEY?.trim() || env.CS_CLOUD_API_KEY?.trim()
	if (fromEnv) return fromEnv
	try {
		// config.json is read from the same root the daemon actually uses
		// (cs-bridge first, legacy cs-cloud fallback).
		const configPath = path.join(resolveCsCloudRoot(homeDir), "config.json")
		if (!fs.existsSync(configPath)) return undefined
		const doc: unknown = JSON.parse(fs.readFileSync(configPath, "utf-8"))
		const key = (doc as { api_key?: unknown })?.api_key
		return typeof key === "string" && key.trim() ? key.trim() : undefined
	} catch {
		return undefined
	}
}
