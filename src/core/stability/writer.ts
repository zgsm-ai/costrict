/**
 * Single-file append writer (design §2/§3). One dedicated asynchronous loop,
 * single writer per file, one write() call per line INCLUDING the trailing
 * LF; append-only. Batch flush+fsync: fsync when a batch was written AND
 * (backlog remains OR 16 records/64KiB thresholds OR 30s since last fsync).
 * Before EVERY disk write each fact is re-permitted against the current
 * clock (expiry never waits for the next poll) and retired-epoch facts are
 * dropped (never rebound). The writer tolerates its own file being deleted
 * (recreates on the next append). IO failures count write_error, requeue the
 * batch and stop the round; startup layout failure is sticky DISABLED with a
 * retry on the next cycle.
 */
import { promises as fs } from "fs"
import { encodeLine } from "./fact"
import type { PolicyStore } from "./policy"
import type { QueuedFact, StabilityQueue } from "./queue"
import type { Clock } from "./clock"

const BATCH_MAX_ITEMS = 128
const BATCH_MAX_BYTES = 512 * 1024
const FSYNC_BATCH_RECORDS = 16
const FSYNC_BATCH_BYTES = 64 * 1024
const FSYNC_INTERVAL_MS = 30_000
const TICK_MS = 1_000
const CLOSE_TIMEOUT_MS = 10_000

export type WriterState = "CREATED" | "ACTIVE" | "DISABLED" | "CLOSED"

export interface WriterDeps {
	queue: StabilityQueue
	policy: PolicyStore
	clock: Clock
	/** Absolute path of this producer's single append file. */
	filePath: string
	/** Parent directory (created 0700 on first open). */
	dirPath: string
	/** write_error increments sink (health). */
	onWriteError: (count: number) => void
	/** Facts dropped at the write gate (re-permit/retired epoch/oversize). */
	onWriteDrop: (count: number) => void
	/** Local-only notice for external file interference (truncation/append). */
	onExternalChange?: (message: string) => void
	intervalMs?: number
}

export class Writer {
	private readonly deps: Required<Pick<WriterDeps, "intervalMs">> & WriterDeps
	private state: WriterState = "CREATED"
	private handle: fs.FileHandle | undefined
	private lastFsync = 0
	private timer: ReturnType<typeof setInterval> | undefined
	private flushing = false
	private disabledReason = ""
	/** Bytes present when we (re)opened the file; append position baseline. */
	private baseline = 0
	/** Bytes this writer appended since open — external-change detection. */
	private appended = 0

	constructor(deps: WriterDeps) {
		this.deps = { intervalMs: TICK_MS, ...deps }
	}

	getState(): WriterState {
		return this.state
	}

	getDisabledReason(): string {
		return this.disabledReason
	}

	async start(): Promise<void> {
		await this.open()
		if (this.state !== "DISABLED") this.state = "ACTIVE"
		this.timer = setInterval(() => void this.tick(), this.deps.intervalMs)
		this.timer.unref?.()
	}

	private async open(): Promise<void> {
		try {
			await fs.mkdir(this.deps.dirPath, { recursive: true, mode: 0o700 })
			// Single-file layout: a crashed predecessor (or sibling window) may
			// have left a torn tail without LF — pad the line boundary BEFORE we
			// append so our first line never glues onto it (the torn fragment
			// becomes an isolatable bad line for the consumer). The append fd is
			// write-only, so probe the last byte through a read-only handle.
			const size = await fs.stat(this.deps.filePath).then(
				(s) => s.size,
				() => 0,
			)
			if (size > 0) {
				const probe = await fs.open(this.deps.filePath, "r")
				try {
					const buffer = Buffer.alloc(1)
					const read = await probe.read(buffer, 0, 1, size - 1)
					if (read.bytesRead === 1 && buffer[0] !== 0x0a) {
						const pad = await fs.open(this.deps.filePath, "a", 0o600)
						try {
							await pad.write("\n")
						} finally {
							await pad.close()
						}
					}
				} finally {
					await probe.close()
				}
			}
			this.handle = await fs.open(this.deps.filePath, "a", 0o600)
			this.state = "ACTIVE"
			// Rebaseline after every (re)open — our append position starts here
			// (includes the pad byte when one was written).
			this.appended = 0
			this.baseline = await this.handle.stat().then(
				(s) => s.size,
				() => 0,
			)
		} catch {
			this.state = "DISABLED"
			this.disabledReason = "open_failed"
		}
	}

	private async tick(): Promise<void> {
		if (this.flushing) return
		this.flushing = true
		try {
			await this.round()
		} finally {
			this.flushing = false
		}
	}

	private isActive(): boolean {
		return this.state === "ACTIVE"
	}

	/** One drain round; also the flush barrier for close(). */
	async round(): Promise<void> {
		if (this.state === "CLOSED") return
		if (!this.isActive()) {
			// Sticky with retry on the next cycle (layout may heal, e.g. disk freed).
			await this.open()
			if (!this.isActive()) return
		}
		const batch = this.deps.queue.claim(BATCH_MAX_ITEMS, BATCH_MAX_BYTES)
		if (batch.length === 0) return
		const lines = this.settle(batch)
		if (lines.length === 0) {
			this.deps.queue.release(batch)
			return
		}
		let bytes = 0
		try {
			if (!this.handle || this.state !== "ACTIVE") throw new Error("writer not active")
			// Writing to a deleted file's fd succeeds silently — detect deletion
			// proactively so the next append recreates the file.
			try {
				const current = await fs.stat(this.deps.filePath)
				// External truncation/rotation guard: another actor (consumer,
				// log rotator) must never rewrite our append file silently —
				// surface it as a write_error and rebaseline so the loss is
				// visible in telemetry.health instead of vanishing.
				const expected = this.baseline + this.appended
				if (current.size !== expected) {
					this.deps.onWriteError(1)
					this.deps.onExternalChange?.(
						`outbox file size ${current.size} != expected ${expected} (external truncation or append)`,
					)
					this.baseline = current.size
					this.appended = 0
					// A truncation mid-line leaves no trailing LF — re-establish the
					// line boundary so our appends stay parseable (the torn fragment
					// becomes an isolatable bad line for the consumer, per contract).
					// The append fd is write-only; probe the last byte read-only.
					if (current.size > 0 && this.handle) {
						try {
							const probe = await fs.open(this.deps.filePath, "r")
							try {
								const buffer = Buffer.alloc(1)
								const read = await probe.read(buffer, 0, 1, current.size - 1)
								if (read.bytesRead === 1 && buffer[0] !== 0x0a) {
									await this.handle.write("\n")
									this.baseline += 1
								}
							} finally {
								await probe.close()
							}
						} catch {
							// Probe failure is not fatal — the consumer isolates bad lines.
						}
					}
				}
			} catch {
				// ENOENT path: our file was deleted (tolerated by contract), but
				// facts already written to the deleted inode are LOST — surface the
				// loss as a write_error with the byte count instead of silently
				// restarting from an empty file (field-verified blind spot).
				const lost = this.baseline + this.appended
				if (lost > 0) {
					this.deps.onWriteError(1)
					this.deps.onExternalChange?.(
						`outbox file deleted externally (~${lost} bytes of written facts lost)`,
					)
				}
				await this.handle.close()
				this.handle = undefined
				await this.open()
				if (!this.handle || this.state !== "ACTIVE") throw new Error("reopen failed")
			}
			for (const line of lines) {
				// One write per line including the trailing LF.
				await this.handle.write(line + "\n")
				bytes += Buffer.byteLength(line) + 1
			}
			this.appended += bytes
			const backlog = this.deps.queue.depth().items > 0
			const now = this.deps.clock.wall()
			if (
				backlog ||
				lines.length >= FSYNC_BATCH_RECORDS ||
				bytes >= FSYNC_BATCH_BYTES ||
				now - this.lastFsync >= FSYNC_INTERVAL_MS
			) {
				await this.handle.sync()
				this.lastFsync = now
			}
			this.deps.queue.release(batch)
		} catch {
			this.deps.onWriteError(1)
			// ENOENT: our file was deleted (allowed) — recreate and retry next round.
			try {
				await this.handle?.close()
			} catch {
				// already closed
			}
			this.handle = undefined
			await this.open()
			this.deps.queue.requeue(batch)
		}
	}

	/** Write-gate settlement: re-permit, drop retired epochs, real-encode check. */
	private settle(batch: QueuedFact[]): string[] {
		const lines: string[] = []
		let dropped = 0
		for (const item of batch) {
			const permitted = this.deps.policy.current().permit(item.fact.channel, item.fact.purposes)
			if (permitted.length === 0) {
				dropped++
				continue
			}
			if (this.deps.policy.isRetired(item.fact.account_epoch)) {
				dropped++
				continue
			}
			try {
				lines.push(encodeLine(item.fact))
			} catch {
				dropped++
			}
		}
		if (dropped > 0) this.deps.onWriteDrop(dropped)
		return lines
	}

	/** Bounded close: one final round then close the handle. */
	async close(): Promise<void> {
		if (this.state === "CLOSED") return
		if (this.timer) clearInterval(this.timer)
		this.timer = undefined
		const deadline = this.deps.clock.mono() + CLOSE_TIMEOUT_MS
		while (this.deps.queue.depth().items > 0 && this.deps.clock.mono() < deadline) {
			await this.round()
			if (this.state === "DISABLED") break
		}
		try {
			await this.handle?.sync()
			await this.handle?.close()
		} catch {
			this.deps.onWriteError(1)
		}
		this.handle = undefined
		this.state = "CLOSED"
	}
}
