import { describe, expect, it } from "vitest"
import { DiagnosticRedactor } from "../diagnostic-redactor"
import { DiagnosticPayload, MAX_PAYLOAD_BYTES } from "../diagnostic-payload"
import { validate, validateGroup } from "../dictionary"
import { fixedClock } from "../clock"
import { PolicyStore } from "../policy"
import { StabilityQueue } from "../queue"
import { Recorder, type Identity } from "../recorder"
import type { Draft, Fact } from "../fact"
import os from "os"
import path from "path"
import { promises as fs } from "fs"

describe("diagnostic redactor (fail-closed credential filter)", () => {
	it("redacts private keys, headers, url credentials, query tokens, key-values and JWTs", () => {
		const jwtHeader = Buffer.from(JSON.stringify({ alg: "HS256" })).toString("base64url")
		const jwt = `${jwtHeader}.c2lnbmF0dXJl.c2lnbmF0dXJl`
		const text = [
			"-----BEGIN RSA PRIVATE KEY-----",
			"MIIEowIBAAKCAQEA1secretsecret",
			"-----END RSA PRIVATE KEY-----",
			"Authorization: Bearer abc.def.ghi",
			"curl https://user:pass123@example.com/api",
			"https://api.com/callback?access_token=supersecret&x=1",
			'{"api_key": "sk-12345", "note": "keep"}',
			`inline ${jwt} standalone`,
		].join("\n")
		const { text: out } = DiagnosticRedactor.clean(text)
		expect(out).toContain("<redacted:private-key>")
		expect(out).not.toContain("MIIEowIBAAKCAQEA1secretsecret")
		expect(out).toContain("Authorization: <redacted:authorization>")
		expect(out).not.toContain("pass123")
		expect(out).toContain("user:<redacted:url-credential>@")
		expect(out).not.toContain("supersecret")
		expect(out).toContain("?access_token=<redacted:")
		expect(out).not.toContain("sk-12345")
		expect(out).toContain('"note": "keep"')
		// a bare JWT (no credential key in front) hits the JOSE check directly
		expect(out).toContain("inline <redacted:jwt> standalone")
		expect(out).not.toContain(jwt)
		// a Cookie header on its own line redacts wholesale (the Authorization
		// value scan above would otherwise swallow the following line too)
		const cookie = DiagnosticRedactor.clean("Cookie: session=xyz; other=1")
		expect(cookie.text).toContain("Cookie: <redacted:cookie>")
		expect(cookie.text).not.toContain("session=xyz")
	})

	it("leaves ordinary text untouched and reports changed=false", () => {
		const text = "GET /api/v1/sessions 200 OK in 42ms"
		expect(DiagnosticRedactor.clean(text)).toEqual({ text, changed: false })
	})

	it("redacts a known sensitive field wholesale", () => {
		expect(DiagnosticRedactor.field("Authorization", "Bearer xyz")).toEqual({
			text: "<redacted:authorization>",
			changed: true,
		})
		expect(DiagnosticRedactor.field("OPENAI_API_KEY", "sk-abc")).toEqual({
			text: "<redacted:api-token>",
			changed: true,
		})
		// non-sensitive names fall back to free-text scanning of the value
		const r = DiagnosticRedactor.field("note", "password=hunter2")
		expect(r.changed).toBe(true)
		expect(r.text).toContain("<redacted:password>")
	})

	it("keeps quotes balanced for JSON-escaped values", () => {
		const input = '{"client_secret":"a\\"b"}'
		const { text: out } = DiagnosticRedactor.clean(input)
		expect(out).toBe('{"client_secret":<redacted:client-secret>}')
	})
})

const reassemble = (result: ReturnType<typeof DiagnosticPayload.parts>): Uint8Array => {
	const shards = [...result.drafts].sort((a, b) => (a.data.chunk_index as number) - (b.data.chunk_index as number))
	const joined = shards.map((s) => s.data.content as string).join("")
	return new TextEncoder().encode(joined)
}

describe("diagnostic payload sharding", () => {
	it("shards utf8 text with unique indexes and reassembles losslessly", () => {
		const bytes = new TextEncoder().encode("x".repeat(10_000) + "区域码" + "y".repeat(500))
		const result = DiagnosticPayload.parts("inc-1", "response_body", bytes)
		expect(result.drafts.length).toBeGreaterThan(2)
		expect(result.truncated).toBe(false)
		expect(result.bytes).toBe(bytes.length)
		// every shard passes dictionary + group validation
		expect(validateGroup(result.drafts)).toEqual([])
		// code-point-safe chunking reassembles to the exact input
		expect(Buffer.compare(Buffer.from(reassemble(result)), Buffer.from(bytes))).toBe(0)
	})

	it("falls back to base64 for non-utf8 bytes", () => {
		const bytes = Uint8Array.from([0xff, 0xfe, 0x00, 0x81, 0x99])
		const result = DiagnosticPayload.parts("inc-2", "binary", bytes)
		expect(result.drafts[0].data.encoding).toBe("base64")
		const restored = Buffer.from(result.drafts[0].data.content as string, "base64")
		expect(Buffer.compare(Buffer.from(restored), Buffer.from(bytes))).toBe(0)
	})

	it("clips oversize input head+tail with truncated flag and original hash", () => {
		const bytes = new TextEncoder().encode("A".repeat(600) + "MIDDLE-JUNK" + "B".repeat(600))
		const budget = 512
		const result = DiagnosticPayload.parts("inc-3", "request_body", bytes, budget)
		expect(result.truncated).toBe(true)
		expect(result.bytes).toBe(bytes.length)
		const kept = reassemble(result)
		expect(kept.length).toBe(budget)
		// head half preserved, tail half preserved, middle dropped
		const head = Math.ceil(budget / 2)
		expect(Buffer.from(kept.slice(0, head)).toString()).toBe("A".repeat(head))
		expect(Buffer.from(kept.slice(head)).toString()).toBe("B".repeat(budget - head))
		expect(result.hash).toBe(require("crypto").createHash("sha256").update(bytes).digest("hex"))
	})

	it("rejects invalid budgets", () => {
		const bytes = new TextEncoder().encode("x")
		expect(() => DiagnosticPayload.parts("i", "k", bytes, 0)).toThrow()
		expect(() => DiagnosticPayload.parts("i", "k", bytes, MAX_PAYLOAD_BYTES + 1)).toThrow()
	})

	it("empty payload produces zero shards", () => {
		const result = DiagnosticPayload.parts("inc-4", "empty", new TextEncoder().encode(""))
		expect(result.drafts).toEqual([])
		expect(result.hash).toBe(require("crypto").createHash("sha256").update(new Uint8Array(0)).digest("hex"))
	})
})

describe("dictionary v2 rules", () => {
	const base: Draft = {
		name: "diagnostic.reported",
		kind: "diagnostic",
		channel: "diagnostic",
		context: { incident_id: "inc-1" },
		purposes: ["logs"],
		schemaVersion: "2.0",
		data: {
			severity: "error",
			component: "rpc",
			code: "type_error",
			message: "cannot read properties of undefined",
			thread_name: "main",
			thread_id: 1,
			payload_refs: [],
			truncated: false,
		},
	}

	it("accepts a well-formed v2 main record", () => {
		expect(validate(base)).toEqual([])
	})

	it("rejects missing incident_id context, non-logs purposes and wrong schema version", () => {
		expect(validate({ ...base, context: {} })).not.toEqual([])
		expect(validate({ ...base, purposes: ["metrics", "logs"] })).not.toEqual([])
		expect(validate({ ...base, schemaVersion: "1.0" })).not.toEqual([])
		expect(validate({ ...base, name: "rpc", kind: "operation" })).not.toEqual([])
	})

	it("v1 names reject schemaVersion 2.0", () => {
		const violations = validate({
			name: "webview.setup",
			kind: "operation",
			channel: "critical",
			schemaVersion: "2.0",
			data: { phase: "end", result: "success", duration_ms: 1 },
		})
		expect(violations.join()).toContain("schema version")
	})

	it("enforces chunk ordering and unique indexes per incident+kind", () => {
		const payload = (index: number, count: number): Draft => ({
			name: "diagnostic.payload",
			kind: "diagnostic",
			channel: "diagnostic",
			context: { incident_id: "inc-9" },
			purposes: ["logs"],
			schemaVersion: "2.0",
			data: {
				incident_id: "inc-9",
				payload_kind: "response_body",
				chunk_index: index,
				chunk_count: count,
				encoding: "utf8",
				content: "x",
				original_bytes: 1,
				sha256: "a".repeat(64),
				truncated: false,
			},
		})
		expect(validate(payload(3, 2))).not.toEqual([]) // index >= count
		expect(validateGroup([payload(0, 2), payload(1, 2)])).toEqual([])
		expect(validateGroup([payload(1, 2), payload(1, 2)])).not.toEqual([])
		// same index, different kind: allowed
		const other = { ...payload(1, 2), data: { ...payload(1, 2).data, payload_kind: "request_body" } }
		expect(validateGroup([payload(1, 2), other])).toEqual([])
	})
})

describe("recorder v2 admission", () => {
	let dir: string
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

	it("stamps schema_version from the draft and gates on acceptedMajors", async () => {
		dir = await fs.mkdtemp(path.join(os.tmpdir(), "stability-v2-"))
		const clock = fixedClock(1789862400000)
		const policy = new PolicyStore({
			controlPath: path.join(dir, "control", "vscode.json"),
			clock,
		})
		await policy.refresh() // fail-open: acceptedMajors {1,2}
		const queue = new StabilityQueue()
		const recorder = new Recorder({ identity, policy, queue, clock })
		const draft: Draft = {
			name: "diagnostic.reported",
			kind: "diagnostic",
			channel: "diagnostic",
			context: { incident_id: "inc-5" },
			purposes: ["logs"],
			schemaVersion: "2.0",
			data: {
				severity: "warn",
				component: "sse",
				code: "decode_failed",
				message: "partial json at byte 42",
				thread_name: "extensionHost",
				thread_id: 7,
				payload_refs: ["response_body"],
				truncated: false,
			},
		}
		expect(recorder.record(draft)).toBe("queued")
		const [fact] = queue.claim(10, 1 << 20).map((i) => i.fact as Fact)
		expect(fact.schema_version).toBe("2.0")
		expect(fact.purposes).toEqual(["logs"])
		expect(fact.context?.incident_id).toBe("inc-5")

		// explicit control file without the majors field pins v1: v2 disables
		await fs.mkdir(path.join(dir, "control"), { recursive: true })
		await fs.writeFile(
			path.join(dir, "control", "vscode.json"),
			JSON.stringify({
				schema_major: 1,
				revision: 1,
				enabled: true,
				account_epoch: "acct-2",
				account_state: "ready",
				expires_at: Number.MAX_SAFE_INTEGER,
			}),
			"utf8",
		)
		await policy.refresh()
		expect(policy.current().acceptedMajors).toEqual([1])
		const before = recorder.counters.disabledPolicy
		expect(recorder.record(draft)).toBe("disabled")
		expect(recorder.counters.disabledPolicy).toBe(before + 1)
		await fs.rm(dir, { recursive: true, force: true })
	})
})
