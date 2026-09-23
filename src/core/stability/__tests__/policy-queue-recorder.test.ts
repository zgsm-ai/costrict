import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { promises as fs } from "fs"
import os from "os"
import path from "path"
import { fixedClock } from "../clock"
import { parseControl, PolicyStore, UNBOUND_EPOCH } from "../policy"
import { CRITICAL_RESERVED_ITEMS, isCritical, QUEUE_MAX_BYTES, QUEUE_MAX_ITEMS, StabilityQueue } from "../queue"
import { Recorder, type Identity } from "../recorder"
import type { Draft, Fact } from "../fact"
import { randomId } from "../ids"

let dir: string

beforeEach(async () => {
	dir = await fs.mkdtemp(path.join(os.tmpdir(), "stability-policy-"))
})

afterEach(async () => {
	await fs.rm(dir, { recursive: true, force: true })
})

const controlPath = () => path.join(dir, "control", "vscode.json")
const writeControl = async (content: unknown) => {
	await fs.mkdir(path.dirname(controlPath()), { recursive: true })
	await fs.writeFile(controlPath(), JSON.stringify(content), "utf8")
}

const baseControl = {
	schema_major: 1,
	revision: 7,
	enabled: true,
	metrics_enabled: true,
	logs_enabled: true,
	account_epoch: "acct-1",
	account_state: "ready",
	expires_at: Number.MAX_SAFE_INTEGER,
}

describe("control file parsing", () => {
	it("rejects malformed and unknown fields", () => {
		expect(parseControl("{")).toBeUndefined()
		expect(parseControl("null")).toBeUndefined()
		expect(parseControl(JSON.stringify({ ...baseControl, extra: 1 }))).toBeUndefined()
		expect(parseControl(JSON.stringify({ ...baseControl, schema_major: 2 }))).toBeUndefined()
	})

	it("accepts a valid file", () => {
		expect(parseControl(JSON.stringify(baseControl))?.revision).toBe(7)
	})
})

describe("policy store fail-open semantics", () => {
	it("is fail-open when the control file is missing", async () => {
		const clock = fixedClock(1000)
		const store = new PolicyStore({ controlPath: controlPath(), clock })
		await store.refresh()
		const snapshot = store.current()
		expect(snapshot.explicit).toBeUndefined()
		expect(snapshot.revision).toBe(0)
		expect(snapshot.epoch).toBe(UNBOUND_EPOCH)
		expect(snapshot.permit("critical", ["metrics", "logs"])).toEqual(["metrics", "logs"])
	})

	it("permits per purpose, channel and expiry", async () => {
		const clock = fixedClock(1000)
		await writeControl({ ...baseControl, logs_enabled: false, metrics_allowed_categories: ["critical"] })
		const store = new PolicyStore({ controlPath: controlPath(), clock })
		await store.refresh()
		const snapshot = store.current()
		expect(snapshot.permit("critical", ["metrics", "logs"])).toEqual(["metrics"])
		expect(snapshot.permit("diagnostic", ["metrics"])).toEqual([])
		expect(snapshot.permit("critical", ["logs"])).toEqual([])
	})

	it("stops both purposes on disabled or expired common policy", async () => {
		const clock = fixedClock(1000)
		await writeControl({ ...baseControl, enabled: false })
		const disabled = new PolicyStore({ controlPath: controlPath(), clock })
		await disabled.refresh()
		expect(disabled.current().permit("critical", ["metrics", "logs"])).toEqual([])

		await writeControl({ ...baseControl, expires_at: 500 })
		const expired = new PolicyStore({ controlPath: controlPath(), clock })
		await expired.refresh()
		expect(expired.current().permit("critical", ["metrics"])).toEqual([])
	})

	it("permanently retires an epoch after a change", async () => {
		const clock = fixedClock(1000)
		await writeControl({ ...baseControl, account_epoch: "acct-1" })
		const store = new PolicyStore({ controlPath: controlPath(), clock })
		await store.refresh()
		expect(store.isRetired("acct-1")).toBe(false)

		await writeControl({ ...baseControl, account_epoch: "acct-2", revision: 8 })
		await store.refresh()
		expect(store.isRetired("acct-1")).toBe(true)
		expect(store.current().epoch).toBe("acct-2")
		expect(store.retiredEpochs()).toEqual(["acct-1"])
	})

	it("does not revive an expired permit after clock rollback", async () => {
		const clock = fixedClock(5000)
		await writeControl({ ...baseControl, expires_at: 6000 })
		const store = new PolicyStore({ controlPath: controlPath(), clock })
		await store.refresh()
		expect(store.current().permit("critical", ["metrics"])).toEqual(["metrics"])

		clock.tick(2000) // now 7000, expired
		expect(store.current().permit("critical", ["metrics"])).toEqual([])

		clock.tick(-5000) // rollback to 2000
		expect(store.current().permit("critical", ["metrics"])).toEqual([]) // floor keeps it expired
	})
})

const queued = (channel: "critical" | "diagnostic" = "critical", bytes = 1024) => ({
	fact: { channel } as Fact,
	bytes,
	channel,
	at: 0,
})

describe("queue bounds", () => {
	it("reserves critical slots: diagnostic rejected beyond non-reserved share", () => {
		const queue = new StabilityQueue()
		const diagMax = QUEUE_MAX_ITEMS - CRITICAL_RESERVED_ITEMS
		for (let i = 0; i < diagMax; i++) expect(queue.offer(queued("diagnostic", 1))).toBe(true)
		expect(queue.offer(queued("diagnostic", 1))).toBe(false)
		expect(queue.rejectedDiagnostic).toBe(1)
		// critical still fits in its reservation
		expect(queue.offer(queued("critical", 1))).toBe(true)
	})

	it("evicts oldest diagnostics under critical pressure, never the reverse", () => {
		const queue = new StabilityQueue()
		const diagBytes = Math.floor(QUEUE_MAX_BYTES * 0.6)
		expect(queue.offer(queued("diagnostic", diagBytes))).toBe(true)
		expect(queue.offer(queued("critical", QUEUE_MAX_BYTES - diagBytes - 100))).toBe(true)
		expect(queue.evictedDiagnostic).toBeGreaterThanOrEqual(0)
		// refill with diagnostics then force eviction with one big critical record
		const q2 = new StabilityQueue()
		q2.offer(queued("diagnostic", 1024))
		q2.offer(queued("diagnostic", 1024))
		expect(q2.offer(queued("critical", QUEUE_MAX_BYTES - 512))).toBe(true)
		expect(q2.evictedDiagnostic).toBe(2)
		expect(q2.claim(10, QUEUE_MAX_BYTES).every(isCritical)).toBe(true)
	})

	it("keeps claimed batches budgeted until release and can requeue on failure", () => {
		const queue = new StabilityQueue()
		for (let i = 0; i < 10; i++) expect(queue.offer(queued("critical", 1024))).toBe(true)
		const batch = queue.claim(5, QUEUE_MAX_BYTES)
		expect(batch.length).toBe(5)
		expect(queue.depth().items).toBe(5)
		queue.requeue(batch)
		expect(queue.depth().items).toBe(10)
		const again = queue.claim(2, QUEUE_MAX_BYTES)
		queue.release(again)
		expect(queue.depth().items).toBe(8) // released batches were written; only unclaimed remain
	})
})

const identity: Identity = {
	producer_id: randomId("pr"),
	run_id: randomId("run"),
	device_id: "device-6d81",
	plugin_version: "3.0.21",
	ide_build: "1.102",
	ide_build_major: "1.102",
	os_family: "linux",
	arch: "x64",
	env: "test",
}

const setup = async (control?: unknown) => {
	if (control) await writeControl(control)
	const clock = fixedClock(1789862400000)
	const policy = new PolicyStore({ controlPath: controlPath(), clock })
	await policy.refresh()
	const queue = new StabilityQueue()
	const recorder = new Recorder({ identity, policy, queue, clock })
	return { clock, policy, queue, recorder }
}

const op = (name: string, data: Record<string, unknown>, over: Partial<Draft> = {}): Draft => ({
	name,
	kind: "operation",
	channel: "critical",
	data: { phase: "end", result: "success", duration_ms: 10, ...data },
	...over,
})

describe("recorder admission gate", () => {
	it("fail-open: queues with unbound epoch and revision 0 without a control file", async () => {
		const { recorder, queue } = await setup()
		expect(recorder.record(op("webview.setup", { stage: "ready" }))).toBe("queued")
		const fact = queue.claim(10, 1 << 20)[0].fact
		expect(fact.account_epoch).toBe(UNBOUND_EPOCH)
		expect(fact.policy_revision).toBe(0)
		expect(fact.seq).toBe(1)
		expect(fact.purposes).toEqual(["metrics", "logs"])
		expect(fact.side).toBe("extension_host")
	})

	it("seq is per channel, strictly monotonic, holes preserved", async () => {
		const { recorder, queue } = await setup()
		recorder.record(op("webview.setup", { stage: "ready" }))
		recorder.record({
			name: "error.reported",
			kind: "diagnostic",
			channel: "diagnostic",
			data: { fault_id: "f-1", error_class: "type_error", handled: true },
		})
		recorder.record(op("panel.load", { trigger: "initial" }))
		const facts = queue.claim(10, 1 << 20).map((item) => item.fact)
		expect(facts.map((f) => [f.channel, f.seq])).toEqual([
			["critical", 1],
			["diagnostic", 1],
			["critical", 2],
		])
	})

	it("policy intersection disables (not drops) facts the policy forbids", async () => {
		const { recorder } = await setup({ ...baseControl, logs_enabled: false })
		const status = recorder.record(op("webview.setup", { stage: "ready" }, { purposes: ["logs"] }))
		expect(status).toBe("disabled")
		expect(recorder.counters.disabledPolicy).toBe(1)
		expect(recorder.counters.accepted).toBe(0)
	})

	it("drops invalid drafts and stamps the policy epoch/revision", async () => {
		const { recorder, queue } = await setup(baseControl)
		expect(recorder.record(op("webview.setup", { stage: "ready", bogus: 1 }))).toBe("dropped")
		expect(recorder.counters.droppedInvalid).toBe(1)
		recorder.record(op("webview.setup", { stage: "ready" }))
		const fact = queue.claim(10, 1 << 20)[0].fact
		expect(fact.account_epoch).toBe("acct-1")
		expect(fact.policy_revision).toBe(7)
	})

	it("t_wall overrides the clock as the fact timestamp (webview capture time)", async () => {
		const { recorder, queue } = await setup()
		recorder.record(op("action", { action: "stop" }, { t_wall: 111, side: "webview" }))
		const fact = queue.claim(10, 1 << 20)[0].fact
		expect(fact.timestamp).toBe(111)
		expect(fact.side).toBe("webview")
	})

	it("standby forwards to the active recorder", async () => {
		const { recorder } = await setup()
		const standby = new Recorder({
			identity,
			policy: recorder["deps"].policy,
			queue: recorder["deps"].queue,
			clock: recorder["deps"].clock,
		})
		standby.setStandbyTarget(recorder)
		expect(standby.record(op("webview.setup", { stage: "ready" }))).toBe("queued")
		expect(recorder.counters.accepted).toBe(1)

		standby.setStandbyTarget(undefined)
		standby.close()
		expect(standby.record(op("webview.setup", { stage: "ready" }))).toBe("disabled")
		expect(standby.counters.disabledShutdown).toBe(1)
	})
})
