/**
 * Bounded dual-channel queue (design §7). Totals 2000 items / 4MiB whichever
 * comes first; critical reserves 400 items / 20% of bytes. Diagnostic records
 * are rejected when their share is exhausted (never evict critical); critical
 * may evict oldest diagnostics to reclaim space. Claimed batches still count
 * against the budget until released. Contention drops (never blocks).
 */
import type { Fact } from "./fact"

export const QUEUE_MAX_ITEMS = 2000
export const QUEUE_MAX_BYTES = 4 * 1024 * 1024
export const CRITICAL_RESERVED_ITEMS = 400
export const CRITICAL_RESERVED_BYTES = Math.floor(QUEUE_MAX_BYTES * 0.2)

export interface QueuedFact {
	fact: Fact
	bytes: number
	channel: Fact["channel"]
	/** Wall clock at enqueue — drives health oldest_age_ms. */
	at: number
}

export const isCritical = (item: QueuedFact): boolean => item.channel === "critical"

export class StabilityQueue {
	private readonly items: QueuedFact[] = []
	private claimed = 0
	private claimedBytes = 0
	/** Diagnostic evictions under critical pressure. */
	evictedDiagnostic = 0
	rejectedCritical = 0
	rejectedDiagnostic = 0

	private liveItems(): number {
		return this.items.length
	}

	private liveBytes(): number {
		return this.items.reduce((sum, item) => sum + item.bytes, 0)
	}

	private diagnosticLive(): { items: number; bytes: number } {
		let items = 0
		let bytes = 0
		for (const item of this.items)
			if (!isCritical(item)) {
				items++
				bytes += item.bytes
			}
		return { items, bytes }
	}

	/** Returns false when the record is rejected (caller counts, never blocks). */
	offer(item: QueuedFact): boolean {
		if (!isCritical(item)) {
			const live = { items: this.liveItems() + this.claimed, bytes: this.liveBytes() + this.claimedBytes }
			if (live.items >= QUEUE_MAX_ITEMS || live.bytes + item.bytes > QUEUE_MAX_BYTES) {
				this.rejectedDiagnostic++
				return false
			}
			const diag = this.diagnosticLive()
			const diagItemsMax = QUEUE_MAX_ITEMS - CRITICAL_RESERVED_ITEMS - this.claimed
			const diagBytesMax = QUEUE_MAX_BYTES - CRITICAL_RESERVED_BYTES - this.claimedBytes
			if (diag.items + 1 > Math.max(0, diagItemsMax) || diag.bytes + item.bytes > Math.max(0, diagBytesMax)) {
				this.rejectedDiagnostic++
				return false
			}
		} else {
			this.evictFor(item)
			const live = { items: this.liveItems() + this.claimed, bytes: this.liveBytes() + this.claimedBytes }
			if (live.items >= QUEUE_MAX_ITEMS || live.bytes + item.bytes > QUEUE_MAX_BYTES) {
				this.rejectedCritical++
				return false
			}
		}
		this.items.push(item)
		return true
	}

	private evictFor(item: QueuedFact): void {
		const live = { items: this.liveItems() + this.claimed, bytes: this.liveBytes() + this.claimedBytes }
		while (
			(live.items >= QUEUE_MAX_ITEMS || live.bytes + item.bytes > QUEUE_MAX_BYTES) &&
			this.items.some((queued) => !isCritical(queued))
		) {
			const index = this.items.findIndex((queued) => !isCritical(queued))
			const [removed] = this.items.splice(index, 1)
			live.items--
			live.bytes -= removed.bytes
			this.evictedDiagnostic++
		}
	}

	/** Claim a batch for the writer; claimed items stay budgeted until release. */
	claim(maxItems: number, maxBytes: number): QueuedFact[] {
		const batch: QueuedFact[] = []
		let bytes = 0
		while (this.items.length > 0 && batch.length < maxItems && bytes + this.items[0].bytes <= maxBytes) {
			const item = this.items.shift()!
			batch.push(item)
			bytes += item.bytes
			this.claimed++
			this.claimedBytes += item.bytes
		}
		return batch
	}

	release(batch: QueuedFact[]): void {
		this.claimed = Math.max(0, this.claimed - batch.length)
		this.claimedBytes = Math.max(0, this.claimedBytes - batch.reduce((sum, item) => sum + item.bytes, 0))
	}

	/** Return a claimed batch to the queue head (write failed — keep order). */
	requeue(batch: QueuedFact[]): void {
		this.items.unshift(...batch)
		this.claimed = Math.max(0, this.claimed - batch.length)
		this.claimedBytes = Math.max(0, this.claimedBytes - batch.reduce((sum, item) => sum + item.bytes, 0))
	}

	depth(): { items: number; bytes: number } {
		return { items: this.liveItems(), bytes: this.liveBytes() }
	}

	oldestAgeMs(now: number): number {
		let oldest: number | undefined
		for (const item of this.items) oldest = oldest === undefined ? item.at : Math.min(oldest, item.at)
		return oldest === undefined ? 0 : Math.max(0, now - oldest)
	}
}
