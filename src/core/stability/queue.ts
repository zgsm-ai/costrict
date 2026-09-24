/**
 * Bounded tiered queue (port of the JetBrains 2026-09-24 rework,
 * single-threaded, with one deliberate deviation). Totals 2000 items / 4MiB
 * whichever comes first; the reserved share (400 items / 20% of bytes) is
 * kept free of samples. Tiers ONLY decide eviction eligibility — draining is
 * global FIFO by arrival, unlike the JetBrains failure-first drain: our
 * acceptance contract (and the shared-file debugging experience) relies on
 * per-channel seq staying monotonic in file order, and a failure-tier
 * operation end must not overtake its own critical-tier start.
 *
 * FAILURE (error and diagnostic families, protocol.error, operation ends,
 * warn/error severity) is never evicted: admitting it may evict SAMPLE first,
 * then CRITICAL. CRITICAL may evict SAMPLE only. SAMPLE never evicts anything
 * — it respects the reservation and rejects itself instead. Atomic
 * publication units (diagnostic parents + payload shards) enter as one
 * group: the group takes the most severe tier of its members and is admitted
 * or dropped whole. Claimed batches stay budgeted until release; contention
 * drops (never blocks).
 */
import type { Fact } from "./fact"

export const QUEUE_MAX_ITEMS = 2000
export const QUEUE_MAX_BYTES = 4 * 1024 * 1024
export const RESERVED_ITEMS = 400
export const RESERVED_BYTES = Math.floor(QUEUE_MAX_BYTES * 0.2)

export interface QueuedFact {
	fact: Fact
	bytes: number
	channel: Fact["channel"]
	/** Wall clock at enqueue — drives health oldest_age_ms. */
	at: number
}

export type Tier = "failure" | "critical" | "sample"

const SAMPLE_NAMES = new Set([
	"telemetry.health",
	"webview.delay",
	"webview.stall",
	"resource.snapshot",
	"render.apply",
])

/** Tier assignment mirrors the JetBrains priority(): failure family first, samples last. */
export const tierOf = (fact: Fact): Tier => {
	const name = typeof fact.name === "string" ? fact.name : ""
	if (
		name.startsWith("error.") ||
		name.startsWith("diagnostic.") ||
		name === "protocol.error" ||
		fact.data?.phase === "end" ||
		(typeof fact.data?.severity === "string" && ["warn", "error"].includes(fact.data.severity as string))
	) {
		return "failure"
	}
	if (SAMPLE_NAMES.has(name) || fact.channel === "diagnostic") return "sample"
	return "critical"
}

const ORDER: Record<Tier, number> = { failure: 0, critical: 1, sample: 2 }

/** Compatibility helper for existing callers/tests. */
export const isCritical = (item: QueuedFact): boolean => item.channel === "critical"

interface Group {
	items: QueuedFact[]
	tier: Tier
	bytes: number
}

export class StabilityQueue {
	/** Single FIFO by arrival; tiers only gate eviction. */
	private readonly groups: Group[] = []
	private claimed = 0
	private claimedBytes = 0
	/** In-memory victims evicted to admit higher tiers (pre-write loss). */
	evictedSample = 0
	evictedCritical = 0

	private backlogItems(): number {
		return this.groups.reduce((n, g) => n + g.items.length, 0)
	}

	private backlogBytes(): number {
		return this.groups.reduce((n, g) => n + g.bytes, 0)
	}

	/** Total occupancy including claimed-but-unreleased batches (capacity math). */
	private totalItems(): number {
		return this.backlogItems() + this.claimed
	}

	private totalBytes(): number {
		return this.backlogBytes() + this.claimedBytes
	}

	private sampleLive(): { items: number; bytes: number } {
		let items = 0
		let bytes = 0
		for (const g of this.groups)
			if (g.tier === "sample") {
				items += g.items.length
				bytes += g.bytes
			}
		return { items, bytes }
	}

	private groupOf(items: QueuedFact[]): Group {
		return {
			items,
			tier: items.reduce<Tier>(
				(weakest, item) => (ORDER[tierOf(item.fact)] < ORDER[weakest] ? tierOf(item.fact) : weakest),
				"sample",
			),
			bytes: items.reduce((sum, item) => sum + item.bytes, 0),
		}
	}

	/** Returns false when the record is rejected (caller counts, never blocks). */
	offer(item: QueuedFact): boolean {
		return this.offerGroup([item])
	}

	/**
	 * Atomic admission for a publication unit (parent + shards). The group
	 * takes the most severe member tier; admitted or dropped whole.
	 */
	offerGroup(items: QueuedFact[]): boolean {
		const group = this.groupOf(items)
		if (group.items.length > QUEUE_MAX_ITEMS || group.bytes > QUEUE_MAX_BYTES) return false
		// SAMPLE never evicts: it must fit beside the reserved share.
		if (group.tier === "sample") {
			if (this.totalItems() + group.items.length > QUEUE_MAX_ITEMS) return false
			if (this.totalBytes() + group.bytes > QUEUE_MAX_BYTES) return false
			const s = this.sampleLive()
			if (s.items + group.items.length > QUEUE_MAX_ITEMS - RESERVED_ITEMS - this.claimed) return false
			if (s.bytes + group.bytes > QUEUE_MAX_BYTES - RESERVED_BYTES - this.claimedBytes) return false
		} else {
			// FAILURE may push out SAMPLE then CRITICAL; CRITICAL only SAMPLE.
			while (
				this.totalItems() + group.items.length > QUEUE_MAX_ITEMS ||
				this.totalBytes() + group.bytes > QUEUE_MAX_BYTES
			) {
				const victim = this.evictOne(group.tier === "failure" ? ["sample", "critical"] : ["sample"])
				if (victim === undefined) return false
			}
		}
		this.groups.push(group)
		return true
	}

	/** Evict the OLDEST group of an allowed tier (arrival order preserved for the rest). */
	private evictOne(allowed: ("sample" | "critical")[]): "sample" | "critical" | undefined {
		for (const tier of allowed) {
			const index = this.groups.findIndex((g) => g.tier === tier)
			if (index === -1) continue
			const [group] = this.groups.splice(index, 1)
			if (tier === "sample") this.evictedSample += group.items.length
			else this.evictedCritical += group.items.length
			return tier
		}
		return undefined
	}

	/** Claim a batch for the writer: whole groups in arrival order. */
	claim(maxItems: number, maxBytes: number): QueuedFact[] {
		const batch: QueuedFact[] = []
		let bytes = 0
		while (this.groups.length > 0 && batch.length < maxItems) {
			const group = this.groups[0]
			if (batch.length + group.items.length > maxItems) break
			if (bytes + group.bytes > maxBytes) break
			this.groups.shift()
			batch.push(...group.items)
			bytes += group.bytes
			this.claimed += group.items.length
			this.claimedBytes += group.bytes
		}
		return batch
	}

	release(batch: QueuedFact[]): void {
		this.claimed = Math.max(0, this.claimed - batch.length)
		this.claimedBytes = Math.max(0, this.claimedBytes - batch.reduce((sum, item) => sum + item.bytes, 0))
	}

	/** Return a claimed batch to the queue head (write failed — keep order). */
	requeue(batch: QueuedFact[]): void {
		this.release(batch)
		if (batch.length === 0) return
		this.groups.unshift(this.groupOf(batch))
	}

	depth(): { items: number; bytes: number } {
		return { items: this.backlogItems(), bytes: this.backlogBytes() }
	}

	oldestAgeMs(now: number): number {
		let oldest: number | undefined
		for (const group of this.groups)
			for (const item of group.items) oldest = oldest === undefined ? item.at : Math.min(oldest, item.at)
		return oldest === undefined ? 0 : Math.max(0, now - oldest)
	}
}
