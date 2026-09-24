/**
 * Operation pairing (design §3, JetBrains 6.2). start/progress/end with a CAS
 * single terminal: the deadline timer and the business end race, first-wins;
 * a business completion after the timer keeps the settled timeout (late
 * completion adds nothing in v1). The timer never cancels the business call.
 * Reserved machinery keys (phase/deadline_ms/result/duration_ms…) are always
 * set by the operation itself — callers cannot override them. begin snapshots
 * epoch and purposes; end keeps the begin-time epoch (never rebinds across
 * account switches) and purposes may only shrink.
 */
import { randomId } from "./ids"
import type { FactContext, Purpose } from "./fact"
import type { Recorder } from "./recorder"
import type { Clock } from "./clock"

export type OpResult = "success" | "failure" | "timeout" | "blocked" | "cancelled" | "unknown"

export interface OperationDeps {
	recorder: Recorder
	clock: Clock
	name: string
	deadlineMs: number
	/** Business fields for phase=start (must not include machinery keys). */
	fields?: Record<string, unknown>
	context?: FactContext
	purposes?: Purpose[]
}

const RESERVED = new Set(["phase", "deadline_ms", "result", "duration_ms"])

export class Operation {
	private readonly deps: OperationDeps
	private readonly startedMono: number
	private readonly startedWall: number
	private readonly epoch: string | undefined
	/** Correlation handle for v2 diagnostics context (never written to v1 facts). */
	readonly id = randomId("op")
	private settled = false
	private timer: ReturnType<typeof setTimeout> | undefined

	private constructor(deps: OperationDeps) {
		this.deps = deps
		this.startedMono = deps.clock.mono()
		this.startedWall = deps.clock.wall()
		this.epoch = deps.recorder.epoch()
		this.timer = setTimeout(() => this.settle("timeout", { cause: "unknown", stage: "unknown" }), deps.deadlineMs)
		this.timer.unref?.()
	}

	static begin(deps: OperationDeps): Operation {
		const op = new Operation(deps)
		op.record("start", deps.fields ?? {})
		return op
	}

	get isSettled(): boolean {
		return this.settled
	}

	progress(stage: string, fields: Record<string, unknown> = {}): void {
		if (this.settled) return
		this.record("progress", { stage, ...fields })
	}

	end(result: OpResult, fields: Record<string, unknown> = {}): void {
		if (result === "timeout") {
			this.settle("timeout", fields)
			return
		}
		this.settle(result, fields)
	}

	/** Settle as cancelled (business abort) — no timeout re-judgement. */
	cancel(fields: Record<string, unknown> = {}): void {
		this.settle("cancelled", fields)
	}

	private settle(result: OpResult, fields: Record<string, unknown>): void {
		if (this.settled) return
		this.settled = true
		if (this.timer) clearTimeout(this.timer)
		this.timer = undefined
		const duration =
			result === "timeout"
				? this.deps.deadlineMs
				: Math.max(0, Math.round(this.deps.clock.mono() - this.startedMono))
		this.record("end", fields, { result, duration_ms: duration })
	}

	private record(phase: string, fields: Record<string, unknown>, machinery: Record<string, unknown> = {}): void {
		// Every phase record is self-contained: begin identity fields merge in
		// first, phase-specific fields override, machinery keys win last.
		const data: Record<string, unknown> = {}
		for (const [key, value] of Object.entries(this.deps.fields ?? {})) if (!RESERVED.has(key)) data[key] = value
		for (const [key, value] of Object.entries(fields ?? {})) if (!RESERVED.has(key)) data[key] = value
		Object.assign(data, machinery)
		data.phase = phase
		if (phase === "start") data.deadline_ms = this.deps.deadlineMs
		this.deps.recorder.record({
			name: this.deps.name,
			kind: "operation",
			channel: "critical",
			data,
			// operation_id context (v1-minor additive) enables consumer-side
			// start/end pairing and unclean unfinished-operation attribution.
			...(this.deps.context || this.id
				? { context: { ...(this.deps.context ?? {}), operation_id: this.id } }
				: {}),
			...(this.epoch ? { epoch: this.epoch } : {}),
			...(this.deps.purposes ? { purposes: this.deps.purposes } : {}),
			t_wall: phase === "start" ? this.startedWall : undefined,
		})
	}
}

/** Convenience wrapper: settle success/failure/timeout from a promise outcome. */
export const endWith = <T>(op: Operation, promise: Promise<T>): Promise<T> =>
	promise.then(
		(value) => {
			op.end("success")
			return value
		},
		(err: unknown) => {
			op.end(err instanceof Error && err.name === "AbortError" ? "cancelled" : "failure")
			throw err
		},
	)
