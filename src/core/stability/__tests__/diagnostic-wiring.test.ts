import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { promises as fs } from "fs"
import os from "os"
import path from "path"
import { fixedClock } from "../clock"
import { PolicyStore } from "../policy"
import { StabilityQueue } from "../queue"
import { Recorder, type Identity } from "../recorder"
import { Diagnostics } from "../diagnostics"
import { DiagnosticBridge } from "../diagnostic-bridge"
import { withDiagnosticContext } from "../diagnostic-context"
import { observeRpc } from "../observe/rpc"
import { receiveStabilityDiagnostics } from "../webview-bridge"
import { StabilityService } from "../service"
import type { Fact } from "../fact"

let dir: string
let clock: ReturnType<typeof fixedClock>
let queue: StabilityQueue
let recorder: Recorder

const identity: Identity = {
	producer_id: "pr-1",
	run_id: "run-1",
	device_id: "device-1",
	plugin_version: "3.0.22",
	ide_build: "1.138",
	ide_build_major: "1.138",
	os_family: "linux",
	arch: "x64",
	env: "test",
}

beforeEach(async () => {
	dir = await fs.mkdtemp(path.join(os.tmpdir(), "stability-wire-"))
	clock = fixedClock(1789862400000)
	const policy = new PolicyStore({ controlPath: path.join(dir, "control", "vscode.json"), clock })
	await policy.refresh()
	queue = new StabilityQueue()
	recorder = new Recorder({ identity, policy, queue, clock })
})

afterEach(async () => {
	await fs.rm(dir, { recursive: true, force: true })
	vi.restoreAllMocks()
})

const drain = (): Fact[] => queue.claim(1000, 1 << 30).map((item) => item.fact)

describe("ambient diagnostic context", () => {
	it("merges ambient values and lets explicit arguments win", () => {
		const diagnostics = new Diagnostics({ recorder, clock })
		const ambient = {
			context: { operation_id: "op-ambient" },
			attributes: { route: "/ambient", code: "ambient_code" },
			payloads: { ambient_body: () => "ambient payload" },
		}
		withDiagnosticContext(ambient, () => {
			diagnostics.report({
				severity: "error",
				component: "rpc",
				message: "explicit message",
				error: new Error("boom"),
				attributes: { code: "explicit_code" }, // wins over ambient
			})
		})
		const facts = drain()
		const parent = facts.find((f) => f.name === "diagnostic.reported")
		expect(parent?.context?.operation_id).toBe("op-ambient")
		expect(parent?.data.code).toBe("explicit_code")
		const shards = facts.filter((f) => f.name === "diagnostic.payload")
		expect(shards.some((s) => s.data.payload_kind === "ambient_body")).toBe(true)
		// outside the context the ambient payload is gone
		diagnostics.report({ severity: "warn", component: "rpc", message: "bare", error: new Error("x") })
		const next = drain()
		expect(
			next.filter((f) => f.name === "diagnostic.payload").some((s) => s.data.payload_kind === "ambient_body"),
		).toBe(false)
	})
})

describe("diagnostic bridge", () => {
	it("drains asynchronously into installed sinks and survives sink errors", async () => {
		const bridge = new DiagnosticBridge()
		const seen: string[] = []
		bridge.install((input) => {
			if (input.message === "boom-sink") throw new Error("sink exploded")
			seen.push(input.message)
		})
		bridge.offer({ severity: "warn", component: "c", message: "first" })
		bridge.offer({ severity: "warn", component: "c", message: "boom-sink" })
		bridge.offer({ severity: "warn", component: "c", message: "second" })
		await new Promise((resolve) => setImmediate(resolve))
		expect(seen).toEqual(["first", "second"]) // failing record skipped, others delivered
	})

	it("drops overflow and never reenters from inside the drain", async () => {
		const bridge = new DiagnosticBridge()
		let reentered = false
		bridge.install(() => {
			// logging from inside the drain mirrors back — must be dropped
			bridge.offer({ severity: "error", component: "collector", message: "recursive" })
			reentered = bridge.reentrant
		})
		bridge.offer({ severity: "warn", component: "c", message: "outer" })
		await new Promise((resolve) => setImmediate(resolve))
		expect(reentered).toBe(true)
		const outer = new DiagnosticBridge()
		outer.install(() => {})
		for (let i = 0; i < 300; i++) outer.offer({ severity: "warn", component: "c", message: `m${i}` })
		expect(outer.dropped).toBe(300 - 256)
	})

	it("uninstall stops delivery", async () => {
		const bridge = new DiagnosticBridge()
		const seen: string[] = []
		bridge.install((input) => seen.push(input.message))
		bridge.uninstall()
		bridge.offer({ severity: "warn", component: "c", message: "after" })
		await new Promise((resolve) => setImmediate(resolve))
		expect(seen).toEqual([])
	})
})

describe("rpc mirror wiring", () => {
	it("a failing relayed call mirrors a v2 incident with route and operation context", async () => {
		const service = new StabilityService({
			home: dir,
			store: memoryStore(),
			pluginVersion: "3.0.22-test",
			ideBuild: "1.138.0",
			test: true,
			clock,
			log: () => {},
		})
		service.start()
		await service.ready()
		const err = new TypeError("cannot read properties of undefined (reading 'id')")
		await expect(
			observeRpc(service, "/api/v1/session/prompt", async () => {
				throw err
			}),
		).rejects.toBe(err)
		await new Promise((resolve) => setImmediate(resolve)) // bridge drain
		await new Promise((resolve) => setImmediate(resolve)) // writer tick settle
		await service.stop("app_close")
		const outbox = path.join(dir, "outbox")
		const [file] = (await fs.readdir(outbox)).filter((name) => name.endsWith(".jsonl"))
		const raw = await fs.readFile(path.join(outbox, file), "utf8")
		const facts = raw
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line) as Fact)
		const parent = facts.find((f) => f.name === "diagnostic.reported")
		expect(parent).toBeTruthy()
		expect(parent?.context?.operation_id).toMatch(/^op-/)
		expect(parent?.data.code).toBe("typeerror")
		const shards = facts.filter((f) => f.name === "diagnostic.payload")
		expect(shards.some((s) => s.data.payload_kind === "message")).toBe(true)
		expect(shards.some((s) => s.data.payload_kind === "stack")).toBe(true)
		// high fidelity by design: the raw exception text IS the payload —
		// the outbox alone now explains what threw (last night's storm case)
		expect(JSON.stringify(facts)).toContain("cannot read properties of undefined")
	})
})

const memoryStore = () => {
	const data = new Map<string, string>()
	return {
		get: (key: string) => data.get(key),
		set: (key: string, value: string) => {
			data.set(key, value)
		},
	}
}

describe("webview diagnostics receiving", () => {
	it("an untrusted stabilityDiagnostics message lands as a v2 incident with payloads", async () => {
		const service = new StabilityService({
			home: dir,
			store: memoryStore(),
			pluginVersion: "3.0.22-test",
			ideBuild: "1.138.0",
			test: true,
			clock,
			log: () => {},
		})
		service.start()
		await service.ready()
		const consumed = receiveStabilityDiagnostics(service, {
			type: "stabilityDiagnostics",
			diagnostic: {
				severity: "warn",
				component: "protocol",
				message: "sse frame failed to decode (decode_failed)",
				payloads: { raw_frame: '{"type":"part.delta","prop' },
			},
		})
		expect(consumed).toBe(true)
		// malformed shapes are not consumed (router falls through)
		expect(receiveStabilityDiagnostics(service, { type: "other" })).toBe(false)
		expect(receiveStabilityDiagnostics(service, { type: "stabilityDiagnostics", diagnostic: 42 })).toBe(false)
		await new Promise((resolve) => setImmediate(resolve)) // bridge drain
		await service.stop("app_close")
		const outbox = path.join(dir, "outbox")
		const [file] = (await fs.readdir(outbox)).filter((name) => name.endsWith(".jsonl"))
		const facts = (await fs.readFile(path.join(outbox, file), "utf8"))
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line) as Fact)
		const parent = facts.find((f) => f.name === "diagnostic.reported")
		expect(parent).toBeTruthy()
		expect(parent?.data.component).toBe("webview.protocol")
		expect(parent?.data.thread_name).toBe("webview")
		const shards = facts.filter((f) => f.name === "diagnostic.payload")
		const frame = shards.find((s) => s.data.payload_kind === "raw_frame")
		expect(frame?.data.content).toContain("part.delta")
	})
})
