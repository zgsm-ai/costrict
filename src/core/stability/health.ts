/**
 * Collector self-health (design §7, M16). Emits telemetry.health at most once
 * per 30s OR immediately when a loss counter changes (loss visibility). Data
 * carries drop/write_error INCREMENTS since the last emitted health fact plus
 * current depth_bytes/oldest_age_ms gauges and the webview bridge overflow
 * counter increment. The drop increment is additionally broken down by reason
 * (key names aligned with the JetBrains 2026-09-23 health change; the cs-cloud
 * v2 branch parses them): invalid (dictionary/validate/encode), contention
 * (pipeline not accepting: standby/shutdown), capacity (queue or storage
 * budget full), policy (declined or retired epoch), oversize and failure
 * (constants in v1 — no such drop path exists yet), evicted (file budget
 * rewrite). drop_failure is excluded from `drop` and flips `quality` to
 * "degraded" for the rest of the run. Collector failures report only to a
 * caller provided sink (rate limited there) — this class never records itself
 * recursively.
 */
import type { Recorder, RecorderCounters } from "./recorder"
import type { StabilityQueue } from "./queue"
import type { Clock } from "./clock"

export type DropReason =
	| "drop_invalid"
	| "drop_contention"
	| "drop_capacity"
	| "drop_policy"
	| "drop_oversize"
	| "drop_evicted"
	| "drop_failure"

const REASONS: readonly DropReason[] = [
	"drop_invalid",
	"drop_contention",
	"drop_capacity",
	"drop_policy",
	"drop_oversize",
	"drop_evicted",
	"drop_failure",
]

export interface HealthDeps {
	recorder: Recorder
	queue: StabilityQueue
	clock: Clock
	intervalMs?: number
}

const zeros = (): Record<DropReason, number> => ({
	drop_invalid: 0,
	drop_contention: 0,
	drop_capacity: 0,
	drop_policy: 0,
	drop_oversize: 0,
	drop_evicted: 0,
	drop_failure: 0,
})

export class Health {
	private readonly deps: Required<Pick<HealthDeps, "intervalMs">> & HealthDeps
	private lastEmit = 0
	private baseline = zeros()
	private lastWriteError = 0
	private lastWebviewFull = 0
	private timer: ReturnType<typeof setInterval> | undefined
	writeError = 0
	webviewBufferFull = 0
	/** Write-gate drops by reason, fed by the writer's onWriteDrop. */
	writeDropPolicy = 0
	writeDropInvalid = 0
	/** Budget-rewrite evictions, fed by retention's onEvict. */
	evicted = 0

	constructor(deps: HealthDeps) {
		this.deps = { intervalMs: 30_000, ...deps }
	}

	start(): void {
		this.timer = setInterval(() => this.poll(), this.deps.intervalMs)
		this.timer.unref?.()
	}

	stop(): void {
		if (this.timer) clearInterval(this.timer)
		this.timer = undefined
	}

	poll(): void {
		const now = this.deps.clock.wall()
		if (now - this.lastEmit < this.deps.intervalMs && !this.lossChanged()) return
		this.emit(now)
	}

	/** Cumulative per-reason totals from all loss sources. */
	private reasons(counters: RecorderCounters): Record<DropReason, number> {
		return {
			drop_invalid: counters.droppedInvalid + this.writeDropInvalid,
			drop_contention: counters.disabledStandby + counters.disabledShutdown,
			drop_capacity: counters.droppedCapacity + counters.droppedQuota,
			drop_policy: counters.disabledPolicy + this.writeDropPolicy,
			drop_oversize: 0,
			drop_evicted: this.evicted,
			drop_failure: 0,
		}
	}

	private lossChanged(): boolean {
		const current = this.reasons(this.deps.recorder.counters)
		return (
			REASONS.some((key) => current[key] !== this.baseline[key]) ||
			this.writeError !== this.lastWriteError ||
			this.webviewBufferFull !== this.lastWebviewFull
		)
	}

	private emit(now: number): void {
		const counters = this.deps.recorder.counters
		const current = this.reasons(counters)
		const depth = this.deps.queue.depth()
		const data: Record<string, number | string> = {
			// drop_failure never folds into the aggregate (its loss class has
			// its own quality signal) — mirrors the JetBrains accounting.
			drop: REASONS.filter((k) => k !== "drop_failure").reduce(
				(sum, k) => sum + (current[k] - this.baseline[k]),
				0,
			),
			write_error: this.writeError - this.lastWriteError,
			depth_bytes: depth.bytes,
			oldest_age_ms: this.deps.queue.oldestAgeMs(now),
			webview_buffer_full: this.webviewBufferFull - this.lastWebviewFull,
		}
		for (const key of REASONS) data[key] = current[key] - this.baseline[key]
		data.quality = current.drop_failure > 0 ? "degraded" : "good"
		const status = this.deps.recorder.record({
			name: "telemetry.health",
			kind: "health",
			channel: "critical",
			data,
		})
		this.lastEmit = now
		if (status !== "queued") return // not persisted: keep the loss window visible
		this.baseline = current
		this.lastWriteError = this.writeError
		this.lastWebviewFull = this.webviewBufferFull
	}
}
