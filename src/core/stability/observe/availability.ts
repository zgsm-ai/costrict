/**
 * Availability observation (design §8, M13). Active = panel visible AND
 * window focused; every state (ready/connecting/blocked/error) counts as
 * active denominator time. At most one open interval per workspace;
 * non-overlapping, 30s slicing keeps intervals bounded; boundaries share one
 * clock read (half-open intervals stay exactly contiguous); pause DISCARDS
 * the open interval (untrusted close time — prefer dropping over fabricating
 * a giant interval). State mapping comes from the connection/readiness
 * observers, never guessed from logs.
 */
import type { StabilityService } from "../service"

const SLICE_MS = 30_000

export type AvailabilityState = "ready" | "connecting" | "blocked" | "error"

export class Availability {
	private readonly service: StabilityService
	private open: { state: AvailabilityState; startedWall: number; startedMono: number } | undefined
	private lastSlice = 0

	constructor(service: StabilityService) {
		this.service = service
	}

	/** Inputs: panel visibility and window focus (contributor union). */
	update(visible: boolean, focused: boolean, state: AvailabilityState, now: number, mono: number): void {
		if (!visible || !focused) {
			// Going inactive closes (not discards) the open interval: the close
			// time is this trusted signal, so the interval is keepable.
			this.close(now, mono)
			return
		}
		if (!this.open) {
			this.open = { state, startedWall: now, startedMono: mono }
			this.lastSlice = now
			return
		}
		if (this.open.state !== state) {
			this.close(now, mono)
			this.open = { state, startedWall: now, startedMono: mono }
			this.lastSlice = now
			return
		}
		if (now - this.lastSlice >= SLICE_MS) {
			// Slice: close and immediately reopen the same state (contiguous).
			this.close(now, mono)
			this.open = { state, startedWall: now, startedMono: mono }
			this.lastSlice = now
		}
	}

	/** Discard the open interval entirely (sleep/suspend — untrusted close). */
	pause(): void {
		this.open = undefined
	}

	private close(now: number, mono: number): void {
		if (!this.open) return
		const duration = Math.max(1, Math.round(mono - this.open.startedMono))
		this.service.record({
			name: "availability",
			kind: "interval",
			channel: "critical",
			data: { state: this.open.state, duration_ms: duration },
		})
		this.open = undefined
	}
}
