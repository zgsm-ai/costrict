import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { promises as fs } from "fs"
import os from "os"
import path from "path"
import { fixedClock } from "../clock"
import { StabilityService } from "../service"
import { toDraft, receiveStabilityFacts, type StabilityFactsMessage } from "../webview-bridge"
import { ConnectionObservation } from "../observe/connection"
import { PanelObservation } from "../observe/panel"
import { Availability } from "../observe/availability"
import { apiGroupOf, observeRpc } from "../observe/rpc"
import { observeIdeOperation } from "../observe/ide"
import type { Fact } from "../fact"

let dir: string
let home: string
let clock: ReturnType<typeof fixedClock>
let service: StabilityService
let facts: Fact[]

beforeEach(async () => {
	dir = await fs.mkdtemp(path.join(os.tmpdir(), "stability-obs-"))
	home = path.join(dir, "telemetry")
	clock = fixedClock(1789862400000)
	const store = {
		data: new Map<string, string>(),
		get(k: string) {
			return this.data.get(k)
		},
		set(k: string, v: string) {
			this.data.set(k, v)
		},
	}
	service = new StabilityService({
		home,
		store: store as never,
		pluginVersion: "3.0.21",
		ideBuild: "1.102",
		test: true,
		clock,
	})
	service.start()
	await service.ready()
	facts = []
})

afterEach(async () => {
	await service.stop("app_close")
	await fs.rm(dir, { recursive: true, force: true })
	vi.restoreAllMocks()
})

const drain = (): Fact[] => {
	// Pull straight from the queue via a fresh recorder-attached view.
	const queue = (service as unknown as { queue: { claim: (n: number, b: number) => { fact: Fact }[] } }).queue
	const batch = queue.claim(10_000, 1 << 30)
	const fresh = batch.map((item) => item.fact)
	facts.push(...fresh)
	return fresh
}

const names = (list: Fact[]): string[] => list.map((f) => f.name)

describe("webview bridge validates untrusted input", () => {
	it("converts well-formed wire drafts with side=webview and capture time", () => {
		const draft = toDraft({
			name: "action",
			kind: "operation",
			data: { phase: "end", action: "stop", result: "success", duration_ms: 3 },
			t_wall: 12345,
		})
		expect(draft).toBeTruthy()
		expect(draft?.side).toBe("webview")
		expect(draft?.t_wall).toBe(12345)
	})

	it("rejects malformed drafts", () => {
		expect(toDraft(null)).toBeUndefined()
		expect(toDraft({ name: "action" })).toBeUndefined() // missing kind
		expect(toDraft({ name: "action", kind: "bogus", data: {} })).toBeUndefined()
		expect(toDraft({ name: "action", kind: "operation", channel: "weird", data: {} })).toBeUndefined()
		expect(toDraft({ name: "action", kind: "operation", data: "not-an-object" })).toBeUndefined()
		expect(toDraft({ name: "action", kind: "operation", data: {}, context: { evil: "x" } })).toBeUndefined()
		expect(toDraft({ name: "action", kind: "operation", data: {}, t_wall: "nope" })).toBeUndefined()
	})

	it("accepts valid batches and counts rejections and overflow", () => {
		const message: StabilityFactsMessage = {
			type: "stabilityFacts",
			schema: 1,
			facts: [
				{
					name: "action",
					kind: "operation",
					data: { phase: "end", action: "stop", result: "success", duration_ms: 3 },
				},
				{ name: "nope", kind: "operation", data: {} },
				{
					name: "action",
					kind: "operation",
					data: { phase: "end", action: "stop", result: "bogus", duration_ms: 3 },
				},
			],
			dropped: 2,
		}
		const outcome = receiveStabilityFacts(service, message)
		expect(outcome).toEqual({ accepted: 1, rejected: 2, overflowed: 2 })
		expect(service.healthCounts?.webviewBufferFull).toBe(2)
		const queued = drain().filter((f) => f.name === "action")
		expect(queued.length).toBe(1)
		expect(queued[0].side).toBe("webview")
		expect(queued[0].timestamp).toBeGreaterThan(0)
	})

	it("enforces batch record and byte budgets", () => {
		const facts101 = Array.from({ length: 101 }, () => ({
			name: "action",
			kind: "operation",
			data: { phase: "end", action: "stop", result: "success", duration_ms: 1 },
		}))
		const outcome = receiveStabilityFacts(service, { type: "stabilityFacts", facts: facts101 })
		expect(outcome.accepted).toBe(100)
		expect(outcome.overflowed).toBe(1)
	})
})

describe("connection observation", () => {
	it("drives a journey with attempts, recovery dedup and transitions", () => {
		const observation = new ConnectionObservation(service)
		observation.beginJourney("initial")
		observation.attemptStage("server_url")
		observation.attemptStage("health")
		observation.connected()
		let recorded = drain()
		expect(names(recorded).filter((n) => n === "connection.state_changed").length).toBeGreaterThanOrEqual(1)
		expect(recorded.find((f) => f.name === "connection" && f.data.phase === "end")?.data.result).toBe("success")

		// Multi-signal loss dedups to one recovery.
		observation.lost("heartbeat_failed")
		observation.lost("process_exit")
		observation.attemptStage("csc_start")
		observation.connected()
		recorded = drain()
		const recoveries = recorded.filter((f) => f.name === "connection.recovery" && f.data.phase === "end")
		expect(recoveries.length).toBe(1)
		expect(recoveries[0].data.result).toBe("success")
		expect(recoveries[0].data.intervention).toBe("automatic")
	})

	it("terminal failure is failure, never timeout", () => {
		const observation = new ConnectionObservation(service)
		observation.beginJourney("manual")
		observation.failed("cs_cloud_not_running")
		const recorded = drain()
		const journey = recorded.find((f) => f.name === "connection" && f.data.phase === "end")
		expect(journey?.data.result).toBe("failure")
	})

	it("close settles cancelled without emitting disconnect", () => {
		const observation = new ConnectionObservation(service)
		observation.beginJourney("initial")
		observation.close()
		const recorded = drain()
		expect(recorded.find((f) => f.name === "connection" && f.data.phase === "end")?.data.result).toBe("cancelled")
		expect(
			recorded.filter((f) => f.name === "connection.state_changed" && f.data.to === "disconnected").length,
		).toBe(0)
	})
})

describe("panel observation", () => {
	it("M01 setup reaches ready through stages", () => {
		const panel = new PanelObservation(service)
		panel.setupBegin()
		panel.setupHtmlInjected()
		panel.setupReady()
		const setup = drain().filter((f) => f.name === "webview.setup")
		expect(setup.map((f) => f.data.phase)).toEqual(["start", "progress", "progress", "end"])
		expect(setup[setup.length - 1].data.result).toBe("success")
	})

	it("M03 readiness completes on five conditions including bridge-fed ones", () => {
		const panel = new PanelObservation(service)
		panel.readinessBegin()
		panel.conditionMet("view")
		panel.conditionMet("workspace")
		expect(panel.webviewState("app", "starting")).toBe(false)
		expect(panel.webviewState("app", "ready")).toBe(true)
		expect(panel.webviewState("stream", "open")).toBe(true)
		expect(panel.webviewState("input", "enabled")).toBe(true)
		const readiness = drain().filter((f) => f.name === "plugin.readiness")
		expect(readiness[readiness.length - 1].data.result).toBe("success")
	})

	it("M03 blocked on missing credentials", async () => {
		const panel = new PanelObservation(service)
		panel.readinessBegin()
		await panel.probeCredentials(async () => undefined)
		const recorded = drain()
		const credentials = recorded.find((f) => f.name === "credentials.ready" && f.data.phase === "end")
		expect(credentials?.data.result).toBe("blocked")
		const readiness = recorded.find((f) => f.name === "plugin.readiness" && f.data.phase === "end")
		expect(readiness?.data.result).toBe("blocked")
		expect(readiness?.data.reason).toBe("credentials_missing")
	})
})

describe("availability intervals", () => {
	it("opens/closes on visibility and state changes without overlap", () => {
		const availability = new Availability(service)
		availability.update(true, true, "connecting", 1000, 0)
		availability.update(true, true, "ready", 5000, 4000)
		availability.update(false, true, "ready", 9000, 8000) // inactive closes
		availability.update(true, true, "ready", 20000, 19000)
		availability.update(true, false, "ready", 26000, 25000) // unfocused closes
		const intervals = drain().filter((f) => f.name === "availability")
		expect(intervals.map((f) => [f.data.state, f.data.duration_ms])).toEqual([
			["connecting", 4000],
			["ready", 4000],
			["ready", 6000],
		])
	})

	it("pause discards the open interval", () => {
		const availability = new Availability(service)
		availability.update(true, true, "ready", 1000, 0)
		availability.pause()
		availability.update(true, true, "ready", 999_999, 999_000)
		const intervals = drain().filter((f) => f.name === "availability")
		// The paused interval was discarded; the new one starts fresh.
		expect(intervals.length).toBe(0)
	})

	it("slices long intervals every 30s staying contiguous", () => {
		const availability = new Availability(service)
		availability.update(true, true, "ready", 0, 0)
		availability.update(true, true, "ready", 31_000, 30_500)
		availability.update(true, true, "ready", 65_000, 64_800)
		const intervals = drain().filter((f) => f.name === "availability")
		expect(intervals.length).toBe(2)
	})
})

describe("rpc and ide operations", () => {
	it("derives api groups from paths", () => {
		expect(apiGroupOf("/api/v1/conversations")).toBe("session")
		expect(apiGroupOf("/session/abc/prompt_async")).toBe("session")
		expect(apiGroupOf("/api/v1/permissions/1/reply")).toBe("permission")
		expect(apiGroupOf("/api/v1/events")).toBe("event")
		expect(apiGroupOf("/api/v1/runtime/files/content")).toBe("file")
		expect(apiGroupOf("/api/v1/unknown/thing")).toBe("other")
	})

	it("observes success and failure with results", async () => {
		await observeRpc(service, "/api/v1/session", async () => "ok")
		await expect(
			observeRpc(service, "/api/v1/permissions", async () => {
				throw new TypeError("x")
			}),
		).rejects.toThrow()
		await observeIdeOperation(service, "open_diff", async () => undefined)
		const recorded = drain()
		expect(recorded.find((f) => f.name === "rpc" && f.data.phase === "end")?.data.result).toBe("success")
		expect(recorded.filter((f) => f.name === "rpc").every((f) => f.purposes.includes("metrics"))).toBe(true)
		const ide = recorded.find((f) => f.name === "ide.operation" && f.data.phase === "end")
		expect(ide?.data.operation).toBe("open_diff")
		expect(ide?.data.result).toBe("success")
	})
})
