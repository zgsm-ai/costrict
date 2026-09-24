import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { promises as fs } from "fs"
import os from "os"
import path from "path"
import { fixedClock } from "../clock"
import { PolicyStore } from "../policy"
import { StabilityQueue } from "../queue"
import { Recorder, type Identity } from "../recorder"
import { Writer } from "../writer"
import { StabilityService } from "../service"
import { Availability } from "../observe/availability"
import type { Fact } from "../fact"

let dir: string
let home: string
let clock: ReturnType<typeof fixedClock>

beforeEach(async () => {
	dir = await fs.mkdtemp(path.join(os.tmpdir(), "stability-fix-"))
	home = path.join(dir, "telemetry")
	clock = fixedClock(1789862400000)
})

afterEach(async () => {
	await fs.rm(dir, { recursive: true, force: true })
	vi.useRealTimers()
	vi.useRealTimers()
})

const identity: Identity = {
	producer_id: "pr-fix",
	run_id: "run-fix",
	device_id: "device-fix",
	plugin_version: "3.0.22",
	ide_build: "1.138",
	ide_build_major: "1.138",
	os_family: "linux",
	arch: "x64",
	env: "test",
}

const record = (recorder: Recorder, seq: number) =>
	recorder.record({
		name: "webview.setup",
		kind: "operation",
		channel: "critical",
		data: { phase: "end", result: "success", duration_ms: seq, stage: "ready" },
	})

describe("writer external-change detection", () => {
	const setup = async () => {
		const policy = new PolicyStore({ controlPath: path.join(home, "control", "vscode.json"), clock })
		await policy.refresh()
		const queue = new StabilityQueue()
		const recorder = new Recorder({ identity, policy, queue, clock })
		const events: string[] = []
		let writeErrors = 0
		const writer = new Writer({
			queue,
			policy,
			clock,
			dirPath: path.join(home, "outbox"),
			filePath: path.join(home, "outbox", "sc-x-pr-fix.jsonl"),
			onWriteError: (c) => (writeErrors += c),
			onWriteDrop: () => {},
			onExternalChange: (m) => events.push(m),
		})
		await writer.start()
		return {
			recorder,
			writer,
			events: () => events,
			errors: () => writeErrors,
			file: path.join(home, "outbox", "sc-x-pr-fix.jsonl"),
		}
	}

	it("counts external truncation as a write error, logs it and keeps appending", async () => {
		const { recorder, writer, events, errors, file } = await setup()
		record(recorder, 1)
		await writer.round()
		const sizeBefore = (await fs.stat(file)).size
		expect(sizeBefore).toBeGreaterThan(0)

		// External actor truncates the head (rotation-style prefix loss).
		await fs.truncate(file, 10)

		record(recorder, 2)
		await writer.round()
		expect(errors()).toBe(1)
		expect(events().length).toBe(1)
		expect(events()[0]).toContain("truncated externally")

		// After rebaselining, the next round writes without further alarms.
		record(recorder, 3)
		await writer.round()
		expect(errors()).toBe(1)
		const lines = (await fs.readFile(file, "utf8")).trim().split("\n")
		const durations = lines.flatMap((l) => {
			try {
				return [JSON.parse(l).data.duration_ms as number]
			} catch {
				return [] // torn fragment from the external truncation — isolatable bad line
			}
		})
		expect(durations).toContain(2)
		expect(durations).toContain(3)
		await writer.close()
	})

	it("sibling appends rebase silently — no alarm, no write_error (single-file layout)", async () => {
		const { recorder, writer, events, errors, file } = await setup()
		record(recorder, 1)
		await writer.round()
		await fs.appendFile(file, '{"schema_version":"1.0","sibling":true}\n', "utf8")
		record(recorder, 2)
		await writer.round()
		expect(events().length).toBe(0)
		expect(errors()).toBe(0)
		const lines = (await fs.readFile(file, "utf8"))
			.trim()
			.split("\n")
			.map((l) => JSON.parse(l) as { data?: { duration_ms?: number } })
		const durations = lines.map((l) => l.data?.duration_ms).filter((d): d is number => d !== undefined)
		expect(durations).toContain(1)
		expect(durations).toContain(2)
		await writer.close()
	})

	it("sibling rewrite via temp+rename heals through the inode-change path", async () => {
		const { recorder, writer, events, errors, file } = await setup()
		record(recorder, 1)
		await writer.round()
		const raw = await fs.readFile(file, "utf8")
		const temp = `${file}.tmp-sibling`
		await fs.writeFile(temp, raw, "utf8")
		await fs.rename(temp, file)

		record(recorder, 2)
		await writer.round()
		expect(events().length).toBe(1)
		expect(events()[0]).toContain("replaced externally (inode change)")
		expect(errors()).toBe(1)

		record(recorder, 3)
		await writer.round()
		expect(errors()).toBe(1) // no repeat alarm after reopen+rebase
		const lines = (await fs.readFile(file, "utf8"))
			.trim()
			.split("\n")
			.map((l) => JSON.parse(l) as { data: { duration_ms: number } })
		const durations = lines.map((l) => l.data.duration_ms)
		expect(durations).toContain(2)
		expect(durations).toContain(3)
		await writer.close()
	})

	it("pads a torn tail with LF on open so the first append never glues onto it", async () => {
		const { file } = await setup()
		await fs.appendFile(file, '{"schema_version":"1.0","torn', "utf8")
		const sizeBefore = (await fs.stat(file)).size
		const { recorder, writer } = await setup()
		record(recorder, 1)
		await writer.round()
		const raw = await fs.readFile(file, "utf8")
		expect(raw.length).toBeGreaterThan(sizeBefore)
		const lines = raw.split("\n").filter((l) => l.trim())
		const parsed = lines.filter((l) => {
			try {
				JSON.parse(l)
				return true
			} catch {
				return false
			}
		})
		expect(parsed.length).toBe(lines.length - 1) // exactly one torn fragment
		await writer.close()
	})

	it("counts a whole-file deletion as a write error with the lost byte count", async () => {
		const { recorder, writer, events, errors, file } = await setup()
		record(recorder, 1)
		await writer.round()
		expect((await fs.stat(file)).size).toBeGreaterThan(0)

		await fs.unlink(file)
		record(recorder, 2)
		await writer.round()
		expect(errors()).toBe(1)
		expect(events().length).toBe(1)
		expect(events()[0]).toContain("deleted externally")

		// Writer recreates and keeps appending from the fresh file.
		record(recorder, 3)
		await writer.round()
		expect(errors()).toBe(1) // no repeat alarm after rebaseline
		const lines = (await fs.readFile(file, "utf8")).trim().split("\n")
		const durations = lines.map((l) => JSON.parse(l).data.duration_ms as number)
		expect(durations).toContain(2)
		expect(durations).toContain(3)
		expect(durations).not.toContain(1) // the deleted fact is gone and accounted
		await writer.close()
	})
})

describe("availability 30s slicing with periodic ticks", () => {
	it("a steady visible session slices on tick cadence even without state changes", () => {
		vi.useFakeTimers()
		vi.setSystemTime(1789862400000)
		const facts: Fact[] = []
		const service = {
			record: (draft: { name: string; kind: string; channel: string; data: Record<string, unknown> }) => {
				facts.push({ name: draft.name, data: draft.data } as Fact)
			},
		} as unknown as StabilityService
		const availability = new Availability(service)
		const tick = () => availability.update(true, true, "ready", Date.now(), performance.now())

		tick()
		vi.advanceTimersByTime(31_000)
		vi.setSystemTime(Date.now() + 31_000)
		tick()
		vi.setSystemTime(Date.now() + 31_000)
		tick()

		const intervals = facts.filter((f) => f.name === "availability")
		// Three ticks → two closed slices (the third interval stays open).
		expect(intervals.length).toBe(2)
		expect(intervals.every((f) => f.data.state === "ready")).toBe(true)
	})
})
