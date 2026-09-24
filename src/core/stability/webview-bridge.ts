/**
 * webview bridge receiver (design §5). Webview facts arrive as UNTRUSTED
 * input over postMessage: every draft is validated against the dictionary
 * (reject, never trim), sized, and only then re-recorded with side=webview
 * through the normal admission gate. The host mints event_id/seq and stamps
 * the webview capture time (t_wall) as the fact timestamp. Bridge overflow
 * counts into telemetry.health.webview_buffer_full; validation never blocks
 * the message loop.
 */
import { validate } from "./dictionary"
import type { Channel, FactContext, FactKind, Draft } from "./fact"
import type { StabilityService } from "./service"

/** Minimal wire draft as sent by the webview SDK. */
export interface WireDraft {
	name: unknown
	kind: unknown
	channel?: unknown
	context?: unknown
	data?: unknown
	t_wall?: unknown
	t_mono?: unknown
}

export interface StabilityFactsMessage {
	type: "stabilityFacts"
	schema?: unknown
	facts?: unknown
	dropped?: unknown
}

export const BRIDGE_BATCH_MAX_RECORDS = 100
export const BRIDGE_BATCH_MAX_BYTES = 256 * 1024

const KINDS: readonly FactKind[] = [
	"operation",
	"transition",
	"lifecycle",
	"interval",
	"diagnostic",
	"health",
	"sample",
]
const CHANNELS: readonly Channel[] = ["critical", "diagnostic"]
const CONTEXT_KEYS = ["operation_id", "attempt_id", "fault_id", "trace_id", "workspace_id"] as const

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v)

/** Strict conversion of one untrusted wire draft; undefined = reject. */
export const toDraft = (raw: unknown): Draft | undefined => {
	if (!isRecord(raw)) return undefined
	if (typeof raw.name !== "string" || typeof raw.kind !== "string") return undefined
	const kind = KINDS.find((k) => k === raw.kind)
	if (!kind) return undefined
	const channel = raw.channel === undefined ? "critical" : CHANNELS.find((c) => c === raw.channel)
	if (!channel) return undefined
	if (!isRecord(raw.data)) return undefined
	let context: FactContext | undefined
	if (raw.context !== undefined) {
		if (!isRecord(raw.context)) return undefined
		context = {}
		for (const [key, value] of Object.entries(raw.context)) {
			if (!(CONTEXT_KEYS as readonly string[]).includes(key)) return undefined
			if (typeof value !== "string" || value.length === 0 || value.length > 64) return undefined
			context[key as keyof FactContext] = value
		}
	}
	const tWall =
		typeof raw.t_wall === "number" && Number.isFinite(raw.t_wall) && raw.t_wall > 0 ? raw.t_wall : undefined
	const tMono =
		typeof raw.t_mono === "number" && Number.isFinite(raw.t_mono) && raw.t_mono >= 0 ? raw.t_mono : undefined
	if (raw.t_wall !== undefined && tWall === undefined) return undefined
	if (raw.t_mono !== undefined && tMono === undefined) return undefined
	return {
		name: raw.name,
		kind,
		channel,
		data: raw.data,
		...(context ? { context } : {}),
		...(tWall !== undefined ? { t_wall: tWall } : {}),
		...(tMono !== undefined ? { t_mono: tMono } : {}),
		side: "webview",
	}
}

export interface BridgeOutcome {
	accepted: number
	rejected: number
	overflowed: number
}

/** Handle one stabilityFacts message; returns the outcome for diagnostics. */
export const receiveStabilityFacts = (
	service: StabilityService,
	message: StabilityFactsMessage,
	onFact?: (draft: Draft) => void,
): BridgeOutcome => {
	const outcome: BridgeOutcome = { accepted: 0, rejected: 0, overflowed: 0 }
	if (!Array.isArray(message.facts)) return outcome
	const dropped =
		typeof message.dropped === "number" && Number.isFinite(message.dropped) && message.dropped > 0
			? Math.floor(message.dropped)
			: 0
	if (dropped > 0) outcome.overflowed += dropped
	const budget = { records: BRIDGE_BATCH_MAX_RECORDS, bytes: BRIDGE_BATCH_MAX_BYTES }
	for (const raw of message.facts) {
		if (budget.records <= 0) {
			outcome.overflowed++
			continue
		}
		const draft = toDraft(raw)
		if (!draft) {
			outcome.rejected++
			continue
		}
		const bytes = Buffer.byteLength(JSON.stringify(draft.data), "utf8")
		if (bytes > 32 * 1024 || bytes > budget.bytes) {
			outcome.rejected++
			continue
		}
		budget.records--
		budget.bytes -= bytes
		if (validate(draft).length > 0) {
			outcome.rejected++
			continue
		}
		const status = service.record(draft)
		if (status === "queued") {
			outcome.accepted++
			onFact?.(draft)
		}
	}
	if (outcome.overflowed > 0) {
		const health = service.healthCounts
		if (health) health.webviewBufferFull += outcome.overflowed
	}
	// v2: mirror only anomalous batches — rejections and overflows are real
	// protocol failures worth a payload; healthy batches stay silent.
	if (outcome.rejected > 0 || outcome.overflowed > 0) {
		const preview = JSON.stringify(message).slice(0, 2048)
		service.mirror({
			severity: "warn",
			component: "webview",
			message: `stability bridge anomalies: rejected=${outcome.rejected} overflowed=${outcome.overflowed}`,
			payloads: { bridge_batch: () => preview },
		})
	}
	return outcome
}
