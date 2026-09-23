/**
 * Retention & cleanup (design §2.1). Budget: this producer's own file is
 * rewritten to ≤10MiB via temp + same-dir atomic rename when it exceeds the
 * budget; evicted rows are counted as health drops and retained lines are
 * never modified (a shorter file resets the consumer's displacement; replay
 * duplicates are absorbed by event_id dedup). Stale: files under the same
 * scope prefix with no append for 24h are deleted whole (predecessor
 * remnants) — the plugin only ever touches its OWN scope; cross-scope
 * cleanup belongs to the consumer. Active producers emit periodic health
 * facts so they are never stale-swept. Cleanup never blocks business and
 * never emits uploadable facts.
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

	/** Delete same-scope predecessor files with no append for 24h. */
	async sweep(): Promise<number> {
		let entries: string[]
		try {
			entries = await fs.readdir(this.deps.dirPath)
		} catch {
			return 0
		}
		const prefix = `${this.deps.scope}-`
		const now = this.deps.clock.wall()
		let deleted = 0
		for (const entry of entries) {
			if (!entry.startsWith(prefix) || !entry.endsWith(".jsonl")) continue
			const full = `${this.deps.dirPath}/${entry}`
			if (full === this.deps.activePath) continue
			try {
				const stat = await fs.stat(full)
				if (now - stat.mtimeMs >= STALE_MS) {
					await fs.unlink(full)
					deleted++
				}
			} catch {
				// raced away — not an error
			}
		}
		return deleted
	}
}
