// npx vitest services/security/workspaceTrust.spec.ts

import { describe, it, expect, vi, beforeEach } from "vitest"
import * as vscode from "vscode"
import * as fs from "fs"
import * as os from "os"
import path from "path"

// Mock the platform helper BEFORE importing the module under test so we can
// flip the JetBrains flag per test.
vi.mock("../../utils/platform", () => ({
	isJetbrainsPlatform: () => (globalThis as any).__IS_JETBRAINS as boolean,
}))

// Mock i18n so prompt strings are deterministic and do not require setup.
vi.mock("../../i18n", () => ({
	t: (key: string, opts?: Record<string, unknown>) => {
		if (key === "common:answers.yes") return "Yes"
		return opts ? `${key}:${JSON.stringify(opts)}` : key
	},
}))

import {
	workspaceFingerprint,
	commandFingerprint,
	isMcpServerApprovedInStore,
	isCustomToolsApprovedInStore,
	listCustomToolFiles,
	WorkspaceTrustService,
	type TrustStore,
} from "./workspaceTrust"

const STORAGE_KEY = "costrict.workspaceTrust"

const makeFakeContext = (stored?: unknown) => {
	const state: Record<string, unknown> = stored ? { [STORAGE_KEY]: stored } : {}
	return {
		globalState: {
			get: (k: string) => state[k],
			update: (k: string, v: unknown) => {
				state[k] = v
				return Promise.resolve()
			},
		},
	}
}

beforeEach(() => {
	;(globalThis as any).__IS_JETBRAINS = false
	;(vscode.workspace as any).isTrusted = undefined
})

describe("fingerprints", () => {
	it("workspaceFingerprint is stable for the same cwd", () => {
		expect(workspaceFingerprint("/a/b")).toBe(workspaceFingerprint("/a/b"))
		expect(workspaceFingerprint("/a/b")).not.toBe(workspaceFingerprint("/a/c"))
	})

	it("commandFingerprint changes when command, args, or cwd change", () => {
		const base = commandFingerprint({ command: "calc.exe", args: [], cwd: "/p" })
		expect(base).toBe(commandFingerprint({ command: "calc.exe", args: [], cwd: "/p" }))
		expect(base).not.toBe(commandFingerprint({ command: "other.exe", args: [], cwd: "/p" }))
		expect(base).not.toBe(commandFingerprint({ command: "calc.exe", args: ["--x"], cwd: "/p" }))
		expect(base).not.toBe(commandFingerprint({ command: "calc.exe", args: [], cwd: "/q" }))
	})
})

describe("isMcpServerApprovedInStore (pure decision)", () => {
	const cwd = "/proj"
	const fp = workspaceFingerprint(cwd)
	const desc = { command: "calc.exe", args: ["-a"], cwd }

	it("returns false for an unknown workspace", () => {
		expect(isMcpServerApprovedInStore({ workspaces: {} }, cwd, "srv", desc)).toBe(false)
	})

	it("returns true when the stored fingerprint matches", () => {
		const store: TrustStore = {
			workspaces: {
				[fp]: { path: cwd, approvedAt: 1, mcp: { srv: commandFingerprint(desc) }, customToolsApproved: false },
			},
		}
		expect(isMcpServerApprovedInStore(store, cwd, "srv", desc)).toBe(true)
	})

	it("returns false when the command changed (PoC: malicious server injected into trusted project)", () => {
		const store: TrustStore = {
			workspaces: {
				[fp]: { path: cwd, approvedAt: 1, mcp: { srv: commandFingerprint(desc) }, customToolsApproved: false },
			},
		}
		const tampered = { command: "evil.exe", args: [], cwd }
		expect(isMcpServerApprovedInStore(store, cwd, "srv", tampered)).toBe(false)
		expect(isMcpServerApprovedInStore(store, cwd, "other-srv", desc)).toBe(false)
	})
})

describe("isCustomToolsApprovedInStore (pure decision)", () => {
	const cwd = "/proj"
	const fp = workspaceFingerprint(cwd)

	it("returns false when not approved, true when approved", () => {
		expect(isCustomToolsApprovedInStore({ workspaces: {} }, cwd)).toBe(false)
		const store: TrustStore = {
			workspaces: { [fp]: { path: cwd, approvedAt: 1, mcp: {}, customToolsApproved: true } },
		}
		expect(isCustomToolsApprovedInStore(store, cwd)).toBe(true)
	})
})

describe("listCustomToolFiles", () => {
	it("lists .js/.mjs/.ts files and skips others", async () => {
		const dir = await makeTmpToolDir(["a.js", "b.mjs", "c.ts", "readme.md", "ignore.txt"])
		const files = (await listCustomToolFiles([dir])).sort()
		expect(files).toEqual([`${dir}/a.js`, `${dir}/b.mjs`, `${dir}/c.ts`].sort())
	})

	it("ignores missing directories", async () => {
		const files = await listCustomToolFiles(["/no/such/dir", undefined, null])
		expect(files).toEqual([])
	})
})

describe("WorkspaceTrustService", () => {
	it("isRestrictedMode() reflects vscode.workspace.isTrusted on VS Code", () => {
		const svc = WorkspaceTrustService.forTesting(makeFakeContext() as any)
		;(vscode.workspace as any).isTrusted = false
		expect(svc.isRestrictedMode()).toBe(true)
		;(vscode.workspace as any).isTrusted = true
		expect(svc.isRestrictedMode()).toBe(false)
	})

	it("isRestrictedMode() is always false on JetBrains", () => {
		;(globalThis as any).__IS_JETBRAINS = true
		;(vscode.workspace as any).isTrusted = false
		const svc = WorkspaceTrustService.forTesting(makeFakeContext() as any)
		expect(svc.isRestrictedMode()).toBe(false)
	})

	it("ensureMcpServerApproved: blocked in restricted mode, prompts otherwise, persists approval", async () => {
		const ctx = makeFakeContext()

		// Restricted -> blocked without prompt.
		;(vscode.workspace as any).isTrusted = false
		let svc = WorkspaceTrustService.forTesting(ctx as any)
		vscode.window.showInformationMessage = vi.fn() as any
		expect(await svc.ensureMcpServerApproved("/p", "s", { command: "c", args: [], cwd: "/p" })).toBe(false)
		expect(vscode.window.showInformationMessage).not.toHaveBeenCalled()

		// Trusted, user declines -> false, nothing persisted.
		;(vscode.workspace as any).isTrusted = true
		svc = WorkspaceTrustService.forTesting(ctx as any)
		;(vscode.window.showInformationMessage as any).mockResolvedValue(undefined)
		expect(await svc.ensureMcpServerApproved("/p", "s", { command: "c", args: [], cwd: "/p" })).toBe(false)

		// Trusted, user approves -> true, persisted; second call is silent.
		svc = WorkspaceTrustService.forTesting(ctx as any)
		;(vscode.window.showInformationMessage as any).mockResolvedValue("Yes")
		expect(await svc.ensureMcpServerApproved("/p", "s", { command: "c", args: [], cwd: "/p" })).toBe(true)
		;(vscode.window.showInformationMessage as any).mockClear()
		expect(await svc.ensureMcpServerApproved("/p", "s", { command: "c", args: [], cwd: "/p" })).toBe(true)
		expect(vscode.window.showInformationMessage).not.toHaveBeenCalled()

		// Tampered command re-prompts.
		;(vscode.window.showInformationMessage as any).mockResolvedValue(undefined)
		expect(await svc.ensureMcpServerApproved("/p", "s", { command: "evil", args: [], cwd: "/p" })).toBe(false)
		expect(vscode.window.showInformationMessage).toHaveBeenCalled()
	})

	it("ensureCustomToolsApproved: empty file list short-circuits to true", async () => {
		;(vscode.workspace as any).isTrusted = true
		const svc = WorkspaceTrustService.forTesting(makeFakeContext() as any)
		vscode.window.showInformationMessage = vi.fn() as any
		expect(await svc.ensureCustomToolsApproved("/p", [])).toBe(true)
		expect(vscode.window.showInformationMessage).not.toHaveBeenCalled()
	})
})

async function makeTmpToolDir(files: string[]): Promise<string> {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wt-"))
	for (const f of files) fs.writeFileSync(path.join(dir, f), "")
	return dir
}
