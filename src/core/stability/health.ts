/**
 * Collector self-health (design §7, M16). Emits telemetry.health at most once
 * per 30s OR immediately when the drop counter changes (loss visibility).
 * Data carries the drop/write_error INCREMENTS since the last emitted health
 * fact plus current depth_bytes/oldest_age_ms gauges and the webview bridge
 * overflow counter increment. Collector failures report only to a caller
 * provided sink (rate limited there) — this class never records itself
 * recursively.
 */
import type { Recorder, RecorderCounters } from "./recorder"
import type { StabilityQueue } from "./queue"
import type { Clock } from "./clock"

export interface HealthDeps {
	recorder: Recorder
	queue: StabilityQueue
	clock: Clock
	intervalMs?: number
}

export class Health {
	private readonly deps: Required<Pick<HealthDeps, "intervalMs">> & HealthDeps
	private lastEmit = 0
	private lastDrop = 0
	private lastWriteError = 0
	private lastWriteDrop = 0
	private lastWebviewFull = 0
	private timer: ReturnType<typeof setInterval> | undefined
	writeError = 0
	writeDrop = 0
	webviewBufferFull = 0

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

	private lossChanged(): boolean {
		return (
			this.totalDrop(this.deps.recorder.counters) !== this.lastDrop ||
			this.writeError !== this.lastWriteError ||
			this.writeDrop !== this.lastWriteDrop ||
			this.webviewBufferFull !== this.lastWebviewFull
		)
	}

	private totalDrop(counters: RecorderCounters): number {
		return (
			counters.droppedInvalid +
			counters.droppedCapacity +
			counters.droppedQuota +
			counters.disabledPolicy +
			counters.disabledShutdown +
			counters.disabledStandby
		)
	}

	private emit(now: number): void {
		const counters = this.deps.recorder.counters
		const drop = this.totalDrop(counters)
		const depth = this.deps.queue.depth()
		this.deps.recorder.record({
			name: "telemetry.health",
			kind: "health",
			channel: "critical",
			data: {
				drop: drop - this.lastDrop + (this.writeDrop - this.lastWriteDrop),
				write_error: this.writeError - this.lastWriteError,
				depth_bytes: depth.bytes,
				oldest_age_ms: this.deps.queue.oldestAgeMs(now),
				webview_buffer_full: this.webviewBufferFull - this.lastWebviewFull,
			},
		})
		this.lastEmit = now
		this.lastDrop = drop
		this.lastWriteError = this.writeError
		this.lastWriteDrop = this.writeDrop
		this.lastWebviewFull = this.webviewBufferFull
	}
}
