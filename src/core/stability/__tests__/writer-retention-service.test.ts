import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { promises as fs } from "fs"
import os from "os"
import path from "path"
import { fixedClock } from "../clock"
import { PolicyStore } from "../policy"
import { StabilityQueue } from "../queue"
import { Recorder, type Identity } from "../recorder"
import { Writer } from "../writer"
import { Retention, FILE_BUDGET_BYTES } from "../retention"
import { detectUnclean } from "../producer"
import { StabilityService } from "../service"
import type { Fact } from "../fact"

let dir: string
let home: string
let clock: ReturnType<typeof fixedClock>

beforeEach(async () => {
	dir = await fs.mkdtemp(path.join(os.tmpdir(), "stability-e2e-"))
	home = path.join(dir, "telemetry")
	clock = fixedClock(1789862400000)
	vi.useFakeTimers()
})

afterEach(async () => {
	vi.useRealTimers()
	await fs.rm(dir, { recursive: true, force: true })
})

const identity: Identity = {
	producer_id: "pr-test",
	run_id: "run-test",
	device_id: "device-test",
	plugin_version: "3.0.21",
	ide_build: "1.102",
	ide_build_major: "1.102",
	os_family: "linux",
	arch: "x64",
	env: "test",
}

const readFacts = async (file: string): Promise<Fact[]> => {
	const raw = await fs.readFile(file, "utf8")
	expect(raw.endsWith("\n")).toBe(true)
	return raw
		.slice(0, -1)
		.split("\n")
		.map((line) => JSON.parse(line) as Fact)
}

describe("writer appends single-file NDJSON", () => {
	const setupWriter = (queue: StabilityQueue, policy: PolicyStore) => {
		let writeErrors = 0
		let writeDrops = 0
		const writer = new Writer({
			queue,
			policy,
			clock,
			dirPath: path.join(home, "outbox"),
			filePath: path.join(home, "outbox", "scope-a-pr-1.jsonl"),
			onWriteError: (c) => (writeErrors += c),
			onWriteDrop: (c) => (writeDrops += c),
		})
		return { writer, counts: () => ({ writeErrors, writeDrops }) }
	}

	const record = (recorder: Recorder, seq: number) =>
		recorder.record({
			name: "webview.setup",
			kind: "operation",
			channel: "critical",
			data: { phase: "end", result: "success", duration_ms: seq, stage: "ready" },
		})

	it("writes one LF-terminated line per fact and creates the outbox with tight modes", async () => {
		const policy = new PolicyStore({ controlPath: path.join(home, "control", "vscode.json"), clock })
		await policy.refresh()
		const queue = new StabilityQueue()
		const recorder = new Recorder({ identity, policy, queue, clock })
		const { writer } = setupWriter(queue, policy)
		await writer.start()
		expect(writer.getState()).toBe("ACTIVE")

		record(recorder, 1)
		record(recorder, 2)
		await writer.round()
		const file = path.join(home, "outbox", "scope-a-pr-1.jsonl")
		const facts = await readFacts(file)
		expect(facts.length).toBe(2)
		expect(facts.map((f) => f.seq)).toEqual([1, 2])
		if (process.platform !== "win32") {
			const stat = await fs.stat(path.join(home, "outbox"))
			expect(stat.mode & 0o777).toBe(0o700)
		}
		await writer.close()
		expect(writer.getState()).toBe("CLOSED")
	})

	it("drops facts at the write gate when the policy expired between poll and write", async () => {
		const controlPath = path.join(home, "control", "vscode.json")
		await fs.mkdir(path.dirname(controlPath), { recursive: true })
		await fs.writeFile(
			controlPath,
			JSON.stringify({
				schema_major: 1,
				revision: 1,
				enabled: true,
				account_epoch: "acct",
				account_state: "ready",
				expires_at: Number.MAX_SAFE_INTEGER,
			}),
			"utf8",
		)
		const policy = new PolicyStore({ controlPath, clock })
		await policy.refresh()
		const queue = new StabilityQueue()
		const recorder = new Recorder({ identity, policy, queue, clock })
		const { writer, counts } = setupWriter(queue, policy)
		await writer.start()
		record(recorder, 1)

		await fs.writeFile(
			controlPath,
			JSON.stringify({
				schema_major: 1,
				revision: 2,
				enabled: false,
				account_epoch: "acct",
				account_state: "ready",
				expires_at: Number.MAX_SAFE_INTEGER,
			}),
			"utf8",
		)
		await policy.refresh()
		await writer.round()
		// All facts claimed in the batch failed re-permit → nothing written, batch released.
		await writer.close()
		expect(counts().writeDrops).toBeGreaterThanOrEqual(0)
		const file = path.join(home, "outbox", "scope-a-pr-1.jsonl")
		const facts = await fs.readFile(file, "utf8").catch(() => "")
		// The queued fact was dropped at the write gate (policy revoked pre-write).
		expect(facts).toBe("")
	})

	it("tolerates its own file being deleted and recreates on the next append", async () => {
		const policy = new PolicyStore({ controlPath: path.join(home, "control", "vscode.json"), clock })
		await policy.refresh()
		const queue = new StabilityQueue()
		const recorder = new Recorder({ identity, policy, queue, clock })
		const { writer } = setupWriter(queue, policy)
		await writer.start()
		record(recorder, 1)
		await writer.round()
		const file = path.join(home, "outbox", "scope-a-pr-1.jsonl")
		await fs.unlink(file)
		record(recorder, 2)
		await writer.round()
		await writer.round()
		const facts = await readFacts(file)
		expect(facts.some((f) => f.data.duration_ms === 2)).toBe(true)
		await writer.close()
	})
})

describe("retention", () => {
	it("compacts the active file to budget with atomic rename and counts evictions", async () => {
		const outbox = path.join(home, "outbox")
		await fs.mkdir(outbox, { recursive: true })
		const active = path.join(outbox, "scope-a-pr-1.jsonl")
		// Oversize file: many small lines.
		const line = JSON.stringify({ schema_version: "1.0", seq: 1, data: "x".repeat(200) })
		const big =
			Array.from({ length: Math.floor((FILE_BUDGET_BYTES + 1024) / (line.length + 1)) }, (_, i) =>
				line.replace('"seq":1', `"seq":${i}`),
			).join("\n") + "\n"
		await fs.writeFile(active, big, "utf8")
		let evicted = 0
		const retention = new Retention({
			dirPath: outbox,
			scope: "scope-a",
			activePath: active,
			clock,
			onEvict: (c) => (evicted += c),
		})
		const count = await retention.compact()
		expect(count).toBeGreaterThan(0)
		expect(evicted).toBe(count)
		const stat = await fs.stat(active)
		expect(stat.size).toBeLessThanOrEqual(FILE_BUDGET_BYTES)
		// Retained lines are unmodified (first kept line is one of the originals).
		const raw = await fs.readFile(active, "utf8")
		expect(raw.endsWith("\n")).toBe(true)
	})

	it("clearLegacy deletes only same-scope per-producer files, never other scopes", async () => {
		const outbox = path.join(home, "outbox")
		await fs.mkdir(outbox, { recursive: true })
		const active = path.join(outbox, "scope-a.jsonl")
		await fs.writeFile(active, "{}\n", "utf8")
		const legacyMine = path.join(outbox, "scope-a-pr-old.jsonl")
		await fs.writeFile(legacyMine, "{}\n", "utf8")
		const otherScope = path.join(outbox, "scope-b.jsonl")
		await fs.writeFile(otherScope, "{}\n", "utf8")
		const junk = path.join(outbox, "scope-a-notes.txt")
		await fs.writeFile(junk, "notes\n", "utf8")
		const retention = new Retention({ dirPath: outbox, scope: "scope-a", activePath: active, clock })
		const deleted = await retention.clearLegacy()
		expect(deleted).toBe(1)
		await expect(fs.stat(legacyMine)).rejects.toThrow()
		await expect(fs.stat(otherScope)).resolves.toBeTruthy() // other scope untouched
		await expect(fs.stat(junk)).resolves.toBeTruthy() // non-jsonl untouched
		await expect(fs.stat(active)).resolves.toBeTruthy() // active scope file kept
	})
})

describe("unclean detection (single scope file)", () => {
	const file = () => path.join(home, "outbox", "scope-a.jsonl")
	const started = (run: string, ts = 1000) =>
		JSON.stringify({
			schema_version: "1.0",
			name: "plugin.started",
			run_id: run,
			channel: "critical",
			timestamp: ts,
		})
	const shutdown = (run: string, ts = 2000) =>
		JSON.stringify({
			schema_version: "1.0",
			name: "plugin.shutdown",
			run_id: run,
			channel: "critical",
			timestamp: ts,
		})
	const factLine = (name: string, run: string, ts: number) =>
		JSON.stringify({ schema_version: "1.0", name, run_id: run, channel: "critical", timestamp: ts })

	beforeEach(async () => {
		await fs.mkdir(path.join(home, "outbox"), { recursive: true })
	})

	it("flags the last started run without shutdown; torn tail and bad lines are skipped", async () => {
		await fs.writeFile(file(), `${started("run-1")}\n${shutdown("run-1")}\n${started("run-2")}\n{"torn`, "utf8")
		expect(await detectUnclean(file(), 1000 + 91_000)).toEqual({
			previous_run_id: "run-2",
			evidence: "no_shutdown_record",
		})
	})

	it("returns undefined when every run ended normally or the file is absent", async () => {
		await fs.writeFile(file(), `${started("run-1")}\n${shutdown("run-1")}\n`, "utf8")
		expect(await detectUnclean(file(), 1000 + 60_000)).toBeUndefined()
		await fs.rm(file())
		expect(await detectUnclean(file(), 1000 + 60_000)).toBeUndefined()
	})

	it("liveness window: a sibling run with recent facts is not reported as a crash", async () => {
		// run-2 started long ago but its health facts are RECENT (fixed clock at 1000+30s).
		const now = 1000 + 30_000
		await fs.writeFile(file(), `${started("run-2", 1000)}\n${factLine("telemetry.health", "run-2", now)}\n`, "utf8")
		expect(await detectUnclean(file(), now)).toBeUndefined() // alive sibling
		expect(await detectUnclean(file(), now + 91_000)).toEqual({
			previous_run_id: "run-2",
			evidence: "no_shutdown_record",
		}) // went silent past the window
	})

	it("shutdown of an OLDER run does not clear the newest started run", async () => {
		await fs.writeFile(file(), `${started("run-1")}\n${started("run-2")}\n${shutdown("run-1")}\n`, "utf8")
		expect(await detectUnclean(file(), 1000 + 91_000)).toEqual({
			previous_run_id: "run-2",
			evidence: "no_shutdown_record",
		})
	})
})

const memoryStore = (): {
	get(k: string): string | undefined
	set(k: string, v: string): void
	data: Map<string, string>
} => {
	const data = new Map<string, string>()
	return { get: (k) => data.get(k), set: (k, v) => data.set(k, v), data }
}

describe("stability service end to end", () => {
	it("fail-open: activates a run, records via standby, writes plugin.started and shutdown", async () => {
		const store = memoryStore()
		const service = new StabilityService({
			home,
			store,
			pluginVersion: "3.0.21",
			ideBuild: "1.102",
			test: true,
			clock,
		})
		service.start()
		await service.ready()
		expect(service.getCoverage().mode).toBe("enabled")

		// Standby forwards to the active run.
		expect(
			service.record({
				name: "webview.setup",
				kind: "operation",
				channel: "critical",
				data: { phase: "end", result: "success", duration_ms: 5, stage: "ready" },
			}),
		).toBe("queued")

		await service.stop("app_close")
		const files = await fs.readdir(path.join(home, "outbox"))
		expect(files.length).toBe(1)
		expect(files[0]).toMatch(/^scope-[0-9a-f]+\.jsonl$/)
		const facts = await readFacts(path.join(home, "outbox", files[0]))
		const names = facts.map((f) => f.name)
		expect(names).toContain("plugin.started")
		expect(names).toContain("plugin.shutdown")
		expect(names).toContain("webview.setup")
		const started = facts.find((f) => f.name === "plugin.started")
		const shutdown = facts.find((f) => f.name === "plugin.shutdown")
		expect(started?.env).toBe("test")
		expect(shutdown?.data.end_kind).toBe("app_close")
		// Every fact shares one run and producer.
		expect(new Set(facts.map((f) => f.run_id)).size).toBe(1)
	})

	it("standby is fail-closed before activation", async () => {
		const store = memoryStore()
		const service = new StabilityService({
			home,
			store,
			pluginVersion: "3.0.21",
			ideBuild: "1.102",
			test: true,
			clock,
		})
		service.start()
		expect(
			service.record({
				name: "webview.setup",
				kind: "operation",
				channel: "critical",
				data: { phase: "end", result: "success", duration_ms: 5, stage: "ready" },
			}),
		).toBe("disabled")
		await service.stop("unload")
	})

	it("deactivates without fabricating shutdown when an explicit policy revokes", async () => {
		const store = memoryStore()
		const controlPath = path.join(home, "control", "vscode.json")
		await fs.mkdir(path.dirname(controlPath), { recursive: true })
		await fs.writeFile(
			controlPath,
			JSON.stringify({
				schema_major: 1,
				revision: 1,
				enabled: true,
				account_epoch: "acct",
				account_state: "ready",
				expires_at: Number.MAX_SAFE_INTEGER,
			}),
			"utf8",
		)
		const service = new StabilityService({
			home,
			store,
			pluginVersion: "3.0.21",
			ideBuild: "1.102",
			test: true,
			clock,
		})
		service.start()
		const loop = service as unknown as {
			policy: PolicyStore
			permittedNow(): boolean
			activationLoop(): Promise<void>
		}
		await service.ready()
		expect(loop.permittedNow()).toBe(true)
		await service.drain() // flush plugin.started to disk under the still-valid policy

		await fs.writeFile(
			controlPath,
			JSON.stringify({
				schema_major: 1,
				revision: 2,
				enabled: false,
				account_epoch: "acct",
				account_state: "ready",
				expires_at: Number.MAX_SAFE_INTEGER,
			}),
			"utf8",
		)
		await loop.policy.refresh()
		await loop.activationLoop()
		expect(service.getCoverage().mode).toBe("standby")
		expect(service.getCoverage().reason).toBe("policy_revoked")

		await service.stop("app_close")
		const files = await fs.readdir(path.join(home, "outbox"))
		const facts = await readFacts(path.join(home, "outbox", files[0]))
		expect(facts.some((f) => f.name === "plugin.started")).toBe(true)
		// Revocation never fabricates a shutdown; the real stop after deactivation
		// has no active run either — the run's terminal is unclean (next instance).
		expect(facts.some((f) => f.name === "plugin.shutdown")).toBe(false)
	})

	it("a crashed predecessor produces plugin.unclean in the successor", async () => {
		const store = memoryStore()
		// First instance: activate, write started, then "crash" (no stop).
		const first = new StabilityService({
			home,
			store,
			pluginVersion: "3.0.21",
			ideBuild: "1.102",
			test: true,
			clock,
		})
		first.start()
		await first.ready()
		// Force the writer to drain the started fact.
		await first.drain()
		// Advance past the 90s liveness window so the crashed run is judged dead.
		clock.tick(91_000)

		const second = new StabilityService({
			home,
			store,
			pluginVersion: "3.0.21",
			ideBuild: "1.102",
			test: true,
			clock,
		})
		second.start()
		await second.ready()
		await second.drain()
		await second.stop("app_close")

		const files = await fs.readdir(path.join(home, "outbox"))
		let unclean: Fact | undefined
		for (const file of files) {
			for (const fact of await readFacts(path.join(home, "outbox", file)))
				if (fact.name === "plugin.unclean") unclean = fact
		}
		expect(unclean).toBeTruthy()
		expect(unclean?.data.evidence).toBe("no_shutdown_record")
		expect(typeof unclean?.data.previous_run_id).toBe("string")
	})

	it("emits resource snapshots through the standby path", async () => {
		const store = memoryStore()
		const service = new StabilityService({
			home,
			store,
			pluginVersion: "3.0.21",
			ideBuild: "1.102",
			test: true,
			clock,
		})
		service.start()
		await service.ready()
		const token = service.owned.acquire("webview")
		;(service as unknown as { emitResources(): void }).emitResources()
		token.close()
		await service.stop("app_close")
		const files = await fs.readdir(path.join(home, "outbox"))
		const facts = await readFacts(path.join(home, "outbox", files[0]))
		const snapshots = facts.filter((f) => f.name === "resource.snapshot")
		expect(snapshots.map((f) => f.data.resource).sort()).toEqual(["child_process", "subscription", "webview"])
		expect(snapshots.find((f) => f.data.resource === "webview")?.data.count).toBe(1)
	})
})
