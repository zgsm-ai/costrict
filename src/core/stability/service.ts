/**
 * StabilityService — the composition root (design §7/§8). Owns identity,
 * policy polling, the admission gate, the append writer, retention, health
 * and resource gauges. start()/stop() are CAS-once; a 30s activation loop
 * activates a run while policy permits (fail-open counts as permitted —
 * revision 0 / unbound epoch) and deactivates WITHOUT fabricating a shutdown
 * when an explicit policy revokes. Standby recorders forward to the active
 * run so early-captured observations never land in a black hole. The
 * stop-vs-activation race is handled with triple stoppedOnce re-checks
 * (entry, after writer start, post-commit); the shutdown fact is recorded
 * BEFORE closing admission, and stopped status is published only by the stop
 * path.
 */
import path from "path"
import os from "os"
import { systemClock, type Clock } from "./clock"
import { deviceId, randomId, type IdStore } from "./ids"
import { durableScopeId } from "./scope-store"
import { PolicyStore } from "./policy"
import { StabilityQueue } from "./queue"
import { Recorder, type Identity } from "./recorder"
import { Writer } from "./writer"
import { Retention } from "./retention"
import { Health } from "./health"
import { Faults } from "./fault"
import { Diagnostics, type DiagnosticInput } from "./diagnostics"
import { DiagnosticBridge } from "./diagnostic-bridge"
import { Resources } from "./resources"
import { Operation } from "./operation"
import { detectUnclean, envSnapshot, type EnvSnapshot } from "./producer"
import type { Draft, FactContext, Purpose } from "./fact"

export type StopKind = "app_close" | "unload"

export interface CoverageState {
	mode: "enabled" | "standby" | "stopped"
	reason: string
	metrics: boolean
	logs: boolean
}

export interface ServiceDeps {
	home?: string
	store: IdStore
	pluginVersion: string
	ideBuild: string
	dev?: boolean
	test?: boolean
	clock?: Clock
	/** Local-only diagnostics sink (rate limiting is the caller's job). */
	log?: (message: string) => void
}

const ACTIVATION_MS = 30_000
const HEALTH_POLL_MS = 5_000
const RESOURCE_MS = 30_000
const RETENTION_MS = 60 * 60 * 1000

export class StabilityService {
	private readonly deps: ServiceDeps & { home: string; clock: Clock }
	private readonly env: EnvSnapshot
	private readonly resources = new Resources()
	private policy: PolicyStore | undefined
	private queue: StabilityQueue | undefined
	private recorder: Recorder | undefined
	private writer: Writer | undefined
	private health: Health | undefined
	private faultsRef: Faults | undefined
	private diagnosticsRef: Diagnostics | undefined
	private readonly bridge = new DiagnosticBridge()
	private retention: Retention | undefined
	private standby: Recorder | undefined
	private timers: ReturnType<typeof setInterval>[] = []
	private firstActivation: Promise<void> = Promise.resolve()
	private started = false
	private stopped = false
	private activated = false
	private activating = false
	private scope = ""
	private producerId = ""
	private coverage: CoverageState = { mode: "standby", reason: "starting", metrics: false, logs: false }

	constructor(deps: ServiceDeps) {
		this.deps = { home: path.join(os.homedir(), ".costrict", "telemetry"), clock: systemClock(), ...deps }
		this.env = envSnapshot(deps.pluginVersion, deps.ideBuild, deps.dev ?? false, deps.test ?? false)
	}

	/** Idempotent. Creates the standby recorder immediately (fail-closed). */
	start(): StabilityService {
		if (this.started || this.stopped) return this
		this.started = true
		this.producerId = randomId("pr")
		const dirPath = path.join(this.deps.home, "outbox")
		this.policy = new PolicyStore({
			controlPath: path.join(this.deps.home, "control", "vscode.json"),
			clock: this.deps.clock,
		})
		this.queue = new StabilityQueue()
		this.standby = new Recorder({
			identity: this.identity(randomId("run")),
			policy: this.policy,
			queue: this.queue,
			clock: this.deps.clock,
			forwardOnly: true,
		})
		this.health = new Health({
			// Health records through the standby path so it works pre- and post-activation.
			recorder: this.standby,
			queue: this.queue,
			clock: this.deps.clock,
		})
		this.policy.start()
		this.health.start()
		this.schedule(ACTIVATION_MS, () => void this.activationLoop())
		this.schedule(HEALTH_POLL_MS, () => this.health?.poll())
		this.schedule(RESOURCE_MS, () => this.emitResources())
		this.schedule(RETENTION_MS, () => void this.retentionLoop())
		this.firstActivation = this.activationLoop()
		void this.retentionLoop()
		this.coverage = { mode: "standby", reason: "no_policy", metrics: true, logs: true }
		return this
	}

	/** CAS-once stop. Records plugin.shutdown first (when a run is active), then closes admission and the writer (bounded). */
	async stop(kind: StopKind): Promise<void> {
		if (this.stopped || !this.started) return
		this.stopped = true
		for (const timer of this.timers) clearInterval(timer)
		this.timers = []
		if (this.recorder && this.activated) {
			// Real platform lifecycle only — never fabricated on revoke.
			this.recorder.record({
				name: "plugin.shutdown",
				kind: "lifecycle",
				channel: "critical",
				data: { end_kind: kind },
			})
		}
		this.standby?.setStandbyTarget(undefined)
		this.recorder?.close()
		this.standby?.close()
		await this.writer?.close()
		this.policy?.stop()
		this.health?.stop()
		this.coverage = { mode: "stopped", reason: `stopped_${kind}`, metrics: false, logs: false }
	}

	/** Resolves when the first activation attempt completed (tests & probes). */
	ready(): Promise<void> {
		return this.firstActivation
	}

	/** Deterministic write barrier — drains one batch now (tests/acceptance). */
	async drain(): Promise<void> {
		await this.writer?.round()
	}

	getCoverage(): CoverageState {
		return { ...this.coverage }
	}

	record(draft: Draft): "queued" | "dropped" | "disabled" {
		if (!this.standby) return "disabled"
		return this.standby.record(draft)
	}

	begin(
		name: string,
		deadlineMs: number,
		fields?: Record<string, unknown>,
		context?: FactContext,
		purposes?: Purpose[],
	): Operation | undefined {
		if (!this.recorder || !this.activated) return undefined
		return Operation.begin({
			recorder: this.recorder,
			clock: this.deps.clock,
			name,
			deadlineMs,
			fields,
			context,
			purposes,
		})
	}

	get faults(): Faults | undefined {
		return this.faultsRef
	}

	get diagnostics(): Diagnostics | undefined {
		return this.diagnosticsRef
	}

	/**
	 * Mirror a WARN/ERROR record into the diagnostics pipeline (log-mirror
	 * semantics: bounded, async, never blocks or throws at the call site).
	 */
	mirror(input: DiagnosticInput): void {
		this.bridge.offer(input)
	}

	get diagnosticBridge(): DiagnosticBridge {
		return this.bridge
	}

	get healthCounts(): Health | undefined {
		return this.health
	}

	get owned(): Resources {
		return this.resources
	}

	private identity(runId: string): Identity {
		return {
			producer_id: this.producerId,
			run_id: runId,
			device_id: deviceId(this.deps.store),
			plugin_version: this.env.plugin_version,
			ide_build: this.env.ide_build,
			ide_build_major: this.env.ide_build_major,
			os_family: this.env.os_family,
			arch: this.env.arch,
			env: this.env.env,
		}
	}

	private permittedNow(): boolean {
		const snapshot = this.policy?.current()
		if (!snapshot) return false
		// Fail-open snapshot permits both purposes; explicit revoked permits none.
		return snapshot.permit("critical", ["metrics"]).length > 0 || snapshot.permit("critical", ["logs"]).length > 0
	}

	private async activationLoop(): Promise<void> {
		if (this.stopped) return // check 1: entry
		if (this.activating) return
		if (!this.permittedNow()) {
			if (this.activated) this.deactivateRun()
			return
		}
		if (this.activated) return
		this.activating = true
		try {
			await this.activate()
		} finally {
			this.activating = false
		}
	}

	/** Single-file layout: one `<scope-id>.jsonl` per installation, appended across windows/reloads. */
	private fileName(): string {
		return `${this.scope}.jsonl`
	}

	private async activate(): Promise<void> {
		if (!this.scope) {
			// Durable scope resolution (single-file layout: the scope IS the
			// filename). Resolved once per process; globalState migrates as seed.
			this.scope = await durableScopeId(this.deps.home, this.deps.store, (message) => this.deps.log?.(message))
		}
		const runId = randomId("run")
		const recorder = new Recorder({
			identity: this.identity(runId),
			policy: this.policy!,
			queue: this.queue!,
			clock: this.deps.clock,
		})
		// §7.3/M22: unclean detection MUST run BEFORE the writer opens the
		// shared file — the writer pads a torn tail with LF, and padding first
		// could make a crash fragment parse as a shutdown (JetBrains-verified
		// ordering). The liveness window keeps concurrent sibling windows from
		// being misreported as crashes.
		const unclean = await detectUnclean(
			path.join(this.deps.home, "outbox", this.fileName()),
			this.deps.clock.wall(),
		)
		const writer = new Writer({
			queue: this.queue!,
			policy: this.policy!,
			clock: this.deps.clock,
			dirPath: path.join(this.deps.home, "outbox"),
			filePath: path.join(this.deps.home, "outbox", this.fileName()),
			onWriteError: (count) => {
				if (this.health) this.health.writeError += count
			},
			onWriteDrop: (count, reason) => {
				if (!this.health) return
				if (reason === "policy") this.health.writeDropPolicy += count
				else if (reason === "oversize") this.health.writeDropOversize += count
				else this.health.writeDropInvalid += count
			},
			onExternalChange: (message) => {
				this.deps.log?.(`stability: ${message}`)
			},
		})
		this.retention = new Retention({
			dirPath: path.join(this.deps.home, "outbox"),
			scope: this.scope,
			activePath: path.join(this.deps.home, "outbox", this.fileName()),
			clock: this.deps.clock,
			onEvict: (count) => {
				if (this.health) this.health.evicted += count
				this.deps.log?.(`stability retention evicted ${count} lines`)
			},
		})
		await writer.start()
		if (this.stopped) {
			// check 2: after bounded writer start — tear down in place.
			await writer.close()
			return
		}
		this.writer = writer
		this.recorder = recorder
		this.faultsRef = new Faults({ recorder, clock: this.deps.clock })
		this.diagnosticsRef = new Diagnostics({ recorder, clock: this.deps.clock })
		// Log mirror sink: the bridge drains asynchronously into report();
		// reentrancy inside the drain is dropped by the bridge itself.
		this.bridge.install((input) => this.diagnosticsRef?.report(input))
		this.activated = true
		this.standby?.setStandbyTarget(recorder)
		// Legacy per-producer files of this scope are deleted once, without
		// migration (debug-era layout); other scopes are untouched.
		await this.retention.clearLegacy().catch(() => 0)
		recorder.record({ name: "plugin.started", kind: "lifecycle", channel: "critical", data: {} })
		if (this.stopped) return // check 3: post-commit
		if (unclean) {
			recorder.record({
				name: "plugin.unclean",
				kind: "lifecycle",
				channel: "critical",
				data: {
					previous_run_id: unclean.previous_run_id,
					evidence: unclean.evidence,
					...(unclean.last_seq !== undefined ? { last_seq: unclean.last_seq } : {}),
					...(unclean.last_fact_time !== undefined ? { last_fact_time: unclean.last_fact_time } : {}),
					...(unclean.unfinished_operations ? { unfinished_operations: unclean.unfinished_operations } : {}),
				},
			})
		}
		this.coverage = {
			mode: "enabled",
			reason: this.policy?.current().explicit ? "policy" : "no_policy",
			metrics: true,
			logs: true,
		}
	}

	private deactivateRun(): void {
		// Revocation: close admission WITHOUT fabricating plugin.shutdown.
		this.recorder?.close()
		this.standby?.setStandbyTarget(undefined)
		void this.writer?.close()
		this.writer = undefined
		this.recorder = undefined
		this.faultsRef = undefined
		this.diagnosticsRef = undefined
		this.activated = false
		this.coverage = { mode: "standby", reason: "policy_revoked", metrics: false, logs: false }
	}

	private async retentionLoop(): Promise<void> {
		if (this.stopped) return
		try {
			await this.retention?.compact()
		} catch (err) {
			this.deps.log?.(`stability retention failed: ${err instanceof Error ? err.name : "unknown"}`)
		}
	}

	private emitResources(): void {
		for (const draft of this.resources.drafts()) this.record(draft)
	}

	private schedule(intervalMs: number, fn: () => void): void {
		const timer = setInterval(fn, intervalMs)
		timer.unref?.()
		this.timers.push(timer)
	}
}
