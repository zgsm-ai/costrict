import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { promises as fs } from "fs"
import os from "os"
import path from "path"
import { fixedClock } from "../clock"
import { PolicyStore } from "../policy"
import { StabilityQueue } from "../queue"
import { Recorder, type Identity } from "../recorder"
import { Diagnostics } from "../diagnostics"
import { ErrorClassifier } from "../error-classifier"
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
	dir = await fs.mkdtemp(path.join(os.tmpdir(), "stability-diag-"))
	clock = fixedClock(1789862400000)
	const policy = new PolicyStore({ controlPath: path.join(dir, "control", "vscode.json"), clock })
	await policy.refresh()
	queue = new StabilityQueue()
	recorder = new Recorder({ identity, policy, queue, clock })
})

afterEach(async () => {
	await fs.rm(dir, { recursive: true, force: true })
})

const drain = (): Fact[] => queue.claim(1000, 1 << 30).map((item) => item.fact)

describe("error classifier", () => {
	it("maps JS error shapes to codes and categories", () => {
		expect(ErrorClassifier.classify(new TypeError("x")).category).toBe("type_error")
		expect(ErrorClassifier.classify(new SyntaxError("x")).category).toBe("syntax_error")
		expect(ErrorClassifier.classify(new Error("fetch failed")).category).toBe("network_error")
		expect(ErrorClassifier.classify(new TypeError("x")).code).toBe("TypeError")
	})

	it("observe flavors HTTP failures with status and route", () => {
		const info = ErrorClassifier.observe(new Error("boom"), 502, "/api/v1/sessions", "POST")
		expect(info.code).toBe("http_502")
		expect(info.attributes.http_status).toBe("502")
		expect(info.attributes.route).toBe("/api/v1/sessions")
		expect(info.attributes.method).toBe("POST")
	})

	it("decode extracts JSON shape mismatches and parse positions", () => {
		expect(ErrorClassifier.decode('{"a":1}', "object")).toBeUndefined()
		const shape = ErrorClassifier.decode('{"a":1}', "array")
		expect(shape?.attributes.expected_type).toBe("array")
		expect(shape?.attributes.actual_type).toBe("object")
		expect(shape?.attributes.json_path).toBe("$")
		const parse = ErrorClassifier.decode("{bad", "object")
		expect(parse?.code).toBe("json_parse")
		expect(parse?.attributes.json_path).toMatch(/^\$@/)
	})
})

describe("diagnostics report", () => {
	it("always records the v1 count form and publishes an atomic v2 incident", () => {
		const diagnostics = new Diagnostics({ recorder, clock })
		const error = new TypeError("cannot read properties of undefined (reading 'foo')")
		const id = diagnostics.report({
			severity: "error",
			component: "rpc",
			message: "session call failed",
			error,
			attributes: { method: "POST", route: "/session/prompt", http_status: "500" },
			payloads: { response_body: () => "Internal Server Error" },
		})
		expect(id).toMatch(/^[0-9a-f-]{36}$/)
		const facts = drain()
		const count = facts.find((f) => f.name === "error.reported")
		expect(count).toBeTruthy()
		expect(count?.channel).toBe("critical")
		expect(count?.purposes).toEqual(["metrics"])
		expect(count?.data.error_class).toBe("type_error")

		const parent = facts.find((f) => f.name === "diagnostic.reported")
		expect(parent?.schema_version).toBe("2.0")
		expect(parent?.context?.incident_id).toBe(id)
		expect(parent?.context?.fault_id).toBeTruthy()
		expect(parent?.data.payload_refs).toContain("response_body")
		expect(parent?.data.http_status).toBe(500)
		expect(parent?.data.method).toBe("POST")

		const shards = facts.filter((f) => f.name === "diagnostic.payload")
		expect(shards.length).toBeGreaterThan(0)
		const body = shards.find((s) => s.data.payload_kind === "response_body")
		expect(body?.data.content).toBe("Internal Server Error")
		// message + stack land as payload kinds too
		expect(shards.some((s) => s.data.payload_kind === "message")).toBe(true)
		expect(shards.some((s) => s.data.payload_kind === "stack")).toBe(true)
	})

	it("same Error object keeps its incident id; a fresh error gets a new one", () => {
		const diagnostics = new Diagnostics({ recorder, clock })
		const error = new Error("once")
		const first = diagnostics.report({ severity: "warn", component: "test", message: "m", error })
		const second = diagnostics.report({ severity: "warn", component: "test", message: "m", error })
		expect(second).toBe(first)
		const third = diagnostics.report({
			severity: "warn",
			component: "test",
			message: "m",
			error: new Error("twice"),
		})
		expect(third).not.toBe(first)
	})

	it("rate limits details per fingerprint and summarizes overflow in the next window", () => {
		const diagnostics = new Diagnostics({ recorder, clock })
		// identical stacks (same creation site) share one fingerprint window
		const repeat = () => {
			try {
				throw new Error("repeat")
			} catch (err) {
				return err as Error
			}
		}
		const seen = new Set<string>()
		for (let i = 0; i < 5; i++) {
			seen.add(diagnostics.report({ severity: "error", component: "c", message: `m${i}`, error: repeat() }))
		}
		let facts = drain()
		// quota 3: three incidents published, two suppressed (count forms still recorded)
		expect(facts.filter((f) => f.name === "diagnostic.reported").length).toBe(3)
		expect(facts.filter((f) => f.name === "error.reported").length).toBe(5)

		clock.tick(61_000) // next window: overflow summary flushes
		diagnostics.report({ severity: "error", component: "c", message: "fresh", error: new Error("fresh") })
		facts = drain()
		const summary = facts.find((f) => f.data.count === 2)
		expect(summary).toBeTruthy()
		expect(summary?.data.message).toContain("suppressed=2")
	})

	it("fails closed to diagnostic.redaction_failed when the filter pipeline throws", () => {
		const diagnostics = new Diagnostics({
			recorder,
			clock,
			redactor: () => {
				throw new Error("filter exploded")
			},
		})
		const id = diagnostics.report({
			severity: "error",
			component: "rpc",
			message: "secret thing",
			error: new Error("boom"),
			payloads: { request_body: () => "never formatted" },
		})
		const facts = drain()
		expect(facts.some((f) => f.name === "diagnostic.redaction_failed")).toBe(true)
		expect(facts.some((f) => f.name === "diagnostic.reported")).toBe(false)
		const failed = facts.find((f) => f.name === "diagnostic.redaction_failed")
		expect(failed?.context?.incident_id).toBe(id)
		expect(JSON.stringify(facts)).not.toContain("secret thing")
	})

	it("masks caller-supplied secrets verbatim before the generic filter", () => {
		const diagnostics = new Diagnostics({ recorder, clock })
		diagnostics.report({
			severity: "warn",
			component: "spawn",
			message: "child env included KILO_SERVER_PASSWORD",
			error: new Error("spawn failed"),
			secrets: ["KILO_SERVER_PASSWORD=hunter2"],
			payloads: { env: () => "KILO_SERVER_PASSWORD=hunter2" },
		})
		const facts = drain()
		const rendered = JSON.stringify(facts)
		expect(rendered).not.toContain("hunter2")
		expect(rendered).toContain("<redacted:known-secret>")
	})

	it("rejects invalid payload kinds without leaking them", () => {
		const diagnostics = new Diagnostics({ recorder, clock })
		diagnostics.report({
			severity: "error",
			component: "c",
			message: "m",
			error: new Error("e"),
			payloads: { "Bad Kind": () => "x" },
		})
		const facts = drain()
		expect(facts.some((f) => f.name === "diagnostic.redaction_failed")).toBe(true)
	})

	it("credentials in messages and stacks never reach the wire", () => {
		const diagnostics = new Diagnostics({ recorder, clock })
		const error = new Error("connect https://user:superpass@cs.example.com/api failed")
		diagnostics.report({ severity: "error", component: "net", message: "request failed", error })
		const rendered = JSON.stringify(drain())
		expect(rendered).not.toContain("superpass")
		expect(rendered).toContain("<redacted:url-credential>")
	})
})
