/**
 * Policy store (design §6) — polls ~/.costrict/telemetry/control/vscode.json
 * every 30s and exposes the current permission snapshot. FAIL-OPEN: a
 * missing/empty/malformed/unknown-major control file means NO restriction
 * (purposes unrestricted, revision 0, epoch "unbound"); restriction only ever
 * comes from a currently-valid explicit policy. Epoch changes permanently
 * retire the old epoch (facts of retired epochs are dropped at the write
 * gate, never rebound). A monotonic clock floor prevents expired permits from
 * reviving after a wall-clock rollback.
 */
import { promises as fs } from "fs"
import type { Channel, Purpose } from "./fact"
import type { Clock } from "./clock"

export interface ControlFile {
	schema_major: number
	revision: number
	enabled: boolean
	metrics_enabled?: boolean
	metrics_expires_at?: number
	logs_enabled?: boolean
	logs_expires_at?: number
	account_epoch: string
	account_state: "pending" | "ready" | "disabled"
	expires_at: number
	metrics_allowed_categories?: Channel[]
	logs_allowed_categories?: Channel[]
	log_detail_rate_limit?: { per_fingerprint_max_per_minute: number }
	/** Consumer-declared reconstructable fact schema majors. Absent = [1]. */
	accepted_fact_schema_majors?: number[]
}

const CLOSED_KEYS = new Set([
	"schema_major",
	"revision",
	"enabled",
	"metrics_enabled",
	"metrics_expires_at",
	"logs_enabled",
	"logs_expires_at",
	"account_epoch",
	"account_state",
	"expires_at",
	"metrics_allowed_categories",
	"logs_allowed_categories",
	"log_detail_rate_limit",
	"accepted_fact_schema_majors",
])

export const UNBOUND_EPOCH = "unbound"

const isChannelArray = (v: unknown): boolean =>
	Array.isArray(v) && v.every((c) => c === "critical" || c === "diagnostic")

/** Strict validation: closed field set, no unknown keys, no trimming. */
export const parseControl = (raw: string): ControlFile | undefined => {
	let parsed: unknown
	try {
		parsed = JSON.parse(raw)
	} catch {
		return undefined
	}
	if (typeof parsed !== "object" || parsed === null) return undefined
	const file = parsed as Record<string, unknown>
	if (file.schema_major !== 1) return undefined
	for (const key of Object.keys(file)) if (!CLOSED_KEYS.has(key)) return undefined
	if (typeof file.revision !== "number" || !Number.isInteger(file.revision) || file.revision < 0) return undefined
	if (typeof file.enabled !== "boolean") return undefined
	if (typeof file.account_epoch !== "string" || file.account_epoch.length < 1 || file.account_epoch.length > 64)
		return undefined
	if (file.account_state !== "pending" && file.account_state !== "ready" && file.account_state !== "disabled")
		return undefined
	if (typeof file.expires_at !== "number") return undefined
	for (const purpose of ["metrics", "logs"] as const) {
		const enabled = file[`${purpose}_enabled`]
		if (enabled !== undefined && typeof enabled !== "boolean") return undefined
		const expires = file[`${purpose}_expires_at`]
		if (expires !== undefined && (typeof expires !== "number" || expires < 0)) return undefined
		const categories = file[`${purpose}_allowed_categories`]
		if (categories !== undefined && !isChannelArray(categories)) return undefined
	}
	const majors = file.accepted_fact_schema_majors
	if (majors !== undefined) {
		if (
			!Array.isArray(majors) ||
			majors.length === 0 ||
			!majors.every((m) => Number.isInteger(m) && m >= 1) ||
			new Set(majors).size !== majors.length
		)
			return undefined
	}
	return file as unknown as ControlFile
}

export interface PolicySnapshot {
	revision: number
	epoch: string
	/** undefined = no valid explicit policy (fail-open). */
	explicit: ControlFile | undefined
	/** Fact schema majors the consumer can reconstruct. Fail-open defaults to {1,2} (v2 by default); an explicit file without the field falls back to [1]. */
	acceptedMajors: number[]
	/** Effective purposes permitted for a fact of `channel` requesting `requested`. */
	permit: (channel: Channel, requested: readonly Purpose[]) => readonly Purpose[]
}

const failOpen = (): PolicySnapshot => ({
	revision: 0,
	epoch: UNBOUND_EPOCH,
	explicit: undefined,
	// cs-cloud no longer writes the control file (2026-09-24), so a missing
	// file is the normal state: fail-open accepts fact schema majors {1,2}
	// and v2 high-fidelity diagnostics collect by default. An explicit file
	// with accepted_fact_schema_majors [1] (or a missing field) still
	// suppresses v2 — mirrors the JetBrains unbound-policy flip.
	acceptedMajors: [1, 2],
	permit: (_channel, requested) => requested,
})

const allowed = (file: ControlFile, purpose: Purpose, channel: Channel, now: number): boolean => {
	if (!file.enabled) return false
	if (file.account_state !== "ready") return false
	if (now >= file.expires_at) return false
	if (file[`${purpose}_enabled`] === false) return false
	const own = file[`${purpose}_expires_at`]
	if (own !== undefined && now >= own) return false
	const categories = file[`${purpose}_allowed_categories`]
	if (categories !== undefined && !categories.includes(channel)) return false
	return true
}

export interface PolicyDeps {
	controlPath: string
	clock: Clock
	intervalMs?: number
}

export class PolicyStore {
	private readonly deps: Required<Pick<PolicyDeps, "intervalMs">> & PolicyDeps
	private snapshot: PolicySnapshot = failOpen()
	private activeEpoch: string | undefined
	private readonly retired = new Set<string>()
	private floor = 0
	private timer: ReturnType<typeof setInterval> | undefined
	private chain: Promise<void> = Promise.resolve()

	constructor(deps: PolicyDeps) {
		this.deps = { intervalMs: 30_000, ...deps }
	}

	current(): PolicySnapshot {
		return this.snapshot
	}

	isRetired(epoch: string): boolean {
		return this.retired.has(epoch)
	}

	retiredEpochs(): string[] {
		return [...this.retired]
	}

	start(): void {
		void this.refresh()
		this.timer = setInterval(() => void this.refresh(), this.deps.intervalMs)
		this.timer.unref?.()
	}

	stop(): void {
		if (this.timer) clearInterval(this.timer)
		this.timer = undefined
	}

	/**
	 * Serialized: concurrent callers chain instead of being dropped, so a
	 * manual refresh always observes the latest file state.
	 */
	async refresh(): Promise<void> {
		this.chain = this.chain.then(() => this.readAndApply())
		await this.chain
	}

	private async readAndApply(): Promise<void> {
		this.floor = Math.max(this.floor, this.deps.clock.wall())
		const file = await this.readControl()
		if (!file) {
			this.snapshot = failOpen()
			return
		}
		const seen = this.activeEpoch
		if (seen !== undefined && file.account_epoch !== seen && !this.retired.has(seen)) {
			this.retired.add(seen)
		}
		this.activeEpoch = file.account_epoch
		this.snapshot = {
			revision: file.revision,
			epoch: file.account_epoch,
			explicit: file,
			acceptedMajors: file.accepted_fact_schema_majors ?? [1],
			permit: (channel, requested) => {
				// Advance the floor on every observation so an already-seen-expired
				// permit cannot revive after a wall-clock rollback.
				this.floor = Math.max(this.floor, this.deps.clock.wall())
				return requested.filter((purpose) => allowed(file, purpose, channel, this.floor))
			},
		}
	}

	private async readControl(): Promise<ControlFile | undefined> {
		try {
			const raw = await fs.readFile(this.deps.controlPath, "utf8")
			return parseControl(raw)
		} catch {
			return undefined
		}
	}
}
