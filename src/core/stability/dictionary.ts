/**
 * Shared fact dictionary (design §4) — the closed registry of event names.
 * Every draft is validated against per-name key whitelists, types, controlled
 * vocabularies and phase rules; violations REJECT (never trim). purposes
 * projection decides metrics/logs use per name (error family is form-based).
 */
import type { Draft, FactKind, Purpose } from "./fact"

type FieldType = "string" | "token" | "int" | "number" | "bool"

interface FieldRule {
	type: FieldType
	vocab?: readonly string[]
	optional?: boolean
	max?: number
}

interface NameRule {
	kind: FactKind
	fields: Record<string, FieldRule>
	/** Fixed projection, or error-family form-based projection. */
	purposes: readonly Purpose[] | "error-family"
	/** operation kinds require phase semantics (start needs deadline, end needs result). */
	phased: boolean
}

const RESULT: FieldRule = {
	type: "token",
	vocab: ["success", "failure", "timeout", "blocked", "cancelled", "unknown"],
	optional: true,
}
const CAUSE: FieldRule = {
	type: "token",
	vocab: ["plugin", "ide", "cs_cloud", "agent_core", "network", "environment", "user", "unknown"],
	optional: true,
}
const STAGE: FieldRule = { type: "token", optional: true }
const ERROR_CODE: FieldRule = { type: "token", optional: true }
const DURATION: FieldRule = { type: "int", optional: true, max: 2 ** 31 }
const DEADLINE: FieldRule = { type: "int", optional: true, max: 2 ** 31 }

const op = (fields: Record<string, FieldRule>, purposes: readonly Purpose[] = DUAL): NameRule => ({
	kind: "operation",
	fields: {
		phase: { type: "token", vocab: ["start", "progress", "end"] },
		deadline_ms: DEADLINE,
		result: RESULT,
		duration_ms: DURATION,
		cause: CAUSE,
		stage: STAGE,
		error_code: ERROR_CODE,
		...fields,
	},
	purposes,
	phased: true,
})

const DUAL: readonly Purpose[] = ["metrics", "logs"]
const METRICS: readonly Purpose[] = ["metrics"]

export const CONNECTION_STAGES = [
	"setting",
	"server_url",
	"bundled",
	"csc_status",
	"csc_start",
	"health",
	"unknown",
] as const
export const ERROR_CLASSES = [
	"type_error",
	"range_error",
	"syntax_error",
	"reference_error",
	"network_error",
	"abort_error",
	"other",
] as const

export const DICTIONARY: Record<string, NameRule> = {
	"plugin.started": { kind: "lifecycle", fields: {}, purposes: DUAL, phased: false },
	"plugin.shutdown": {
		kind: "lifecycle",
		fields: { end_kind: { type: "token", vocab: ["app_close", "unload"] } },
		purposes: DUAL,
		phased: false,
	},
	"plugin.unclean": {
		kind: "lifecycle",
		fields: { previous_run_id: { type: "token" }, evidence: { type: "token", vocab: ["no_shutdown_record"] } },
		purposes: DUAL,
		phased: false,
	},
	"webview.setup": op({ stage: { type: "token", vocab: ["resolve", "html", "ready", "unknown"], optional: true } }),
	"panel.load": op({
		trigger: { type: "token", vocab: ["initial", "recovery", "reload"], optional: true },
		reason: {
			type: "token",
			vocab: ["none", "server_url_invalid", "token_missing", "assets_missing", "other"],
			optional: true,
		},
	}),
	"plugin.readiness": op({
		reason: { type: "token", vocab: ["none", "credentials_missing", "other"], optional: true },
	}),
	"webview.state": {
		kind: "transition",
		fields: {
			component: { type: "token", vocab: ["app", "stream", "input"] },
			state: {
				type: "token",
				vocab: [
					"starting",
					"ready",
					"degraded",
					"connecting",
					"open",
					"reconnecting",
					"closed",
					"enabled",
					"disabled",
				],
			},
		},
		purposes: DUAL,
		phased: false,
	},
	connection: op({
		trigger: { type: "token", vocab: ["initial", "manual", "recovery"], optional: true },
		stage: { type: "token", vocab: CONNECTION_STAGES, optional: true },
	}),
	"connection.attempt": op({
		stage: { type: "token", vocab: CONNECTION_STAGES, optional: true },
	}),
	"connection.state_changed": {
		kind: "transition",
		fields: {
			from: { type: "token", vocab: ["connecting", "connected", "disconnected"] },
			to: { type: "token", vocab: ["connecting", "connected", "disconnected"] },
			reason: {
				type: "token",
				vocab: ["server_url_changed", "process_exit", "heartbeat_failed", "health_failed", "unknown"],
			},
		},
		purposes: DUAL,
		phased: false,
	},
	"connection.recovery": op({
		intervention: { type: "token", vocab: ["automatic", "manual", "none"], optional: true },
		attempts: { type: "int", optional: true, max: 2 ** 31 },
	}),
	"csc.detect": op({}),
	"csc.start": op({
		stage: { type: "token", vocab: ["spawn", "exit", "health", "unknown"], optional: true },
	}),
	"credentials.ready": op({
		stage: { type: "token", vocab: ["probe", "wait", "unknown"], optional: true },
	}),
	"session.open": op({
		session_mode: { type: "token", vocab: ["create"], optional: true },
	}),
	"session.restore": op({
		session_mode: { type: "token", vocab: ["open", "reconnect"], optional: true },
		stage: { type: "token", vocab: ["history", "pending", "ui", "unknown"], optional: true },
	}),
	action: op({
		action: {
			type: "token",
			vocab: ["prompt_submit", "stop", "permission_reply", "question_reply", "question_reject"],
		},
	}),
	availability: {
		kind: "interval",
		fields: {
			state: { type: "token", vocab: ["ready", "connecting", "blocked", "error"] },
			duration_ms: { type: "int", max: 2 ** 31 },
		},
		purposes: METRICS,
		phased: false,
	},
	"error.uncaught": {
		kind: "diagnostic",
		fields: {
			fault_id: { type: "token", optional: true },
			error_class: { type: "token", vocab: ERROR_CLASSES, optional: true },
			handled: { type: "bool", optional: true },
			fingerprint: { type: "token", optional: true },
			component: { type: "token", vocab: ["host", "webview", "collector"], optional: true },
			message: { type: "string", optional: true, max: 512 },
			frames: { type: "string", optional: true, max: 1024 },
			count: { type: "int", optional: true, max: 2 ** 31 },
		},
		purposes: "error-family",
		phased: false,
	},
	"error.reported": {
		kind: "diagnostic",
		fields: {
			fault_id: { type: "token", optional: true },
			error_class: { type: "token", vocab: ERROR_CLASSES, optional: true },
			handled: { type: "bool", optional: true },
			fingerprint: { type: "token", optional: true },
			component: { type: "token", vocab: ["host", "webview", "collector"], optional: true },
			message: { type: "string", optional: true, max: 512 },
			frames: { type: "string", optional: true, max: 1024 },
			count: { type: "int", optional: true, max: 2 ** 31 },
		},
		purposes: "error-family",
		phased: false,
	},
	"protocol.error": {
		kind: "diagnostic",
		fields: {
			transport: { type: "token", vocab: ["sse", "http"] },
			stage: { type: "token", vocab: ["decode", "apply"] },
			error_code: { type: "token" },
		},
		purposes: DUAL,
		phased: false,
	},
	"telemetry.health": {
		kind: "health",
		fields: {
			drop: { type: "int", optional: true, max: 2 ** 31 },
			write_error: { type: "int", optional: true, max: 2 ** 31 },
			depth_bytes: { type: "int", optional: true, max: 2 ** 31 },
			oldest_age_ms: { type: "int", optional: true, max: 2 ** 31 },
			webview_buffer_full: { type: "int", optional: true, max: 2 ** 31 },
			// Drop reason breakdown (v1-minor additive; key names aligned with
			// the JetBrains 2026-09-23 health change, which the cs-cloud v2
			// branch already parses). Deltas over the same window as `drop`.
			drop_invalid: { type: "int", optional: true, max: 2 ** 31 },
			drop_contention: { type: "int", optional: true, max: 2 ** 31 },
			drop_capacity: { type: "int", optional: true, max: 2 ** 31 },
			drop_policy: { type: "int", optional: true, max: 2 ** 31 },
			drop_oversize: { type: "int", optional: true, max: 2 ** 31 },
			drop_evicted: { type: "int", optional: true, max: 2 ** 31 },
			drop_failure: { type: "int", optional: true, max: 2 ** 31 },
			// "degraded" once any failure-class record was ever lost (failure
			// tiers are a v2 concept; stays "good" in v1). Consumers must not
			// trust precise success rates of a degraded run.
			quality: { type: "token", vocab: ["good", "degraded"], optional: true },
		},
		purposes: DUAL,
		phased: false,
	},
	"session.dispose_risk": {
		kind: "transition",
		fields: {
			dispose_source: {
				type: "token",
				vocab: ["session_deleted", "session_disposed", "server_instance_disposed"],
			},
			conversation_active: { type: "bool" },
		},
		purposes: METRICS,
		phased: false,
	},
	rpc: op(
		{
			api_group: {
				type: "token",
				vocab: ["session", "permission", "question", "event", "agent", "provider", "file", "other"],
			},
		},
		METRICS,
	),
	"webview.delay": {
		kind: "sample",
		fields: {
			observation_id: { type: "token" },
			probe_seq: { type: "int", max: 2 ** 31 },
			scheduled_mono_ms: { type: "int", max: 2 ** 31 },
			completed_mono_ms: { type: "int", max: 2 ** 31 },
			duration_ms: { type: "int", max: 2 ** 31 },
			validity: { type: "token", vocab: ["valid", "suspended", "scheduler_gap", "unknown"] },
		},
		purposes: METRICS,
		phased: false,
	},
	"webview.stall": {
		kind: "sample",
		fields: {
			observation_id: { type: "token" },
			duration_ms: { type: "int", max: 2 ** 31 },
		},
		purposes: METRICS,
		phased: false,
	},
	"render.apply": {
		kind: "sample",
		fields: {
			duration_ms: { type: "int", max: 2 ** 31 },
			result: { type: "token", vocab: ["success", "failure"] },
			component: { type: "token" },
			batch_size_bucket: { type: "token", vocab: ["1", "2-5", "6-20", "21-100", "100+"] },
			sample_rate: { type: "number", optional: true, max: 1 },
		},
		purposes: METRICS,
		phased: false,
	},
	"ide.operation": op({
		operation: {
			type: "token",
			vocab: ["open_file", "open_diff", "execute_command", "switch_git_branch", "switch_workspace"],
		},
	}),
	"resource.snapshot": {
		kind: "sample",
		fields: {
			resource: { type: "token", vocab: ["webview", "subscription", "child_process"] },
			count: { type: "int", max: 2 ** 31 },
		},
		purposes: METRICS,
		phased: false,
	},
}

export const names = (): string[] => Object.keys(DICTIONARY).sort()

export const isRegistered = (name: string): boolean => name in DICTIONARY

/** purposes projection: fixed per name; error family branches on data form. */
export const purposes = (name: string, data: Record<string, unknown>): readonly Purpose[] => {
	const rule = DICTIONARY[name]
	if (!rule) return []
	if (rule.purposes !== "error-family") return rule.purposes
	// Count form (metrics) vs detail form (logs) — same fault_id, different event.
	return "message" in data || "frames" in data ? ["logs"] : ["metrics"]
}

const TOKEN_RE = /^[a-z0-9][a-z0-9_.-]{0,63}$/

const checkValue = (key: string, value: unknown, rule: FieldRule, at: string[]): string[] => {
	if (value === undefined) return rule.optional ? [] : [`${at}: ${key} required`]
	switch (rule.type) {
		case "string": {
			if (typeof value !== "string") return [`${at}: ${key} must be string`]
			// eslint-disable-next-line no-control-regex -- rejecting control characters is the point
			if (/[\u0000-\u0008\u000a-\u001f\u007f]/.test(value)) return [`${at}: ${key} control chars`]
			if (Buffer.byteLength(value, "utf8") > (rule.max ?? 512)) return [`${at}: ${key} exceeds bytes`]
			return []
		}
		case "token": {
			if (typeof value !== "string") return [`${at}: ${key} must be string`]
			if (rule.vocab && !rule.vocab.includes(value)) return [`${at}: ${key} not in vocab`]
			if (!rule.vocab && !TOKEN_RE.test(value)) return [`${at}: ${key} not a token`]
			return []
		}
		case "int":
			return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= (rule.max ?? 2 ** 31)
				? []
				: [`${at}: ${key} must be int`]
		case "number":
			return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= (rule.max ?? 1)
				? []
				: [`${at}: ${key} must be number`]
		case "bool":
			return typeof value === "boolean" ? [] : [`${at}: ${key} must be bool`]
	}
}

/** Validate a draft; returns violations (empty = valid). */
export const validate = (draft: Draft): string[] => {
	const at = draft.name
	const rule = DICTIONARY[draft.name]
	if (!rule) return [`${at}: not registered`]
	if (draft.kind !== rule.kind) return [`${at}: kind mismatch`]
	const violations: string[] = []
	for (const [key, value] of Object.entries(draft.data ?? {})) {
		const field = rule.fields[key]
		if (!field) {
			violations.push(`${at}: unknown key ${key}`)
			continue
		}
		violations.push(...checkValue(key, value, field, [at]))
	}
	for (const key of Object.keys(rule.fields)) {
		if (!(key in (draft.data ?? {}))) {
			const v = checkValue(key, undefined, rule.fields[key], [at])
			violations.push(...v)
		}
	}
	if (rule.purposes === "error-family") {
		const detail = "message" in draft.data || "frames" in draft.data
		const count = "fault_id" in draft.data || "error_class" in draft.data
		if (detail && count) violations.push(`${at}: count form and detail form must not mix`)
		if (!detail && !count)
			violations.push(`${at}: requires count form (fault_id+error_class) or detail form (message+count)`)
		if (detail && (typeof draft.data.message !== "string" || typeof draft.data.count !== "number")) {
			violations.push(`${at}: detail form requires message+count`)
		}
		if (!detail && (typeof draft.data.fault_id !== "string" || typeof draft.data.error_class !== "string")) {
			violations.push(`${at}: count form requires fault_id+error_class`)
		}
	}
	if (rule.phased) {
		const phase = draft.data.phase
		if (phase === "start" && !(typeof draft.data.deadline_ms === "number" && draft.data.deadline_ms > 0)) {
			violations.push(`${at}: start requires deadline_ms>0`)
		}
		if (phase === "end") {
			if (typeof draft.data.result !== "string") violations.push(`${at}: end requires result`)
			if (typeof draft.data.duration_ms !== "number") violations.push(`${at}: end requires duration_ms`)
		}
	}
	return violations
}
