import { describe, expect, it } from "vitest"
import { promises as fs } from "fs"
import path from "path"
import { DICTIONARY, isRegistered, names, purposes, validate } from "../dictionary"
import { encodeLine, estimateBytes, validContext, type Draft, type Fact } from "../fact"

const draft = (over: Partial<Draft> & Pick<Draft, "name">): Draft => ({
	kind: DICTIONARY[over.name]?.kind ?? "operation",
	channel: "critical",
	data: {},
	...over,
})

describe("dictionary registry", () => {
	it("registers every name from the design table", () => {
		const expected = [
			"plugin.started",
			"plugin.shutdown",
			"plugin.unclean",
			"webview.setup",
			"panel.load",
			"plugin.readiness",
			"webview.state",
			"connection",
			"connection.attempt",
			"connection.state_changed",
			"connection.recovery",
			"csc.detect",
			"csc.start",
			"credentials.ready",
			"session.open",
			"session.restore",
			"action",
			"availability",
			"error.uncaught",
			"error.reported",
			"protocol.error",
			"telemetry.health",
			"session.dispose_risk",
			"rpc",
			"webview.delay",
			"webview.stall",
			"render.apply",
			"ide.operation",
			"resource.snapshot",
		]
		for (const name of expected) expect(isRegistered(name), name).toBe(true)
		expect(names().length).toBe(expected.length)
	})

	it("maps names to metrics-only purposes", () => {
		for (const name of [
			"rpc",
			"render.apply",
			"webview.delay",
			"webview.stall",
			"resource.snapshot",
			"availability",
			"session.dispose_risk",
		]) {
			expect(purposes(name, {}), name).toEqual(["metrics"])
		}
	})

	it("branches error family on data form", () => {
		expect(purposes("error.reported", { fault_id: "f-1", error_class: "type_error" })).toEqual(["metrics"])
		expect(purposes("error.reported", { message: "x", count: 2 })).toEqual(["logs"])
	})
})

describe("dictionary validation rejects (never trims)", () => {
	it("rejects unknown names", () => {
		expect(validate(draft({ name: "nope", kind: "operation" }))).toContain("nope: not registered")
	})

	it("rejects kind mismatch", () => {
		expect(validate(draft({ name: "plugin.started", kind: "sample" }))).toContain("plugin.started: kind mismatch")
	})

	it("rejects unknown data keys", () => {
		const violations = validate(
			draft({
				name: "action",
				kind: "operation",
				data: { phase: "start", deadline_ms: 1000, action: "stop", sneaky: 1 },
			}),
		)
		expect(violations).toContain("action: unknown key sneaky")
	})

	it("rejects out-of-vocab values", () => {
		const violations = validate(
			draft({
				name: "action",
				kind: "operation",
				data: { phase: "end", result: "win", duration_ms: 5, action: "stop" },
			}),
		)
		expect(violations).toContain("action: result not in vocab")
	})

	it("rejects start without deadline and end without result", () => {
		expect(validate(draft({ name: "csc.detect", kind: "operation", data: { phase: "start" } }))).toContain(
			"csc.detect: start requires deadline_ms>0",
		)
		expect(
			validate(draft({ name: "csc.detect", kind: "operation", data: { phase: "end", duration_ms: 5 } })),
		).toContain("csc.detect: end requires result")
	})

	it("rejects error family form mixing", () => {
		const violations = validate(
			draft({
				name: "error.reported",
				kind: "diagnostic",
				channel: "diagnostic",
				data: { fault_id: "f-1", error_class: "type_error", message: "boom", count: 1 },
			}),
		)
		expect(violations).toContain("error.reported: count form and detail form must not mix")
	})

	it("rejects non-token free strings in token fields", () => {
		const violations = validate(
			draft({
				name: "csc.detect",
				kind: "operation",
				data: { phase: "end", result: "failure", duration_ms: 1, error_code: "E/X" },
			}),
		)
		expect(violations).toContain("csc.detect: error_code not a token")
	})

	it("accepts a well-formed operation", () => {
		expect(
			validate(
				draft({
					name: "webview.setup",
					kind: "operation",
					data: { phase: "end", result: "success", duration_ms: 120, stage: "ready" },
				}),
			),
		).toEqual([])
	})
})

describe("fact wire format", () => {
	it("validates context closed set and token shape", () => {
		expect(validContext({ operation_id: "op-1" })).toBe(true)
		expect(validContext({ evil: "x" } as never)).toBe(false)
		expect(validContext({ operation_id: "a/b" })).toBe(false)
		expect(validContext({ operation_id: "" })).toBe(false)
	})

	it("encodes NDJSON lines under the size cap and rejects oversize", () => {
		const fact: Fact = {
			schema_version: "1.0",
			event_id: "c387ecbf-a8d9-487c-94d4-8b8777982401",
			timestamp: 1789862400250,
			producer_id: "pr-7c18",
			run_id: "run-3e92",
			channel: "critical",
			seq: 21,
			account_epoch: "acct-5b02",
			policy_revision: 12,
			purposes: ["metrics", "logs"],
			source: "vscode-plugin",
			device_id: "device-6d81",
			plugin_version: "3.0.21",
			ide_product: "vscode",
			ide_build: "1.102",
			os_family: "linux",
			arch: "x64",
			env: "prod",
			mode: "monolith",
			side: "extension_host",
			connection_provider: "cs-cloud",
			kind: "operation",
			name: "action",
			context: { operation_id: "op-713f", workspace_id: "ws-a3f0" },
			data: {
				phase: "end",
				action: "prompt_submit",
				result: "timeout",
				duration_ms: 30000,
				stage: "rpc",
				cause: "network",
				error_code: "deadline_exceeded",
			},
		}
		const line = encodeLine(fact)
		expect(line.endsWith("\n")).toBe(false)
		expect(() => encodeLine({ ...fact, data: { ...fact.data, action: "x".repeat(40000) } })).toThrow()
	})

	it("estimate is conservative vs real encoding", () => {
		const d = draft({
			name: "action",
			kind: "operation",
			data: { phase: "end", result: "success", duration_ms: 3, action: "stop" },
		})
		expect(estimateBytes(d)).toBeGreaterThan(Buffer.byteLength(JSON.stringify(d.data)))
	})
})

describe("contract fixtures stay in sync", () => {
	it("fixture files parse", async () => {
		for (const f of ["fact-schema.json", "control-schema.json", "output-vectors.json", "contract.json"]) {
			const raw = await fs.readFile(path.join(__dirname, "fixtures", f), "utf8")
			expect(JSON.parse(raw), f).toBeTruthy()
		}
	})

	it("fact schema required fields match the frozen wire set", async () => {
		const schema = JSON.parse(await fs.readFile(path.join(__dirname, "fixtures", "fact-schema.json"), "utf8"))
		const wire = [
			"schema_version",
			"event_id",
			"timestamp",
			"producer_id",
			"run_id",
			"channel",
			"seq",
			"account_epoch",
			"policy_revision",
			"purposes",
			"source",
			"device_id",
			"plugin_version",
			"ide_product",
			"ide_build",
			"os_family",
			"arch",
			"env",
			"mode",
			"side",
			"connection_provider",
			"kind",
			"name",
			"data",
		]
		for (const key of wire) expect(schema.required, key).toContain(key)
		expect(schema.required.length).toBe(wire.length)
	})
})
