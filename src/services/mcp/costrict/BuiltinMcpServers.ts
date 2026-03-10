import { exec } from "child_process"
import { promisify } from "util"
import { z } from "zod"
import { ServerConfigSchema } from "../McpHub"

const execAsync = promisify(exec)

export interface BuiltinServerEntry {
	name: string
	/** Minimum required semver version (inclusive). If omitted, only existence is checked. */
	minVersion?: string
	/** The MCP server config to inject. config.command is also used for version validation. */
	config: z.input<typeof ServerConfigSchema>
}

export const BUILTIN_MCP_SERVERS: BuiltinServerEntry[] = [
	{
		name: "costrict-cli",
		minVersion: "3.0.12",
		config: {
			command: "cs",
			args: ["mcp", "serve"],
			alwaysAllow: ["*"],
		},
	},
]

/**
 * Compares two semver strings (major.minor.patch).
 * Returns positive if a > b, negative if a < b, 0 if equal.
 */
export function compareSemver(a: string, b: string): number {
	const parse = (v: string) => v.split(".").map((n) => parseInt(n, 10) || 0)
	const [aMaj, aMin, aPat] = parse(a)
	const [bMaj, bMin, bPat] = parse(b)
	return aMaj !== bMaj ? aMaj - bMaj : aMin !== bMin ? aMin - bMin : aPat - bPat
}

/**
 * Checks whether a CLI command exists and (optionally) its version meets the minimum requirement.
 * Runs `<command> --version` and extracts the first semver token from the output.
 * If minVersion is omitted, only command existence is checked.
 */
export async function isCommandVersionSatisfied(command: string, minVersion?: string): Promise<boolean> {
	try {
		const { stdout, stderr } = await execAsync(`${command} --version`, { timeout: 5000 })
		if (!minVersion) {
			return true
		}
		const output = (stdout || stderr || "").trim()
		const match = output.match(/(\d+\.\d+\.\d+)/)
		if (!match) {
			console.warn(`Could not parse version from "${command} --version" output: ${output}`)
			return false
		}
		return compareSemver(match[1], minVersion) >= 0
	} catch {
		return false
	}
}

/**
 * Returns the list of built-in server entries whose CLI command exists
 * and satisfies the minimum version requirement.
 */
export async function getEligibleBuiltinServers(): Promise<BuiltinServerEntry[]> {
	const results: BuiltinServerEntry[] = []
	for (const entry of BUILTIN_MCP_SERVERS) {
		const command = "command" in entry.config ? entry.config.command : undefined
		if (!command) {
			console.warn(`Skipping built-in MCP server "${entry.name}": no command specified`)
			continue
		}
		const compatible = await isCommandVersionSatisfied(command, entry.minVersion)
		if (compatible) {
			results.push(entry)
		} else {
			const reason = entry.minVersion
				? `"${command}" not found or version < ${entry.minVersion}`
				: `"${command}" not found`
			console.warn(`Skipping built-in MCP server "${entry.name}": ${reason}`)
		}
	}
	return results
}
