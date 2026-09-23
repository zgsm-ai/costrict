/**
 * Retention (design §2.1, single-file layout). Budget: the shared scope file
 * is rewritten to ≤10MiB via temp + same-dir atomic rename when it exceeds
 * the budget; evicted rows are counted as health drops and retained lines
 * are never modified (a shorter file resets the consumer's displacement;
 * replay duplicates are absorbed by event_id dedup). Concurrent sibling
 * writers self-heal from the rewrite through the writer's external-change
 * guard (write_error + rebaseline + reopen). Legacy per-producer files of
 * the same scope are deleted once at activation without migration.
 */
import { promises as fs } from "fs"
import type { Clock } from "./clock"

export const FILE_BUDGET_BYTES = 10 * 1024 * 1024
export const STALE_MS = 24 * 60 * 60 * 1000

export interface RetentionDeps {
	dirPath: string
	scope: string
	/** The active file (excluded from stale sweep; compacted instead). */
	activePath: string
	clock: Clock
	onEvict?: (count: number) => void
}

export class Retention {
	private readonly deps: RetentionDeps

	constructor(deps: RetentionDeps) {
		this.deps = deps
	}

	/** Rewrite the active file to budget; returns evicted line count. */
	async compact(): Promise<number> {
		let stat
		try {
			stat = await fs.stat(this.deps.activePath)
		} catch {
			return 0
		}
		if (stat.size <= FILE_BUDGET_BYTES) return 0
		const raw = await fs.readFile(this.deps.activePath, "utf8").catch(() => "")
		const lines = raw.split("\n")
		// Drop the trailing split artifact and any torn tail (no LF terminator).
		const complete = raw.endsWith("\n") ? lines.slice(0, -1) : lines.slice(0, -2)
		let kept: string[] = []
		let bytes = 0
		for (let i = complete.length - 1; i >= 0; i--) {
			const size = Buffer.byteLength(complete[i], "utf8") + 1
			if (bytes + size > FILE_BUDGET_BYTES) break
			kept.unshift(complete[i])
			bytes += size
		}
		const evicted = complete.length - kept.length
		if (evicted === 0) return 0
		const temp = `${this.deps.activePath}.tmp-${Date.now()}`
		const handle = await fs.open(temp, "w", 0o600)
		try {
			await handle.write(kept.length > 0 ? kept.join("\n") + "\n" : "")
			await handle.sync()
		} finally {
			await handle.close()
		}
		await fs.rename(temp, this.deps.activePath)
		this.deps.onEvict?.(evicted)
		return evicted
	}

	/**
	 * Single-file layout transition: delete same-scope LEGACY files from the
	 * per-producer era (`<scope>-pr-*.jsonl`) without migration — regular
	 * files only, never other scopes, never the active scope file. Runs once
	 * after the writer is active (mirrors the JetBrains clearLegacy).
	 */
	async clearLegacy(): Promise<number> {
		let entries: string[]
		try {
			entries = await fs.readdir(this.deps.dirPath)
		} catch {
			return 0
		}
		let deleted = 0
		for (const entry of entries) {
			if (!entry.startsWith(`${this.deps.scope}-pr-`) || !entry.endsWith(".jsonl")) continue
			const full = `${this.deps.dirPath}/${entry}`
			if (full === this.deps.activePath) continue
			try {
				await fs.unlink(full)
				deleted++
			} catch {
				// raced away — not an error
			}
		}
		return deleted
	}
}
