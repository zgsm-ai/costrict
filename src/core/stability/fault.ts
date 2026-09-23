/**
 * Safe fault capture (design §4, JetBrains 6.2). One fault produces a minimal
 * COUNT fact (critical, metrics — never reduced by detail rate limiting) and,
 * when logs purposes permit, a rate-limited DETAIL fact (diagnostic, logs —
 * same fault_id, different event_id). The detail message is a fixed template
 * plus controlled enums — NEVER the raw exception first line; raw messages
 * may carry tokens, code, usernames and paths, and truncation is not
 * redaction. Fingerprints hash the error class plus ≤5 sanitized frames from
 * our own package. Rate limit: 3 details per fingerprint per rolling minute,
 * overflow aggregated into count=N summaries; the rate-key table is capped
 * (fixed overflow fingerprint). AbortError and normal cancellations are not
 * faults.
 */
import { createHash } from "crypto"
import type { Recorder } from "./recorder"
import type { Clock } from "./clock"
import { randomId } from "./ids"

const DETAIL_MAX_PER_MINUTE = 3
const RATE_TABLE_MAX = 1024
const FRAME_MAX = 5
const FRAME_BYTES = 1024

export type FaultComponent = "host" | "webview" | "collector"

const classOf = (err: unknown): string => {
	if (err instanceof TypeError) return "type_error"
	if (err instanceof RangeError) return "range_error"
	if (err instanceof SyntaxError) return "syntax_error"
	if (err instanceof ReferenceError) return "reference_error"
	if (err instanceof Error && /network|fetch|connect|timeout/i.test(err.message)) return "network_error"
	return "other"
}

export const isAbort = (err: unknown): boolean =>
	err instanceof Error && (err.name === "AbortError" || err.name === "CancellationException")

/** module#function frames from our own package only — no file, line, message or cause. */
const framesOf = (err: unknown): string[] => {
	if (!(err instanceof Error) || !err.stack) return []
	const frames: string[] = []
	for (const line of err.stack.split("\n")) {
		const match = /at\s+([\w$]+)\s+\(?(?:.*[\\/](?:src|dist)[\\/](?:core[\\/]stability[\\/])?([\w.-]+))/.exec(line)
		if (match) frames.push(`${match[2].replace(/\.[jt]s$/, "")}#${match[1]}`)
		if (frames.length >= FRAME_MAX) break
	}
	return frames
}

const fingerprintOf = (err: unknown): string => {
	const hash = createHash("sha256")
	hash.update(classOf(err))
	for (const frame of framesOf(err)) hash.update(frame)
	return `fp-${hash.digest("hex").slice(0, 24)}`
}

interface RateEntry {
	windowStart: number
	count: number
	summarized: number
}

export interface FaultDeps {
	recorder: Recorder
	clock: Clock
	/** Fixed detail template tokens (controlled enums, no raw text). */
	component?: FaultComponent
}

export class Faults {
	private readonly deps: FaultDeps
	private readonly recent = new Set<string>()
	private readonly recentOrder: string[] = []
	private readonly rates = new Map<string, RateEntry>()

	constructor(deps: FaultDeps) {
		this.deps = deps
	}

	/**
	 * Report one fault; returns the fault id (or undefined when skipped:
	 * aborts, or the caller-provided fault id was already reported this run —
	 * same fault_id counts once, distinct fault_ids may share a fingerprint
	 * whose DETAILS are then rate limited).
	 */
	report(err: unknown, component: FaultComponent, handled: boolean, faultId?: string): string | undefined {
		if (isAbort(err)) return undefined
		const id = faultId ?? randomId("fault")
		if (this.recent.has(id)) return undefined
		this.recent.add(id)
		this.recentOrder.push(id)
		if (this.recentOrder.length > RATE_TABLE_MAX) {
			const evicted = this.recentOrder.shift()
			if (evicted !== undefined) this.recent.delete(evicted)
		}
		const fingerprint = fingerprintOf(err)
		const errorClass = classOf(err)

		this.deps.recorder.record({
			name: handled ? "error.reported" : "error.uncaught",
			kind: "diagnostic",
			channel: "critical",
			data: { fault_id: id, error_class: errorClass, handled, fingerprint, component },
			context: { fault_id: id },
		})

		this.detail(err, fingerprint, component, errorClass)
		return id
	}

	private detail(err: unknown, fingerprint: string, component: FaultComponent, errorClass: string): void {
		const now = this.deps.clock.wall()
		const windowStart = Math.floor(now / 60_000) * 60_000
		let entry = this.rates.get(fingerprint)
		if (!entry || entry.windowStart !== windowStart) {
			// Lazy summary flush of the previous window's overflow.
			if (entry && entry.summarized > 0) {
				this.emitDetail(fingerprint, component, errorClass, entry.summarized, err)
			}
			entry = { windowStart, count: 0, summarized: 0 }
			this.rates.set(fingerprint, entry)
			if (this.rates.size > RATE_TABLE_MAX) {
				const oldest = this.rates.keys().next().value
				if (oldest !== undefined) this.rates.delete(oldest)
			}
		}
		if (entry.count < DETAIL_MAX_PER_MINUTE) {
			entry.count++
			this.emitDetail(fingerprint, component, errorClass, 1, err)
		} else {
			entry.summarized++
		}
	}

	private emitDetail(
		fingerprint: string,
		component: FaultComponent,
		errorClass: string,
		count: number,
		err: unknown,
	): void {
		// Fixed template + controlled enums only — never the raw message.
		const message = `fault:${component}:${errorClass}`
		const frames = framesOf(err)
		this.deps.recorder.record({
			name: "error.reported",
			kind: "diagnostic",
			channel: "diagnostic",
			data: {
				message,
				...(frames.length > 0 ? { frames: frames.join("|").slice(0, FRAME_BYTES) } : {}),
				fingerprint,
				count,
			},
			purposes: ["logs"],
		})
	}
}
