#!/usr/bin/env node
/**
 * Stability acceptance runner (design §9 G4): drives the G1-local acceptance
 * spec against a fresh temporary telemetry home and freezes the evidence
 * document at docs/vscode-stability-evidence.md.
 *
 * Usage: node scripts/stability-acceptance.mjs [--keep]
 */
import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const keep = process.argv.includes("--keep")
const home = mkdtempSync(path.join(os.tmpdir(), "stability-acceptance-"))
const evidence = path.join(root, "docs", "stability", "vscode-stability-evidence.md")

const env = {
	...process.env,
	STABILITY_ACCEPTANCE_HOME: home,
	STABILITY_EVIDENCE: evidence,
}

const vitest = process.platform === "win32" ? "vitest.cmd" : "vitest"
const bin = [
	path.join(root, "src", "node_modules", ".bin", vitest),
	path.join(root, "node_modules", ".bin", vitest),
].find((candidate) => {
	try {
		spawnSync(candidate, ["--version"], { stdio: "ignore" })
		return true
	} catch {
		return false
	}
})

if (!bin) {
	console.error("vitest binary not found")
	process.exit(1)
}

const run = spawnSync(bin, ["run", "core/stability/__tests__/acceptance.spec.ts"], {
	cwd: path.join(root, "src"),
	env,
	stdio: "inherit",
})

if (!keep) rmSync(home, { recursive: true, force: true })
process.exit(run.status ?? 1)
