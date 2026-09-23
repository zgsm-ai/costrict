/**
 * Durable scope-id store (port of the JetBrains FileScopeIdStore, 2026-09-23).
 *
 * With the single-file layout the scope-id IS the outbox filename, so losing
 * it silently forks a second scope file and breaks run continuity. VS Code's
 * globalState is debounced and flushed on graceful shutdown only — a hard
 * extension-host kill can lose it. This store persists the scope to
 * `<telemetry-home>/scope-id` with strict validation and an atomic
 * (temp + fsync + rename) publish, mirrors it back to globalState as a
 * secondary backup, and migrates an existing globalState value on first use
 * so current installations keep their scope (and their file).
 *
 * Deviations from the JetBrains original (VS Code constraints): a corrupt or
 * unreadable file logs and falls back to the globalState seed instead of
 * throwing — activation proceeds and the write is retried next activation.
 */
import { promises as fs } from "fs"
import path from "path"
import type { IdStore } from "./ids"

const SIZE = 18 // "scope-" + 12 hex
const PATTERN = /^scope-[0-9a-f]{12}$/

const valid = (value: string | undefined): value is string =>
	typeof value === "string" && value.length === SIZE && PATTERN.test(value)

const read = async (file: string): Promise<string | undefined> => {
	let stat
	try {
		stat = await fs.lstat(file)
	} catch {
		return undefined // absent
	}
	if (!stat.isFile()) throw new Error("scope storage is not a regular file")
	const raw = await fs.readFile(file, "utf8")
	const value = raw.replace(/\n$/, "")
	if (!valid(value)) throw new Error("scope storage content is invalid")
	return value
}

const publish = async (dir: string, file: string, id: string): Promise<void> => {
	await fs.mkdir(dir, { recursive: true, mode: 0o700 })
	const temp = path.join(dir, `.scope-${Date.now()}-${Math.floor(Math.random() * 1e6)}.tmp`)
	const handle = await fs.open(temp, "w", 0o600)
	try {
		await handle.write(id)
		await handle.sync()
	} finally {
		await handle.close()
	}
	await fs.rename(temp, file)
}

/**
 * Load the installation scope; create (and atomically publish) it when absent.
 * Migration order: durable file → globalState seed → new random. The resolved
 * value is always mirrored back to globalState as a secondary backup.
 */
export const durableScopeId = async (
	home: string,
	store: IdStore,
	log?: (message: string) => void,
): Promise<string> => {
	const dir = home
	const file = path.join(dir, "scope-id")
	let resolved: string | undefined
	try {
		resolved = await read(file)
	} catch (err) {
		log?.(
			`stability: scope storage unreadable (${err instanceof Error ? err.message : "unknown"}); falling back to globalState seed`,
		)
	}
	if (!resolved) {
		const seed = store.get("costrict.stability.scopeId")
		if (valid(seed)) {
			resolved = seed
		} else {
			resolved = `scope-${Array.from({ length: 12 }, () => Math.floor(Math.random() * 16).toString(16)).join("")}`
		}
	}
	try {
		await publish(dir, file, resolved)
	} catch (err) {
		// The value still serves this session; retried on the next activation.
		log?.(
			`stability: scope persistence failed (${err instanceof Error ? err.message : "unknown"}); globalState backup only`,
		)
	}
	store.set("costrict.stability.scopeId", resolved)
	return resolved
}
