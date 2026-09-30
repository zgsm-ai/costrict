/**
 * Dictionary sweep self-test (design §9 G4). Drives every non-singleton
 * dictionary name through the REAL pipeline (queue → write gate → outbox
 * file) with controlled-vocabulary values — no fake snapshots, no
 * intentionally-invalid drafts. Excludes the run singletons
 * plugin.started/shutdown and telemetry.health (a fabricated health sample
 * would pollute M16). Facts carry the ws-selftest workspace marker so the
 * consumer can exclude them from business denominators. Gated to
 * development/test extension modes — never contributes to prod data.
 */
import type { StabilityService } from "./service"
import type { Draft } from "./fact"

const op = (name: string, fields: Record<string, unknown>, stage?: string): Draft => ({
	name,
	kind: "operation",
	channel: "critical",
	context: { workspace_id: "ws-selftest" },
	data: { phase: "start", deadline_ms: 30_000, ...fields, ...(stage ? { stage } : {}) },
})

const end = (name: string, fields: Record<string, unknown>): Draft => ({
	name,
	kind: "operation",
	channel: "critical",
	context: { workspace_id: "ws-selftest" },
	data: { phase: "end", result: "success", duration_ms: 10, ...fields },
})

export const SELFTEST_EXCLUDED = ["plugin.started", "plugin.shutdown", "telemetry.health"] as const

const drafts = (): Draft[] => [
	// operations (start + end pairs collapse to one representative record each)
	op("webview.setup", {}, "resolve"),
	end("webview.setup", { stage: "ready" }),
	op("panel.load", { trigger: "initial" }),
	end("panel.load", { trigger: "initial" }),
	op("plugin.readiness", {}),
	end("plugin.readiness", { reason: "none" }),
	op("connection", { trigger: "initial" }),
	end("connection", { trigger: "initial", stage: "health" }),
	op("connection.attempt", {}),
	end("connection.attempt", { stage: "server_url" }),
	op("connection.recovery", { intervention: "automatic" }),
	end("connection.recovery", { intervention: "automatic", attempts: 1 }),
	op("csc.detect", {}),
	end("csc.detect", {}),
	op("csc.start", {}, "spawn"),
	end("csc.start", { stage: "health" }),
	op("credentials.ready", {}, "probe"),
	end("credentials.ready", { stage: "wait" }),
	op("session.open", { session_mode: "create" }),
	end("session.open", { session_mode: "create" }),
	op("session.restore", { session_mode: "open" }),
	end("session.restore", { session_mode: "reconnect", stage: "ui" }),
	op("action", { action: "prompt_submit" }),
	end("action", { action: "prompt_submit" }),
	op("rpc", { api_group: "session" }),
	end("rpc", { api_group: "session" }),
	op("ide.operation", { operation: "open_diff" }),
	end("ide.operation", { operation: "open_diff" }),
	// transitions
	{
		name: "connection.state_changed",
		kind: "transition",
		channel: "critical",
		context: { workspace_id: "ws-selftest" },
		data: { from: "connecting", to: "connected", reason: "unknown" },
	},
	{
		name: "webview.state",
		kind: "transition",
		channel: "critical",
		context: { workspace_id: "ws-selftest" },
		data: { component: "app", state: "ready" },
	},
	{
		name: "session.dispose_risk",
		kind: "transition",
		channel: "critical",
		context: { workspace_id: "ws-selftest" },
		data: { dispose_source: "session_deleted", conversation_active: true },
	},
	// interval / sample kinds
	{
		name: "availability",
		kind: "interval",
		channel: "critical",
		context: { workspace_id: "ws-selftest" },
		data: { state: "ready", duration_ms: 30_000 },
	},
	{
		name: "webview.delay",
		kind: "sample",
		channel: "critical",
		context: { workspace_id: "ws-selftest" },
		data: {
			observation_id: "obs-selftest",
			probe_seq: 1,
			scheduled_mono_ms: 1000,
			completed_mono_ms: 1050,
			duration_ms: 50,
			validity: "valid",
		},
	},
	{
		name: "webview.stall",
		kind: "sample",
		channel: "critical",
		context: { workspace_id: "ws-selftest" },
		data: { observation_id: "obs-selftest", duration_ms: 2500 },
	},
	{
		name: "render.apply",
		kind: "sample",
		channel: "critical",
		context: { workspace_id: "ws-selftest" },
		data: {
			duration_ms: 12,
			result: "success",
			component: "thread_bootstrap",
			batch_size_bucket: "1",
			sample_rate: 1,
		},
	},
	{
		name: "resource.snapshot",
		kind: "sample",
		channel: "critical",
		context: { workspace_id: "ws-selftest" },
		data: { resource: "webview", count: 1 },
	},
	// diagnostics: count form + detail form (shared fingerprint, separate events)
	{
		name: "error.reported",
		kind: "diagnostic",
		channel: "critical",
		context: { workspace_id: "ws-selftest", fault_id: "fault-selftest" },
		data: {
			fault_id: "fault-selftest",
			error_class: "type_error",
			handled: true,
			fingerprint: "fp-selftest",
			component: "host",
		},
	},
	{
		name: "error.reported",
		kind: "diagnostic",
		channel: "diagnostic",
		context: { workspace_id: "ws-selftest" },
		data: { message: "fault:host:type_error", fingerprint: "fp-selftest", count: 1 },
		purposes: ["logs"],
	},
	{
		name: "protocol.error",
		kind: "diagnostic",
		channel: "critical",
		context: { workspace_id: "ws-selftest" },
		data: { transport: "sse", stage: "decode", error_code: "decode_failed" },
	},
	// lifecycle: unclean only (started/shutdown are run singletons)
	{
		name: "plugin.unclean",
		kind: "lifecycle",
		channel: "critical",
		context: { workspace_id: "ws-selftest" },
		data: { previous_run_id: "run-selftest", evidence: "no_shutdown_record" },
	},
]

export interface SweepResult {
	attempted: number
	queued: number
	disabled: number
	dropped: number
}

/** Drive the sweep through the live service; every record must queue. */
export const emitDictionarySweep = (service: StabilityService): SweepResult => {
	const result: SweepResult = { attempted: 0, queued: 0, disabled: 0, dropped: 0 }
	for (const draft of drafts()) {
		result.attempted++
		const status = service.record(draft)
		if (status === "queued") result.queued++
		else if (status === "disabled") result.disabled++
		else result.dropped++
	}
	return result
}

export interface DiagnosticSelftestResult {
	/** Incident id assigned to the synthetic failure. */
	incident: string
	/** Mirror records accepted into the bridge (before async drain). */
	mirrored: number
}

/**
 * v2 diagnostics self-test: drive one synthetic failure through the REAL
 * collection chain (bridge mirror → report → count form + parent + payload
 * shards) with a planted credential, so the redaction path is exercised too.
 * Dev/test modes only, like the dictionary sweep.
 */
export const emitDiagnosticSelftest = (service: StabilityService): DiagnosticSelftestResult => {
	const error = new TypeError("selftest: cannot read properties of undefined (reading 'selftest')")
	// Direct report (sync): a real incident id for immediate inspection.
	const incident =
		service.diagnostics?.report({
			severity: "error",
			component: "rpc",
			message: "selftest synthetic rpc failure",
			error,
			attributes: { route: "/api/v1/selftest", method: "GET", code: "typeerror" },
			payloads: { response_body: () => "selftest body with token=planted-secret-value" },
			secrets: ["planted-secret-value"],
		}) ?? "diagnostics-inactive"
	// Bridge mirror (async): exercises the log-mirror drain path.
	service.mirror({
		severity: "warn",
		component: "webview",
		message: "selftest bridge anomaly preview",
		payloads: { bridge_batch: () => "selftest preview" },
	})
	return { incident, mirrored: 1 }
}
