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
import type { PolicyStore } from "./policy"
import type { StabilityQueue } from "./queue"
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
	os_family: string
	arch: string
	env: "prod" | "dev" | "test"
}

export interface RecorderCounters {
	accepted: number
	droppedInvalid: number
	droppedCapacity: number
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
		const permitted = this.deps.policy.current().permit(
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
		const snapshot = this.deps.policy.current()
		const fact: Fact = {
			schema_version: "1.0",
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
		const bytes = estimateBytes(draft)
		if (!this.deps.queue.offer({ fact, bytes, channel: draft.channel, at: this.deps.clock.wall() })) {
			this.counters.droppedCapacity++
			return "dropped"
		}
		this.counters.accepted++
		return "queued"
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
