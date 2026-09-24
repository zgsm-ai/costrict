/**
 * v2 high-fidelity diagnostics entry point (port of the JetBrains
 * Diagnostics, JS adaptation). report() is the single collection boundary:
 * it always emits the v1 count form (error.reported/uncaught, metrics) and,
 * within the per-fingerprint detail budget, publishes an atomic v2 incident
 * (diagnostic.reported parent + diagnostic.payload shards carrying message,
 * stack, exception message, attributes and caller-supplied payloads) through
 * recorder.recordGroup. Redaction is fail-closed: any failure inside the
 * filter/format pipeline downgrades to a diagnostic.redaction_failed parent
 * without original text. Caller-supplied secrets are masked before the
 * generic credential filter runs. The same Error object re-reported keeps
 * its incident id (identity map); structural repeats share the fingerprint
 * rate window, overflow is summarized on the next window.
 */
import { createHash } from "crypto"
import { DiagnosticPayload, MAX_PAYLOAD_BYTES } from "./diagnostic-payload"
import { DiagnosticRedactor, type Redacted } from "./diagnostic-redactor"
import { categoryOf, codeOf } from "./error-classifier"
import type { Draft, FactContext } from "./fact"
import type { Recorder } from "./recorder"
import type { Clock } from "./clock"
import { uuid } from "./ids"
import { currentDiagnosticContext } from "./diagnostic-context"

const WINDOW_MS = 60_000
const MAX_KEYS = 1024
const MAX_FRAMES = 5
const SCALAR_BYTES = 64
const SCALAR = /^[A-Za-z0-9_.#$<> -]+$/
const IDENTIFIER = /^[A-Za-z0-9_.-]{1,128}$/
const PAYLOAD_KIND = /^[a-z][a-z0-9_]{0,63}$/

export interface DiagnosticInput {
	severity: "warn" | "error"
	component: string
	message: string
	error?: unknown
	/** Closed context keys (operation_id/attempt_id/fault_id/trace_id/workspace_id). */
	context?: FactContext
	/** Structured scalars for the parent record (method/route/http_status/...). */
	attributes?: Record<string, string>
	/** Lazy payload suppliers; kind must match [a-z][a-z0-9_]{0,63}. */
	payloads?: Record<string, () => string>
	handled?: boolean
	/** Literal secrets masked verbatim before the generic filter. */
	secrets?: string[]
	threadName?: string
}

interface Rate {
	fingerprint: string
	category: string
	name: string
	window: number
	details: number
	extra: number
}

export interface DiagnosticsDeps {
	recorder: Recorder
	clock: Clock
	redactor?: (text: string) => Redacted
}

const hash = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex")

const scalar = (text: string): string =>
	Buffer.byteLength(text, "utf8") <= SCALAR_BYTES && SCALAR.test(text) ? text : "unknown"

/** Bounded, identifier-safe frame names from a JS stack (plugin-code frames first). */
const frames = (error: unknown): string[] => {
	if (!(error instanceof Error) || typeof error.stack !== "string") return []
	const names: string[] = []
	for (const line of error.stack.split("\n")) {
		const match = /^\s*at\s+([^\s(]+)/.exec(line)
		if (match === null) continue
		const name = scalar(match[1].replace(/[*#\s]/g, ""))
		if (name === "unknown") continue
		names.push(name)
		if (names.length >= MAX_FRAMES) break
	}
	return names
}

export class Diagnostics {
	private readonly deps: Required<Pick<DiagnosticsDeps, "redactor">> & DiagnosticsDeps
	/** Identity map: the same Error object keeps its incident id. */
	private readonly identities = new WeakMap<object, string>()
	private readonly windows = new Map<string, Rate>()
	private readonly overflow: Rate = {
		fingerprint: "overflow",
		category: "other",
		name: "error.reported",
		window: -1,
		details: 0,
		extra: 0,
	}

	constructor(deps: DiagnosticsDeps) {
		this.deps = { redactor: DiagnosticRedactor.clean, ...deps }
	}

	report(input: DiagnosticInput): string {
		const id = uuid()
		try {
			return this.collect(this.withAmbient(input), id)
		} catch {
			// Fail-closed: anything the filter/format pipeline threw becomes a
			// redaction failure record without original text.
			this.deps.recorder.record({
				name: "diagnostic.redaction_failed",
				kind: "diagnostic",
				channel: "diagnostic",
				context: { incident_id: id },
				purposes: ["logs"],
				schemaVersion: "2.0",
				data: {
					severity: "error",
					component: "diagnostics",
					code: "redaction_failed",
					message: "Diagnostic redaction failed",
					thread_name: "unknown",
					thread_id: 0,
					payload_refs: [],
					truncated: true,
				},
			})
			return id
		}
	}

	private collect(input: DiagnosticInput, id: string): string {
		const time = Math.floor(this.deps.clock.wall() / WINDOW_MS)
		const error = input.error
		const fingerprint = hash(`${codeOf(error)}\n${frames(error).join("\n")}`)
		const category = categoryOf(error)
		const name = input.handled === false ? "error.uncaught" : "error.reported"
		const rate: Rate = { fingerprint, category, name, window: -1, details: 0, extra: 0 }
		const quota = this.deps.recorder.policyDetailLimit()
		const duplicate = error !== null && typeof error === "object" ? this.identityOf(error, id) : undefined
		const summaries = this.flush(time)
		for (const [state, count] of summaries) {
			this.deps.recorder.record(this.summary(state, count))
		}
		if (duplicate !== undefined) return duplicate
		const detail = this.reserve(rate, time, quota)
		// v1 count form always lands (metrics admission decides its fate).
		if (error !== undefined) {
			this.deps.recorder.record({
				name,
				kind: "diagnostic",
				channel: "critical",
				context: { fault_id: fingerprint.slice(0, 16) },
				purposes: ["metrics"],
				data: {
					fault_id: fingerprint.slice(0, 16),
					error_class: category,
					handled: input.handled !== false,
					fingerprint: fingerprint.slice(0, 16),
					component: this.v1Component(input.component),
				},
			})
		}
		if (!detail) return id
		this.deps.recorder.recordGroup(this.incident(input, id, fingerprint, category))
		return id
	}

	/** The v1 error-family component vocab is closed; free-form names clamp to the nearest token (the v2 parent keeps the original). */
	private v1Component(component: string): string {
		const token = scalar(component)
		if (token === "host" || token === "webview" || token === "collector") return token
		// webview-originated components ("webview.protocol", ...) count as webview
		return component.startsWith("webview") ? "webview" : "host"
	}

	/** Ambient context fills gaps; explicit arguments always win. */
	private withAmbient(input: DiagnosticInput): DiagnosticInput {
		const ambient = currentDiagnosticContext()
		return {
			...input,
			context: { ...(ambient.context ?? {}), ...(input.context ?? {}) },
			attributes: { ...(ambient.attributes ?? {}), ...(input.attributes ?? {}) },
			payloads: { ...(ambient.payloads ?? {}), ...(input.payloads ?? {}) },
		}
	}

	/** Same-object identity: the incident id is remembered, never rewritten. */
	private identityOf(error: object, id: string): string | undefined {
		const seen = this.identities.get(error)
		if (seen !== undefined) return seen
		this.identities.set(error, id)
		return undefined
	}

	private reserve(rate: Rate, time: number, quota: number): boolean {
		if (quota === 0) return false
		const state =
			this.windows.get(rate.fingerprint) ??
			(this.windows.size < MAX_KEYS
				? ({ ...rate, window: -1, details: 0, extra: 0 } satisfies Rate)
				: this.overflow)
		this.windows.set(rate.fingerprint, state)
		state.name = rate.name
		if (state.window < time) {
			state.window = time
			state.details = 0
		}
		if (state === this.overflow || state.details >= quota) {
			state.extra++
			return false
		}
		state.details++
		return true
	}

	/** Summaries for windows that have closed with suppressed overflow. */
	private flush(time: number): [Rate, number][] {
		const out: [Rate, number][] = []
		for (const state of [this.overflow, ...this.windows.values()]) {
			if (state.extra === 0 || state.window >= time) continue
			out.push([state, state.extra])
			state.extra = 0
		}
		return out
	}

	private summary(state: Rate, count: number): Draft {
		return {
			name: state.name,
			kind: "diagnostic",
			channel: "critical",
			context: { fault_id: state.fingerprint.slice(0, 16) },
			// detail form projects to logs-only (dictionary error-family rule)
			purposes: ["logs"],
			data: {
				message: `fault summary: error_class=${state.category} suppressed=${count}`,
				frames: "", // v1 detail form carries frames as one string; summaries have none
				fingerprint: state.fingerprint.slice(0, 16),
				count,
			},
		}
	}

	/** Parent + shards, atomically published; per-kind budgets never starve a kind to zero bytes. */
	private incident(input: DiagnosticInput, id: string, fingerprint: string, category: string): Draft[] {
		const secrets = (input.secrets ?? []).filter((secret) => secret.length > 0).sort((a, b) => b.length - a.length)
		const clean = (text: string): Redacted => {
			const masked = secrets.reduce((value, secret) => value.split(secret).join("<redacted:known-secret>"), text)
			const result = this.deps.redactor(masked)
			return { text: result.text, changed: result.changed || masked !== text }
		}
		const context: FactContext = { ...(input.context ?? {}), incident_id: id }
		const attributes = Object.fromEntries(
			Object.entries(input.attributes ?? {}).map(([key, value]) => [
				clean(key).text,
				DiagnosticRedactor.field(key, value).text,
			]),
		)
		const content = new Map<string, string>()
		content.set("message", clean(input.message).text)
		if (input.error instanceof Error) {
			content.set("stack", clean(input.error.stack ?? "").text)
			if (input.error.message && input.error.message !== input.message) {
				content.set("exception_message", clean(input.error.message).text)
			}
		}
		for (const [kind, supplier] of Object.entries(input.payloads ?? {})) {
			if (!PAYLOAD_KIND.test(kind) || content.has(kind) || kind === "attributes") {
				throw new Error(`invalid diagnostic payload kind: ${kind}`)
			}
			content.set(kind, clean(supplier()).text)
		}
		if (Object.keys(attributes).length > 0) {
			content.set("attributes", JSON.stringify(attributes))
		}
		const bytes = new Map<string, Uint8Array>()
		for (const [kind, text] of content) {
			const encoded = new TextEncoder().encode(text)
			if (encoded.length > 0) bytes.set(kind, encoded)
		}
		const total = [...bytes.values()].reduce((sum, view) => sum + view.length, 0)
		let remaining = MAX_PAYLOAD_BYTES
		let pending = total
		const parts: Draft[][] = []
		const entries = [...bytes.entries()]
		entries.forEach(([kind, view], index) => {
			const budget =
				pending <= remaining
					? view.length
					: Math.max(
							1,
							Math.min(
								Math.floor((remaining * view.length) / pending),
								remaining - (entries.length - index - 1),
							),
						)
			remaining -= budget
			pending -= view.length
			parts.push(DiagnosticPayload.parts(id, kind, view, budget).drafts.map((draft) => ({ ...draft, context })))
		})
		const parent: Draft = {
			name: "diagnostic.reported",
			kind: "diagnostic",
			channel: "diagnostic",
			context,
			purposes: ["logs"],
			schemaVersion: "2.0",
			data: {
				severity: input.severity,
				component: scalar(clean(input.component).text),
				code: scalar(attributes.code ?? codeOf(input.error)),
				message: "Diagnostic detail in payloads",
				thread_name: scalar(clean(input.threadName ?? "extension_host").text),
				thread_id: process.pid,
				...(input.error instanceof Error ? { exception_type: scalar(clean(input.error.name).text) } : {}),
				...(input.error instanceof Error ? { suppressed_count: 0 } : {}),
				...this.metadata(attributes),
				payload_bytes: total,
				payload_refs: [...bytes.keys()],
				truncated: parts.some((group) => group.some((draft) => draft.data.truncated === true)),
			},
		}
		// Fault linkage lives in the closed context key set, never in data.
		parent.context = { ...parent.context, fault_id: fingerprint.slice(0, 16) }
		return [parent, ...parts.flat()]
	}

	private metadata(attributes: Record<string, string>): Record<string, unknown> {
		const out: Record<string, unknown> = {}
		for (const key of ["method", "route", "content_type", "json_path", "expected_type", "actual_type"]) {
			const value = attributes[key]
			if (value === undefined || value.length === 0 || Buffer.byteLength(value, "utf8") > SCALAR_BYTES) continue
			out[key] = key === "method" || key === "expected_type" || key === "actual_type" ? scalar(value) : value
		}
		const status = Number(attributes.http_status)
		if (Number.isInteger(status) && status >= 0) out.http_status = status
		return out
	}
}
