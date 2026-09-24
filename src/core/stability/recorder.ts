/**
 * Recorder — the admission gate (design §6/§7). record() is synchronous,
 * allocation-only, never does IO; it returns queued/dropped/disabled and
 * never blocks the extension host event loop. Order: standby forwarding →
 * stopped → policy intersection (fail-open) → dictionary validation →
 * purposes intersection (empty = DISABLED, not dropped) → storage-full gate →
 * queue offer with seq allocation and Fact construction. seq is strictly
 * monotonic per producer+run+channel from 1; dropped events keep their holes
 * (holes are the loss signal).
 */
import { validate, purposes as projection } from "./dictionary"
import { estimateBytes, type Draft, type Fact, type Purpose } from "./fact"
import { validateGroup } from "./dictionary"
import type { PolicyStore } from "./policy"
import { type StabilityQueue, tierOf } from "./queue"
import type { Clock } from "./clock"
import { uuid } from "./ids"

export type RecordStatus = "queued" | "dropped" | "disabled"

/** All common environment fields stamped onto every fact. */
export interface Identity {
	producer_id: string
	run_id: string
	device_id: string
	plugin_version: string
	ide_build: string
	ide_build_major: string
	os_family: string
	arch: string
	env: "prod" | "dev" | "test"
}

export interface RecorderCounters {
	accepted: number
	droppedInvalid: number
	droppedCapacity: number
	droppedFailure: number
	droppedQuota: number
	disabledPolicy: number
	disabledShutdown: number
	disabledEmptyPurposes: number
	disabledStandby: number
}

export interface RecorderDeps {
	identity: Identity
	policy: PolicyStore
	queue: StabilityQueue
	clock: Clock
	/** Standby recorders fail closed (disabled) until a target run exists. */
	forwardOnly?: boolean
}

export class Recorder {
	private readonly deps: RecorderDeps
	private readonly seq: Record<string, number> = { critical: 0, diagnostic: 0 }
	private standbyTarget: Recorder | undefined
	private stopped = false
	private storageFull = false
	readonly counters: RecorderCounters = {
		accepted: 0,
		droppedInvalid: 0,
		droppedCapacity: 0,
		droppedFailure: 0,
		droppedQuota: 0,
		disabledPolicy: 0,
		disabledShutdown: 0,
		disabledEmptyPurposes: 0,
		disabledStandby: 0,
	}

	constructor(deps: RecorderDeps) {
		this.deps = deps
	}

	/** Standby recorders forward to the active run's recorder once it exists. */
	setStandbyTarget(target: Recorder | undefined): void {
		this.standbyTarget = target
	}

	setStorageFull(full: boolean): void {
		this.storageFull = full
	}

	close(): void {
		this.stopped = true
	}

	record(draft: Draft): RecordStatus {
		if (this.stopped) {
			this.counters.disabledShutdown++
			return "disabled"
		}
		if (!this.standbyTarget) {
			if (this.deps.forwardOnly) {
				this.counters.disabledStandby++
				return "disabled"
			}
		} else {
			return this.standbyTarget.record(draft)
		}
		const dictionaryPurposes = projection(draft.name, draft.data)
		if (dictionaryPurposes.length === 0) {
			this.counters.droppedInvalid++
			return "dropped"
		}
		if (validate(draft).length > 0) {
			this.counters.droppedInvalid++
			return "dropped"
		}
		const requested = draft.purposes ?? dictionaryPurposes
		const snapshot = this.deps.policy.current()
		const major = Number((draft.schemaVersion ?? "1.0").split(".")[0])
		if (!snapshot.acceptedMajors.includes(major)) {
			// v2 facts need a consumer (or the fail-open default) that accepts
			// their schema major; otherwise the family stays dormant.
			this.counters.disabledPolicy++
			return "disabled"
		}
		const permitted = snapshot.permit(
			draft.channel,
			requested.filter((p) => dictionaryPurposes.includes(p)),
		)
		if (permitted.length === 0) {
			this.counters.disabledPolicy++
			return "disabled"
		}
		if (this.storageFull) {
			this.counters.droppedQuota++
			return "dropped"
		}
		const seq = ++this.seq[draft.channel]
		const fact = this.buildFact(draft, permitted, seq, snapshot)
		const bytes = estimateBytes(draft)
		if (!this.deps.queue.offer({ fact, bytes, channel: draft.channel, at: this.deps.clock.wall() })) {
			// A failure-tier rejection is its own loss class: quality degrades
			// (precise success rates must not be trusted for the run).
			if (tierOf(fact) === "failure") this.counters.droppedFailure++
			else this.counters.droppedCapacity++
			return "dropped"
		}
		this.counters.accepted++
		return "queued"
	}

	private buildFact(
		draft: Draft,
		permitted: readonly Purpose[],
		seq: number,
		snapshot: ReturnType<PolicyStore["current"]>,
	): Fact {
		return {
			schema_version: draft.schemaVersion ?? "1.0",
			event_id: uuid(),
			timestamp: draft.t_wall ?? this.deps.clock.wall(),
			producer_id: this.deps.identity.producer_id,
			run_id: this.deps.identity.run_id,
			channel: draft.channel,
			seq,
			account_epoch: draft.epoch ?? snapshot.epoch,
			policy_revision: snapshot.revision,
			purposes: [...permitted],
			source: "vscode-plugin",
			device_id: this.deps.identity.device_id,
			plugin_version: this.deps.identity.plugin_version,
			ide_product: "vscode",
			ide_build: this.deps.identity.ide_build,
			ide_build_major: this.deps.identity.ide_build_major,
			os_family: this.deps.identity.os_family,
			arch: this.deps.identity.arch,
			env: this.deps.identity.env,
			mode: "monolith",
			side: draft.side ?? "extension_host",
			connection_provider: "cs-cloud",
			kind: draft.kind,
			name: draft.name,
			...(draft.context && Object.keys(draft.context).length > 0 ? { context: draft.context } : {}),
			data: draft.data,
		}
	}

	/**
	 * Atomic publication for a diagnostic unit (parent + payload shards):
	 * the group validates together (chunk uniqueness) and enters the queue as
	 * ONE admission unit — admitted or dropped whole, seq assigned in order.
	 */
	recordGroup(drafts: Draft[]): RecordStatus {
		if (this.stopped) {
			this.counters.disabledShutdown += drafts.length
			return "disabled"
		}
		if (this.standbyTarget) return this.standbyTarget.recordGroup(drafts)
		if (!this.standbyTarget && this.deps.forwardOnly) {
			this.counters.disabledStandby += drafts.length
			return "disabled"
		}
		if (validateGroup(drafts).length > 0) {
			this.counters.droppedInvalid += drafts.length
			return "dropped"
		}
		const snapshot = this.deps.policy.current()
		const items: { fact: Fact; bytes: number; channel: Draft["channel"]; at: number }[] = []
		for (const draft of drafts) {
			const dictionaryPurposes = projection(draft.name, draft.data)
			const requested = draft.purposes ?? dictionaryPurposes
			const permitted = snapshot.permit(
				draft.channel,
				requested.filter((p) => dictionaryPurposes.includes(p)),
			)
			if (permitted.length === 0) {
				this.counters.disabledPolicy += drafts.length
				return "disabled"
			}
			const seq = ++this.seq[draft.channel]
			items.push({
				fact: this.buildFact(draft, permitted, seq, snapshot),
				bytes: estimateBytes(draft),
				channel: draft.channel,
				at: this.deps.clock.wall(),
			})
		}
		if (!this.deps.queue.offerGroup(items)) {
			const failure = items.some((item) => tierOf(item.fact) === "failure")
			if (failure) this.counters.droppedFailure += items.length
			else this.counters.droppedCapacity += items.length
			return "dropped"
		}
		this.counters.accepted += items.length
		return "queued"
	}

	/** Per-fingerprint detail budget per minute from the current policy snapshot. */
	policyDetailLimit(): number {
		return this.deps.policy.current().detailLimit
	}

	/** Purposes the current policy would permit for a channel (coverage introspection). */
	permitted(channel: Fact["channel"], requested: Purpose[]): readonly Purpose[] {
		return this.deps.policy.current().permit(channel, requested)
	}

	/** Current policy epoch — operation begin snapshots it so end never rebinds. */
	epoch(): string {
		return this.deps.policy.current().epoch
	}
}
