/**
 * Connection observation (design §8, M04/M05) — a zero-intrusion wrapper
 * around CsCloudService's public surface. One logical `connection` operation
 * per ensureStarted/reconnect request (trigger initial/manual); each journey
 * drives one `connection.attempt` progressing through discovery stages
 * (setting→server_url→bundled→csc_status→csc_start→health); `connected()`
 * settles the journey and any open recovery; `lost(reason)` opens exactly ONE
 * recovery interval plus one state_changed transition (multi-signal loss
 * dedups to one); recovery trigger never creates M04 denominators; close
 * settles everything cancelled and never emits a disconnect.
 */
import type { StabilityService } from "../service"
import type { Operation } from "../operation"

export type LossReason = "server_url_changed" | "process_exit" | "heartbeat_failed" | "health_failed" | "unknown"

export class ConnectionObservation {
	private readonly service: StabilityService
	/** Optional sink fired on every connection state transition (availability re-evaluation). */
	onTransition: (() => void) | undefined
	private journey: Operation | undefined
	private attempt: Operation | undefined
	private recovery: Operation | undefined
	private trigger: "initial" | "manual" | "recovery" = "initial"
	private state: "connecting" | "connected" | "disconnected" = "disconnected"
	private hasConnected = false
	private attempts = 0
	private recovering = false

	constructor(service: StabilityService) {
		this.service = service
	}

	getState(): "connecting" | "connected" | "disconnected" {
		return this.state
	}

	/** True once any journey reached connected — availability state mapping input. */
	hasEverConnected(): boolean {
		return this.hasConnected
	}

	/** A logical connection journey starts (ensureStarted / reconnect). */
	beginJourney(trigger: "initial" | "manual"): void {
		if (this.journey) return // one logical journey at a time
		this.trigger = trigger
		this.attempts = 0
		this.journey = this.service.begin("connection", 30_000, { trigger })
		this.beginAttempt()
		this.setState("connecting", "unknown")
	}

	private beginAttempt(): void {
		this.attempts++
		this.attempt = this.service.begin("connection.attempt", 60_000)
	}

	/** Stage progress inside the current discovery attempt. */
	attemptStage(stage: string): void {
		this.attempt?.progress(stage)
	}

	/** The journey reached a healthy connected state. */
	connected(): void {
		this.attempt?.end("success", { stage: "health" })
		this.attempt = undefined
		const wasRecovering = this.recovering
		const attempts = this.attempts
		this.journey?.end("success")
		this.journey = undefined
		this.recovering = false
		this.attempts = 0
		this.hasConnected = true
		this.setState("connected", "unknown")
		if (wasRecovering) {
			this.recovery?.end("success", { intervention: "automatic", attempts })
			this.recovery = undefined
		}
	}

	/** A terminal failure (no more retries) — never misclassified as timeout. */
	failed(errorCode: string): void {
		this.attempt?.end("failure", { error_code: errorCode, cause: "cs_cloud" })
		this.attempt = undefined
		this.journey?.end("failure", { error_code: errorCode, cause: "cs_cloud" })
		this.journey = undefined
		this.setState("disconnected", "unknown")
	}

	/**
	 * A ready connection was lost — opens ONE recovery interval regardless of
	 * how many supervision signals (watch/heartbeat/health) fire.
	 */
	lost(reason: LossReason): void {
		if (this.recovering) return // dedup multi-signal loss
		this.recovering = true
		this.setState("disconnected", reason)
		this.trigger = "recovery"
		this.recovery = this.service.begin("connection.recovery", 120_000, { intervention: "automatic" })
		this.beginAttempt()
	}

	private setState(to: "connecting" | "connected" | "disconnected", reason: string): void {
		const from = this.state
		if (from === to && to !== "disconnected") return
		this.service.record({
			name: "connection.state_changed",
			kind: "transition",
			channel: "critical",
			data: { from, to, reason },
		})
		this.state = to
		this.onTransition?.()
	}

	/** Settle everything cancelled; never emits a disconnect. */
	close(): void {
		this.attempt?.end("cancelled")
		this.recovery?.end("cancelled")
		this.journey?.end("cancelled")
		this.attempt = undefined
		this.recovery = undefined
		this.journey = undefined
	}
}
