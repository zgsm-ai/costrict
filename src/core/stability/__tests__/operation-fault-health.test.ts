import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { promises as fs } from "fs"
import os from "os"
import path from "path"
import { fixedClock } from "../clock"
import { PolicyStore } from "../policy"
import { StabilityQueue } from "../queue"
import { Recorder, type Identity } from "../recorder"
import { Operation, endWith } from "../operation"
import { Faults } from "../fault"
import { Health } from "../health"
import type { Draft, Fact } from "../fact"
import { randomId } from "../ids"

let dir: string
let clock: ReturnType<typeof fixedClock>
let queue: StabilityQueue
let recorder: Recorder
let facts: Fact[]

beforeEach(async () => {
	dir = await fs.mkdtemp(path.join(os.tmpdir(), "stability-ops-"))
	clock = fixedClock(1789862400000)
	const policy = new PolicyStore({ controlPath: path.join(dir, "control", "vscode.json"), clock })
	await policy.refresh()
	queue = new StabilityQueue()
	const identity: Identity = {
		producer_id: "pr-1",
		run_id: "run-1",
		device_id: "device-1",
		plugin_version: "3.0.21",
		ide_build: "1.102",
		ide_build_major: "1.102",
		os_family: "linux",
		arch: "x64",
		env: "test",
	}
	recorder = new Recorder({ identity, policy, queue, clock })
	facts = []
})

afterEach(async () => {
	await fs.rm(dir, { recursive: true, force: true })
	vi.useRealTimers()
})

const drain = (): Fact[] => {
	const batch = queue.claim(10_000, 1 << 30)
	const fresh = batch.map((item) => item.fact)
	facts.push(...fresh)
	return fresh
}

describe("operation pairing", () => {
	it("records start with deadline and end with duration and result", () => {
		const op = Operation.begin({
			recorder,
			clock,
			name: "webview.setup",
			deadlineMs: 30_000,
			fields: { stage: "resolve" },
		})
		clock.tick(120)
		op.end("success", { stage: "ready" })
		const [start, end] = drain().map((f) => f.data)
		expect(start.phase).toBe("start")
		expect(start.deadline_ms).toBe(30_000)
		expect(start.stage).toBe("resolve")
		expect(end.phase).toBe("end")
		expect(end.result).toBe("success")
		expect(end.duration_ms).toBe(120)
		expect(end.stage).toBe("ready")
	})

	it("settles exactly once — business end first wins", () => {
		const op = Operation.begin({ recorder, clock, name: "csc.detect", deadlineMs: 30_000 })
		op.end("success")
		op.end("failure")
		op.cancel()
		const ends = drain().filter((f) => f.data.phase === "end")
		expect(ends.length).toBe(1)
		expect(ends[0].data.result).toBe("success")
	})

	it("timer settles timeout with duration=deadline; late business end adds nothing", () => {
		vi.useFakeTimers()
		const op = Operation.begin({ recorder, clock, name: "credentials.ready", deadlineMs: 5_000 })
		vi.advanceTimersByTime(5_000)
		op.end("success")
		const ends = drain().filter((f) => f.data.phase === "end")
		expect(ends.length).toBe(1)
		expect(ends[0].data.result).toBe("timeout")
		expect(ends[0].data.duration_ms).toBe(5_000)
		expect(ends[0].data.cause).toBe("unknown")
	})

	it("progress never settles and is suppressed after end", () => {
		const op = Operation.begin({
			recorder,
			clock,
			name: "connection",
			deadlineMs: 30_000,
			fields: { trigger: "initial" },
		})
		op.progress("server_url")
		op.end("success")
		op.progress("health")
		const phases = drain().map((f) => f.data.phase)
		expect(phases).toEqual(["start", "progress", "end"])
	})

	it("reserved keys cannot be overridden by business fields", () => {
		const op = Operation.begin({
			recorder,
			clock,
			name: "action",
			deadlineMs: 30_000,
			fields: { action: "stop", result: "bogus", duration_ms: 999, phase: "end" },
		})
		op.end("success", { duration_ms: 1, result: "bogus" })
		const [start, end] = drain().map((f) => f.data)
		expect(start.phase).toBe("start")
		expect(start.result).toBeUndefined()
		expect(start.duration_ms).toBeUndefined()
		expect(end.result).toBe("success")
		expect(end.duration_ms).toBe(0)
	})

	it("keeps the begin-time epoch on end (never rebinds)", async () => {
		const controlPath = path.join(dir, "control", "vscode.json")
		await fs.mkdir(path.dirname(controlPath), { recursive: true })
		const policy = new PolicyStore({ controlPath, clock })
		await policy.refresh() // fail-open epoch: unbound
		const identity: Identity = { ...recorder["deps"].identity }
		const localRecorder = new Recorder({ identity, policy, queue: new StabilityQueue(), clock })
		const op = Operation.begin({ recorder: localRecorder, clock, name: "panel.load", deadlineMs: 30_000 })
		await fs.writeFile(
			controlPath,
			JSON.stringify({
				schema_major: 1,
				revision: 3,
				enabled: true,
				account_epoch: "acct-9",
				account_state: "ready",
				expires_at: Number.MAX_SAFE_INTEGER,
			}),
			"utf8",
		)
		await policy.refresh()
		op.end("success")
		const localFacts = localRecorder["deps"].queue.claim(10, 1 << 20).map((i) => i.fact)
		expect(localFacts.every((f) => f.account_epoch === "unbound")).toBe(true)
	})

	it("endWith maps AbortError to cancelled and rethrows", async () => {
		const op = Operation.begin({
			recorder,
			clock,
			name: "rpc",
			deadlineMs: 30_000,
			fields: { api_group: "session" },
		})
		const failure = endWith(op, Promise.reject(Object.assign(new Error("stop"), { name: "AbortError" })))
		await expect(failure).rejects.toThrow()
		const end = drain().filter((f) => f.data.phase === "end")[0]
		expect(end.data.result).toBe("cancelled")
	})
})

describe("faults", () => {
	it("skips abort errors", () => {
		const faults = new Faults({ recorder, clock })
		expect(faults.report(Object.assign(new Error("x"), { name: "AbortError" }), "host", false)).toBeUndefined()
		expect(drain().length).toBe(0)
	})

	it("emits count fact once per fault_id and rate limits details per fingerprint", () => {
		const faults = new Faults({ recorder, clock })
		const first = new TypeError("boom /home/secret")
		faults.report(first, "webview", false, "fault-1")
		faults.report(first, "webview", false, "fault-1") // dedup
		for (let i = 0; i < 5; i++) faults.report(first, "webview", false, `fault-${i + 2}`) // same fingerprint
		const all = drain()
		const counts = all.filter((f) => f.channel === "critical")
		const details = all.filter((f) => f.channel === "diagnostic")
		// count facts: fault-1 once + 5 distinct ids = 6; dedup removed one
		expect(counts.length).toBe(6)
		expect(details.length).toBe(3) // rate limit 3/fingerprint/minute
		const messages = details.map((f) => f.data.message as string)
		for (const message of messages) expect(message).toMatch(/^fault:webview:type_error$/)
		expect(JSON.stringify(all)).not.toContain("secret") // no raw paths from the message
	})

	it("summary counts overflow in the next window", () => {
		const faults = new Faults({ recorder, clock })
		const err = new TypeError("same")
		for (let i = 0; i < 6; i++) faults.report(err, "host", true, `f-${i}`)
		let details = drain().filter((f) => f.channel === "diagnostic")
		expect(details.length).toBe(3)
		clock.tick(61_000)
		// Same fingerprint in the new window: lazily flushes the previous
		// window's overflow summary, then emits the new window's first detail.
		faults.report(err, "host", true, "f-next")
		details = drain().filter((f) => f.channel === "diagnostic")
		const summary = details.find((f) => f.data.count === 3)
		expect(summary).toBeTruthy()
		expect(details.some((f) => f.data.count === 1)).toBe(true)
	})
})

describe("health", () => {
	it("emits increments and gauges, immediately on loss change", () => {
		const health = new Health({ recorder, queue, clock, intervalMs: 30_000 })
		health.poll()
		let emitted = drain()
		expect(emitted.length).toBe(1)
		expect(emitted[0].name).toBe("telemetry.health")
		expect(emitted[0].data.drop).toBe(0)

		recorder.record({ name: "nope", kind: "operation", channel: "critical", data: {} }) // droppedInvalid++
		health.poll() // loss changed → immediate emit despite interval
		emitted = drain()
		expect(emitted.length).toBe(1)
		expect(emitted[0].data.drop).toBe(1)

		health.poll() // no change, within interval → suppressed
		expect(drain().length).toBe(0)
	})

	it("tracks write errors and webview buffer overflow deltas", () => {
		const health = new Health({ recorder, queue, clock, intervalMs: 30_000 })
		health.writeError = 2
		health.webviewBufferFull = 5
		clock.tick(31_000)
		health.poll()
		const [fact] = drain()
		expect(fact.data.write_error).toBe(2)
		expect(fact.data.webview_buffer_full).toBe(5)
		health.writeError = 3
		health.poll()
		const [next] = drain()
		expect(next.data.write_error).toBe(1)
		expect(next.data.webview_buffer_full).toBe(0)
	})
})

describe("fault fingerprint frames", () => {
	it("never includes file paths or raw text", () => {
		const faults = new Faults({ recorder, clock })
		faults.report(new TypeError("raw message with /home/user/token"), "collector", true, "f-frames")
		const all = drain()
		expect(JSON.stringify(all)).not.toContain("/home/user")
		expect(JSON.stringify(all)).not.toContain("raw message")
	})
})

const draftCheck = (draft: Draft): boolean => recorder.record(draft) === "queued"
it("sanity: op helper still queues", () => {
	expect(
		draftCheck({
			name: "webview.setup",
			kind: "operation",
			channel: "critical",
			data: { phase: "start", deadline_ms: 1000 },
		}),
	).toBe(true)
	expect(randomId("x")).toMatch(/^x-/)
})
