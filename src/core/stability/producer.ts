/**
 * Producer identity & unclean detection (design §7). The environment snapshot
 * fixes plugin/IDE/OS fields for the run. unclean: a run whose last
 * plugin.started has no plugin.shutdown, judged by the NEXT instance scanning
 * predecessor files under its own scope prefix — it is an unknown-terminal
 * clue, NOT crash attribution; torn tails and bad lines are skipped+counted;
 * files with an unknown schema_major are quarantined (skipped, never
 * deleted); there is no mtime-based death inference and no rescue logic.
 */
import { promises as fs } from "fs"
import type { Fact } from "./fact"

export interface EnvSnapshot {
	plugin_version: string
	ide_build: string
	ide_build_major: string
	os_family: string
	arch: string
	env: "prod" | "dev" | "test"
}

const osFamily = (): "windows" | "macos" | "linux" | "unknown" => {
	if (process.platform === "win32") return "windows"
	if (process.platform === "darwin") return "macos"
	if (process.platform === "linux") return "linux"
	return "unknown"
}

const archOf = (): "x64" | "arm64" | "ia32" | "unknown" => {
	if (process.arch === "x64") return "x64"
	if (process.arch === "arm64") return "arm64"
	if (process.arch === "ia32") return "ia32"
	return "unknown"
}

/**
 * ide_build_major normalizes the user-facing major.minor (VS Code reports
 * "1.138.0"; the user-visible scheme is 1.138) — mirrors the JetBrains
 * ide_build_major shared wire field.
 */
export const ideBuildMajorOf = (ideBuild: string): string => {
	const parts = ideBuild.split(".")
	return parts.length >= 2 ? `${parts[0]}.${parts[1]}` : ideBuild
}

export const envSnapshot = (pluginVersion: string, ideBuild: string, dev: boolean, test: boolean): EnvSnapshot => ({
	plugin_version: pluginVersion,
	ide_build: ideBuild,
	ide_build_major: ideBuildMajorOf(ideBuild),
	os_family: osFamily(),
	arch: archOf(),
	env: test ? "test" : dev ? "dev" : "prod",
})

export interface UncleanEvidence {
	previous_run_id: string
	evidence: "no_shutdown_record"
}

/**
 * Scan predecessor files (same scope prefix, excluding `excludePath`).
 * Returns the latest run whose started has no shutdown; undefined when every
 * predecessor run ended normally.
 */
export const detectUnclean = async (
	dirPath: string,
	scope: string,
	excludePath: string,
): Promise<UncleanEvidence | undefined> => {
	let entries: string[]
	try {
		entries = await fs.readdir(dirPath)
	} catch {
		return undefined
	}
	const prefix = `${scope}-`
	let unclean: UncleanEvidence | undefined
	for (const entry of [...entries].sort()) {
		if (!entry.startsWith(prefix) || !entry.endsWith(".jsonl")) continue
		const full = `${dirPath}/${entry}`
		if (full === excludePath) continue
		const raw = await fs.readFile(full, "utf8").catch(() => "")
		const lines = raw.endsWith("\n") ? raw.slice(0, -1).split("\n") : raw.split("\n").slice(0, -1)
		const pending = new Map<string, true>()
		let unknownSchema = false
		for (const line of lines) {
			let fact: Fact
			try {
				const parsed = JSON.parse(line) as Partial<Fact>
				if (parsed.schema_version !== "1.0") {
					unknownSchema = true
					break
				}
				fact = parsed as Fact
			} catch {
				continue // middle bad line: isolate and keep processing
			}
			if (fact.name === "plugin.started") pending.set(fact.run_id, true)
			if (fact.name === "plugin.shutdown") pending.delete(fact.run_id)
		}
		if (unknownSchema) continue // quarantined, not line-tolerated
		const open = [...pending.keys()]
		if (open.length > 0) unclean = { previous_run_id: open[open.length - 1], evidence: "no_shutdown_record" }
	}
	return unclean
}
