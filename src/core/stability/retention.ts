/**
 * Retention (design §2.1, single-file layout; 2026-09-24 aligned with the
 * JetBrains v2 series). Budget: the shared scope file is rewritten to ≤50MiB
 * via temp + same-dir atomic rename when it exceeds the budget. Selection
 * preserves the newest FAILURE records and their complete incident groups
 * first, then CRITICAL, then SAMPLE — an incident's parent and payload shards
 * are never split across a rewrite. Surviving lines keep their ORIGINAL file
 * order (per-channel seq stays monotonic in file order); evicted rows are
 * counted as health drops, and a shorter file resets the consumer's
 * displacement cursor while replay duplicates are absorbed by event_id dedup.
 * Concurrent sibling writers self-heal from the rewrite through the writer's
 * external-change guard (write_error + rebaseline + reopen). Legacy
 * per-producer files of the same scope are deleted once at activation.
 */
import { promises as fs } from "fs"
import type { Clock } from "./clock"
import { tierOf, type Tier } from "./queue"

export const FILE_BUDGET_BYTES = 50 * 1024 * 1024
export const STALE_MS = 24 * 60 * 60 * 1000

export interface RetentionDeps {
	dirPath: string
	scope: string
	/** The active file (excluded from stale sweep; compacted instead). */
	activePath: string
	clock: Clock
	onEvict?: (count: number) => void
	/** Budget override for tests; production always uses FILE_BUDGET_BYTES. */
	budgetBytes?: number
}

const ORDER: Record<Tier, number> = { failure: 0, critical: 1, sample: 2 }

interface Row {
	line: string
	bytes: number
	tier: Tier
	group: string
	order: number
	timestamp: number
}

const groupKey = (
	fact: { producer_id?: string; run_id?: string; name?: string; context?: { incident_id?: string } },
	order: number,
): string => {
	const incident = fact.context?.incident_id
	if (
		incident &&
		(fact.name === "diagnostic.reported" ||
			fact.name === "diagnostic.payload" ||
			fact.name === "diagnostic.redaction_failed")
	) {
		return `${fact.producer_id}:${fact.run_id}:${incident}`
	}
	return `line:${order}`
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
		const budget = this.deps.budgetBytes ?? FILE_BUDGET_BYTES
		if (stat.size <= budget) return 0
		const raw = await fs.readFile(this.deps.activePath, "utf8").catch(() => "")
		const lines = raw.split("\n")
		// Drop the trailing split artifact and any torn tail (no LF terminator).
		const complete = raw.endsWith("\n") ? lines.slice(0, -1) : lines.slice(0, -2)
		const rows: Row[] = []
		for (let i = 0; i < complete.length; i++) {
			const line = complete[i]
			if (!line.trim()) continue
			let fact: Record<string, unknown>
			try {
				fact = JSON.parse(line) as Record<string, unknown>
			} catch {
				continue // isolate bad rows: dropped by compaction, not repaired
			}
			rows.push({
				line,
				bytes: Buffer.byteLength(line, "utf8") + 1,
				tier: tierOf(fact as never),
				group: groupKey(fact as never, i),
				order: i,
				timestamp: typeof fact.timestamp === "number" ? fact.timestamp : 0,
			})
		}
		// Group by incident (or single line), then choose survivors: newest
		// failure groups first, then critical, then sample — whole groups only.
		const groups = new Map<string, { key: string; rows: Row[]; bytes: number; tier: Tier; newest: number }>()
		for (const row of rows) {
			const g = groups.get(row.group) ?? {
				key: row.group,
				rows: [],
				bytes: 0,
				tier: "failure" as Tier,
				newest: 0,
			}
			g.rows.push(row)
			g.bytes += row.bytes
			if (ORDER[row.tier] > ORDER[g.tier]) g.tier = row.tier // weakest member decides the eviction class
			g.newest = Math.max(g.newest, row.timestamp)
			groups.set(row.group, g)
		}
		const ranked = [...groups.values()].sort((a, b) => ORDER[a.tier] - ORDER[b.tier] || b.newest - a.newest)
		const keptKeys = new Set<string>()
		let bytes = 0
		for (const g of ranked) {
			if (bytes + g.bytes > budget && keptKeys.size > 0) continue
			keptKeys.add(g.key)
			bytes += g.bytes
		}
		const kept = rows.filter((row) => keptKeys.has(row.group)).sort((a, b) => a.order - b.order)
		const evicted = complete.length - kept.length
		if (evicted === 0) return 0
		const temp = `${this.deps.activePath}.tmp-${Date.now()}`
		const handle = await fs.open(temp, "w", 0o600)
		try {
			await handle.write(kept.length > 0 ? `${kept.map((row) => row.line).join("\n")}\n` : "")
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
