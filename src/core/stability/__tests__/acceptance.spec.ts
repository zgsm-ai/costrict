/**
 * G1-local acceptance (design §9): drives the REAL pipeline against a REAL
 * temporary telemetry home and asserts the on-disk contract end to end —
 * fail-open activation, NDJSON shape, seq monotonicity per channel,
 * revocation stopping collection without a fabricated shutdown, epoch
 * retirement dropping facts at the write gate, webview bridge rejecting
 * untrusted input. Emits a machine-readable results object consumed by
 * scripts/stability-acceptance.mjs to freeze evidence.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { promises as fs } from "fs"
import os from "os"
import path from "path"
import { fixedClock } from "../clock"
import { StabilityService } from "../service"
import { emitDictionarySweep } from "../selftest"
import { receiveStabilityFacts } from "../webview-bridge"
import type { Fact } from "../fact"

const home = process.env.STABILITY_ACCEPTANCE_HOME ?? path.join(os.tmpdir(), `stability-acceptance-${Date.now()}`)
const clock = fixedClock(1789862400000)
const store = {
	data: new Map<string, string>(),
	get(k: string) {
		return this.data.get(k)
	},
	set(k: string, v: string) {
		this.data.set(k, v)
	},
}
const service = new StabilityService({
	home,
	store: store as never,
	pluginVersion: "acceptance",
	ideBuild: "1.102",
	test: true,
	clock,
})

export const results: { scenario: string; ok: boolean; detail: string }[] = []
const check = (scenario: string, ok: boolean, detail: string) => {
	results.push({ scenario, ok, detail })
	expect(ok, `${scenario}: ${detail}`).toBe(true)
}

let outFile = ""

beforeAll(async () => {
	await fs.rm(home, { recursive: true, force: true })
	service.start()
	await service.ready()
})

afterAll(async () => {
	await service.stop("app_close")
	await fs.rm(home, { recursive: true, force: true })
	const evidence = process.env.STABILITY_EVIDENCE
	if (evidence) {
		const lines = [
			"# VS Code 稳定性采集验收证据（G1-local）",
			"",
			"- 日期：" + new Date().toISOString(),
			"- 分支：cloud-ui-mode-stability-dev",
			"- 场景基线：docs/vscode-stability-design.md §9（G1）",
			"- 协议：kilocode 修订版（单文件追加 outbox、无锁、fail-open、位移即确认）",
			"",
			"| 场景 | 结果 | 说明 |",
			"|---|---|---|",
			...results.map((r) => `| ${r.scenario} | ${r.ok ? "✅" : "❌"} | ${r.detail} |`),
			"",
			`共 ${results.length} 项检查，全部通过：${results.every((r) => r.ok)}`,
			"",
			"局限：本证据覆盖插件侧本地链路（采集→准入→落盘→清理语义），cs-cloud 消费器、双出口与端到端上报归 G4 联调（阶段 0 契约门见 contract.json）。",
			"",
		]
		await fs.mkdir(path.dirname(evidence), { recursive: true })
		await fs.writeFile(evidence, lines.join("\n"), "utf8")
	}
})

const readFacts = async (): Promise<Fact[]> => {
	const entries = await fs.readdir(path.join(home, "outbox"))
	const file = entries.find((e) => e.endsWith(".jsonl"))
	if (!file) return []
	outFile = file
	const raw = await fs.readFile(path.join(home, "outbox", file), "utf8")
	if (!raw.endsWith("\n")) return []
	return raw
		.slice(0, -1)
		.split("\n")
		.map((line) => JSON.parse(line) as Fact)
}

describe("acceptance G1-local", () => {
	it("fail-open: activates and writes plugin.started without a control file", async () => {
		await service.drain()
		const facts = await readFacts()
		check(
			"fail-open-started",
			facts.some((f) => f.name === "plugin.started"),
			"plugin.started on disk",
		)
		check(
			"wire-source",
			facts.every((f) => f.source === "vscode-plugin"),
			"source stamped",
		)
		check(
			"wire-mode",
			facts.every((f) => f.mode === "monolith" && f.connection_provider === "cs-cloud"),
			"mode/provider constants",
		)
	})

	it("dictionary sweep: every non-singleton name queues and lands on disk", async () => {
		const sweep = emitDictionarySweep(service)
		await service.drain()
		const facts = await readFacts()
		const names = new Set(facts.map((f) => f.name))
		check(
			"sweep-queued",
			sweep.queued === sweep.attempted && sweep.dropped === 0,
			`${sweep.queued}/${sweep.attempted} queued`,
		)
		check(
			"sweep-marked",
			facts.filter((f) => f.context?.workspace_id === "ws-selftest").length >= sweep.attempted,
			"ws-selftest marker present",
		)
		check(
			"sweep-names",
			names.has("webview.stall") && names.has("render.apply") && names.has("resource.snapshot"),
			"sample names covered",
		)
	})

	it("NDJSON contract: LF-terminated lines, per-channel seq monotonic", async () => {
		const raw = await fs.readFile(path.join(home, "outbox", outFile), "utf8")
		check("ndjson-lf", raw.endsWith("\n") && !raw.includes("\r"), "LF terminated, no CR")
		const facts = await readFacts()
		const perChannel = new Map<string, number>()
		let monotonic = true
		for (const fact of facts) {
			const last = perChannel.get(fact.channel) ?? 0
			if (fact.seq <= last) monotonic = false
			perChannel.set(fact.channel, fact.seq)
		}
		check(
			"seq-monotonic",
			monotonic,
			`critical→${perChannel.get("critical")}, diagnostic→${perChannel.get("diagnostic")}`,
		)
		check(
			"context-closed",
			facts.every(
				(f) =>
					!f.context ||
					Object.keys(f.context).every((k) =>
						["operation_id", "attempt_id", "fault_id", "trace_id", "workspace_id"].includes(k),
					),
			),
			"context closed set",
		)
	})

	it("webview bridge: untrusted drafts validated, valid ones recorded side=webview", async () => {
		const before = (await readFacts()).length
		const outcome = receiveStabilityFacts(service, {
			type: "stabilityFacts",
			facts: [
				{
					name: "action",
					kind: "operation",
					data: { phase: "end", action: "stop", result: "success", duration_ms: 3 },
					t_wall: 1789862401000,
				},
				{
					name: "action",
					kind: "operation",
					data: { phase: "end", action: "stop", result: "win", duration_ms: 3 },
				},
				{ name: "nope", kind: "operation", data: {} },
			],
			dropped: 1,
		})
		await service.drain()
		const facts = await readFacts()
		const webview = facts.filter((f) => f.side === "webview")
		check("bridge-accept", outcome.accepted === 1 && webview.length === 1, "one valid draft accepted")
		check("bridge-reject", outcome.rejected === 2, "vocab violation and unknown name rejected")
		check("bridge-overflow", service.healthCounts?.webviewBufferFull === 1, "overflow counted")
		check("bridge-timestamp", webview[0]?.timestamp === 1789862401000, "t_wall becomes the fact timestamp")
		check("bridge-count", facts.length === before + 1, "exactly one fact added")
	})

	it("revocation: explicit policy stops collection without fabricating shutdown", async () => {
		const controlPath = path.join(home, "control", "vscode.json")
		await fs.mkdir(path.dirname(controlPath), { recursive: true })
		await fs.writeFile(
			controlPath,
			JSON.stringify({
				schema_major: 1,
				revision: 5,
				enabled: false,
				account_epoch: "acct-a",
				account_state: "ready",
				expires_at: Number.MAX_SAFE_INTEGER,
			}),
			"utf8",
		)
		const policy = (service as unknown as { policy: { refresh(): Promise<void> } }).policy
		await policy.refresh()
		await (service as unknown as { activationLoop(): Promise<void> }).activationLoop()
		const status = service.record({
			name: "action",
			kind: "operation",
			channel: "critical",
			data: { phase: "end", action: "stop", result: "success", duration_ms: 1 },
		})
		check("revoke-stops", status === "disabled", `post-revoke record ${status}`)
		check(
			"revoke-coverage",
			service.getCoverage().mode === "standby" && service.getCoverage().reason === "policy_revoked",
			"coverage standby",
		)
	})

	it("epoch retirement: facts of a retired epoch drop at the write gate", async () => {
		// Re-enable with a NEW epoch — the old acct-a retires permanently.
		const controlPath = path.join(home, "control", "vscode.json")
		await fs.writeFile(
			controlPath,
			JSON.stringify({
				schema_major: 1,
				revision: 6,
				enabled: true,
				metrics_enabled: true,
				logs_enabled: true,
				account_epoch: "acct-b",
				account_state: "ready",
				expires_at: Number.MAX_SAFE_INTEGER,
			}),
			"utf8",
		)
		const policy = (service as unknown as { policy: { refresh(): Promise<void>; isRetired(e: string): boolean } })
			.policy
		await policy.refresh()
		await (service as unknown as { activationLoop(): Promise<void> }).activationLoop()
		check("epoch-retired", policy.isRetired("acct-a"), "acct-a retired")
		// A fact stamped with the retired epoch is dropped at the write gate.
		const queued = service.record({
			name: "action",
			kind: "operation",
			channel: "critical",
			epoch: "acct-a",
			data: { phase: "end", action: "stop", result: "success", duration_ms: 1 },
		})
		await service.drain()
		const facts = await readFacts()
		check(
			"epoch-dropped",
			queued === "queued" && !facts.some((f) => f.account_epoch === "acct-a" && f.name === "action"),
			"retired-epoch fact never written",
		)
	})

	it("lifecycle: stop records shutdown for the active run; runs stay isolated", async () => {
		await service.stop("app_close")
		const facts = await readFacts()
		check(
			"shutdown-recorded",
			facts.some((f) => f.name === "plugin.shutdown" && f.data.end_kind === "app_close"),
			"shutdown on disk",
		)
		const startedRuns = facts.filter((f) => f.name === "plugin.started").map((f) => f.run_id)
		const shutdown = facts.find((f) => f.name === "plugin.shutdown")
		check(
			"shutdown-binds-active-run",
			shutdown !== undefined && startedRuns[startedRuns.length - 1] === shutdown.run_id,
			"shutdown belongs to the latest started run",
		)
		check("runs-bounded", startedRuns.length <= 2, `runs after revoke/reactivate: ${startedRuns.length}`)
		check("single-producer", new Set(facts.map((f) => f.producer_id)).size === 1, "one producer_id")
		const seqs = facts.filter((f) => f.channel === "critical").map((f) => `${f.run_id}:${f.seq}`)
		check("no-duplicate-seq", new Set(seqs).size === seqs.length, "unique (run, seq) pairs")
	})
})
