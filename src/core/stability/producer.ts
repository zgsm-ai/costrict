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
	/** Forensic anchors of the dead run (JB v2 parity, optional on the wire). */
	last_seq?: number
	last_fact_time?: number
	unfinished_operations?: string[]
}

/**
 * Detect an unclean predecessor inside the shared scope file (single-file
 * layout, aligned with the JetBrains 2026-09-23 change). Reads the whole
 * file (bounded by the writer budget), considers only LF-terminated rows,
 * skips malformed rows and unknown schema files, and flags the run of the
 * LAST plugin.started that has no later plugin.shutdown with the same
 * run_id.
 *
 * Multi-writer liveness heuristic (VS Code runs concurrent extension hosts
 * against one scope file): a candidate run counts as dead only when it has
 * NO fact newer than LIVE_WINDOW_MS — live windows emit telemetry.health at
 * a 30s cadence even with the sidebar closed, so an idle-but-alive sibling
 * window is not misreported as a crash. Timestamps come from recorded
 * facts, never from mtimes (no death inference by mtime).
 */
export const LIVE_WINDOW_MS = 90_000

export const detectUnclean = async (filePath: string, now: number): Promise<UncleanEvidence | undefined> => {
	let raw: string
	try {
		raw = await fs.readFile(filePath, "utf8")
	} catch {
		return undefined
	}
	if (!raw.endsWith("\n")) raw = raw.slice(0, raw.lastIndexOf("\n") + 1) // torn tail is skipped, not judged
	const lines = raw.slice(0, -1).split("\n")
	let lastStartedRun: string | undefined
	let lastStartedAt = 0
	let unknownSchema = false
	const shutdownRuns = new Set<string>()
	const runNewest = new Map<string, number>()
	let lastSeq = 0
	const openOperations = new Map<string, string>() // operation_id → name
	for (const line of lines) {
		if (!line.trim()) continue
		let fact: Fact
		try {
			const parsed = JSON.parse(line) as Partial<Fact>
			if (parsed.schema_version !== "1.0" && parsed.schema_version !== "2.0") {
				unknownSchema = true
				break
			}
			fact = parsed as Fact
		} catch {
			continue // middle bad line: isolate and keep processing
		}
		runNewest.set(fact.run_id, Math.max(runNewest.get(fact.run_id) ?? 0, fact.timestamp))
		if (fact.name === "plugin.started") {
			lastStartedRun = fact.run_id
			lastStartedAt = fact.timestamp
			openOperations.clear() // a fresh run invalidates prior pairing state
		}
		if (fact.name === "plugin.shutdown" && fact.run_id === lastStartedRun) {
			shutdownRuns.add(fact.run_id)
		}
		// Forensic anchors: only facts of the candidate run count.
		if (fact.run_id === lastStartedRun) {
			lastSeq = Math.max(lastSeq, fact.seq ?? 0)
			const opId = fact.context?.operation_id
			if (opId !== undefined && fact.kind === "operation") {
				if (fact.data?.phase === "start") openOperations.set(opId, fact.name)
				else if (fact.data?.phase === "end" || fact.data?.phase === "progress") openOperations.delete(opId)
			}
		}
	}
	if (unknownSchema || !lastStartedRun || shutdownRuns.has(lastStartedRun)) return undefined
	const newestFactAt = runNewest.get(lastStartedRun) ?? lastStartedAt
	if (now - newestFactAt < LIVE_WINDOW_MS) return undefined // sibling window still alive
	const unfinished = [...openOperations.values()].slice(0, 32).map((name) => name)
	return {
		previous_run_id: lastStartedRun,
		evidence: "no_shutdown_record" as const,
		last_seq: lastSeq || undefined,
		last_fact_time: newestFactAt || undefined,
		...(unfinished.length > 0 ? { unfinished_operations: unfinished } : {}),
	}
}
