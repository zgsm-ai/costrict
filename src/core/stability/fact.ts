/**
 * Fact record v1 (design §3) — the on-disk wire format. Field set is frozen
 * (snake_case) and mirrors the JetBrains contract; `source` distinguishes the
 * VS Code plugin. Facts carry no paths, credentials, raw exception messages,
 * or arbitrary payloads — `data` is validated against the dictionary
 * whitelist before admission, never sanitized-and-passed.
 */
export type Purpose = "metrics" | "logs"
export type Channel = "critical" | "diagnostic"
export type FactKind = "operation" | "transition" | "lifecycle" | "interval" | "diagnostic" | "health" | "sample"
export type Side = "extension_host" | "webview"

/** Context is a closed key set; absent identity is omitted, never fabricated. */
export type FactContext = Partial<{
	operation_id: string
	attempt_id: string
	fault_id: string
	trace_id: string
	workspace_id: string
	incident_id: string
}>

export interface Fact {
	schema_version: "1.0" | "2.0"
	event_id: string
	timestamp: number
	producer_id: string
	run_id: string
	channel: Channel
	seq: number
	account_epoch: string
	policy_revision: number
	purposes: Purpose[]
	source: "vscode-plugin"
	device_id: string
	plugin_version: string
	ide_product: string
	ide_build: string
	ide_build_major: string
	os_family: string
	arch: string
	env: "prod" | "dev" | "test"
	mode: "monolith"
	side: Side
	connection_provider: "cs-cloud"
	kind: FactKind
	name: string
	context?: FactContext
	data: Record<string, unknown>
}

/**
 * Business input to the collector. Collections are snapshot-copied at
 * construction; epoch/purposes are optional overrides (defaults come from the
 * admission gate); t_wall/t_mono carry webview capture time (host stamps
 * t_wall as the fact timestamp — occurrence time, not receive time).
 */
export interface Draft {
	name: string
	kind: FactKind
	channel: Channel
	data: Record<string, unknown>
	context?: FactContext
	epoch?: string
	purposes?: Purpose[]
	side?: Side
	/** Fact schema major carrier: v2 high-fidelity diagnostics opt in with "2.0". */
	schemaVersion?: "1.0" | "2.0"
	t_wall?: number
	t_mono?: number
}

export const MAX_RECORD_BYTES = 32 * 1024

const utf8Bytes = (value: string): number => Buffer.byteLength(value, "utf8")

/** Conservative admission estimate (×2 escape factor + envelope) before queueing. */
export const estimateBytes = (draft: Draft): number =>
	2048 + 2 * (utf8Bytes(draft.name) + utf8Bytes(JSON.stringify(draft.data ?? {})))

const CONTEXT_KEYS: readonly string[] = [
	"operation_id",
	"attempt_id",
	"fault_id",
	"trace_id",
	"workspace_id",
	"incident_id",
]

export const validContext = (context: FactContext | undefined): boolean => {
	if (!context) return true
	const keys = Object.keys(context)
	if (keys.some((k) => !CONTEXT_KEYS.includes(k))) return false
	return keys.every((k) => {
		const v = (context as Record<string, unknown>)[k]
		// eslint-disable-next-line no-control-regex -- rejecting control characters is the point
		return typeof v === "string" && v.length > 0 && v.length <= 64 && !/[\u0000-\u001f\u007f/\\]/.test(v)
	})
}

/** Encode one NDJSON line (without LF); throws on oversize. */
export const encodeLine = (fact: Fact): string => {
	const line = JSON.stringify(fact)
	if (utf8Bytes(line) > MAX_RECORD_BYTES) {
		throw new Error(`record exceeds ${MAX_RECORD_BYTES} bytes`)
	}
	return line
}
