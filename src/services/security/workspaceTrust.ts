// npx vitest services/security/workspaceTrust.spec.ts

import * as vscode from "vscode"
import { createHash } from "node:crypto"
import * as fs from "fs"
import path from "path"
import { isJetbrainsPlatform } from "../../utils/platform"
import { t } from "../../i18n"

/**
 * Workspace Trust Service (IDE-agnostic).
 *
 * Closes the "untrusted project content -> host execution" boundary reported in
 * SRC-2026-4977 (project `.roo/mcp.json` auto-starting local processes) and
 * SRC-2026-4978 (`.roo/tools/*.js` being dynamically imported) by requiring an
 * explicit, persisted user approval before:
 *   - starting a project-scoped stdio MCP server, and
 *   - loading a project's custom tools.
 *
 * Two layers:
 *   L0 `isRestrictedMode()` — VS Code native Workspace Trust fast-path. JetBrains
 *      has no equivalent signal (`vscode.workspace.isTrusted` is not implemented
 *      by the compatibility shim), so it always reports false there and we rely
 *      on L1 instead.
 *   L1 `ensure*Approved()` — first-run modal confirmation persisted per workspace
 *      + per-command fingerprint. A trusted workspace that later receives a new
 *      or modified server re-triggers the prompt because the stored fingerprint
 *      no longer matches.
 *
 * Global MCP servers (user-configured in settings) and SSE/HTTP project servers
 * are intentionally NOT gated — they do not spawn local processes from project
 * content.
 */

const STORAGE_KEY = "costrict.workspaceTrust"

export type McpCommandDescriptor = {
	command: string
	args?: string[]
	cwd?: string
}

type WorkspaceRecord = {
	path: string
	approvedAt: number
	/** serverName -> commandFingerprint */
	mcp: Record<string, string>
	customToolsApproved: boolean
}

export type TrustStore = {
	workspaces: Record<string, WorkspaceRecord>
}

export function workspaceFingerprint(cwd: string): string {
	return createHash("sha256").update(cwd).digest("hex").slice(0, 16)
}

export function commandFingerprint(desc: McpCommandDescriptor): string {
	const raw = `${desc.command} ${(desc.args ?? []).join(" ")} ${desc.cwd ?? ""}`
	return createHash("sha256").update(raw).digest("hex").slice(0, 16)
}

const TOOL_EXTENSIONS = new Set([".js", ".mjs", ".ts"])

/**
 * List custom-tool source files (.js/.mjs/.ts) under the given `.roo/tools`
 * directories. Used to show the user exactly which project files would be
 * dynamically imported (and thus executed) before requesting approval.
 */
export async function listCustomToolFiles(dirs: (string | undefined | null)[] | undefined | null): Promise<string[]> {
	if (!dirs) return []
	const files: string[] = []
	for (const dir of dirs) {
		if (!dir) continue
		let entries: string[]
		try {
			entries = await fs.promises.readdir(dir)
		} catch {
			continue
		}
		for (const entry of entries) {
			if (TOOL_EXTENSIONS.has(path.extname(entry).toLowerCase())) {
				files.push(path.join(dir, entry))
			}
		}
	}
	return files
}

/** Pure decision: is the given MCP server already approved in this store? */
export function isMcpServerApprovedInStore(
	store: TrustStore,
	cwd: string,
	name: string,
	desc: McpCommandDescriptor,
): boolean {
	const ws = store.workspaces[workspaceFingerprint(cwd)]
	if (!ws) return false
	return ws.mcp[name] === commandFingerprint(desc)
}

/** Pure decision: are custom tools for this workspace already approved? */
export function isCustomToolsApprovedInStore(store: TrustStore, cwd: string): boolean {
	const ws = store.workspaces[workspaceFingerprint(cwd)]
	return !!ws?.customToolsApproved
}

function emptyStore(): TrustStore {
	return { workspaces: {} }
}

function normalizeStore(raw: unknown): TrustStore {
	if (!raw || typeof raw !== "object") return emptyStore()
	const workspaces = (raw as TrustStore).workspaces
	if (!workspaces || typeof workspaces !== "object") return emptyStore()
	return { workspaces: workspaces as Record<string, WorkspaceRecord> }
}

export class WorkspaceTrustService {
	private static instance: WorkspaceTrustService | null = null

	private constructor(private context: vscode.ExtensionContext) {}

	static getInstance(context: vscode.ExtensionContext): WorkspaceTrustService {
		if (!WorkspaceTrustService.instance) {
			WorkspaceTrustService.instance = new WorkspaceTrustService(context)
		}
		return WorkspaceTrustService.instance
	}

	/** @internal test-only: construct with an explicit context. */
	static forTesting(context: vscode.ExtensionContext): WorkspaceTrustService {
		WorkspaceTrustService.instance = null
		return new WorkspaceTrustService(context)
	}

	/**
	 * L0: VS Code native Workspace Trust fast-path.
	 * Returns true only when the host explicitly reports the workspace as
	 * untrusted. Always false on JetBrains (no native signal; L1 handles it).
	 */
	isRestrictedMode(): boolean {
		if (isJetbrainsPlatform()) return false
		return vscode.workspace.isTrusted === false
	}

	private async readStore(): Promise<TrustStore> {
		return normalizeStore(this.context.globalState.get(STORAGE_KEY))
	}

	private async writeStore(store: TrustStore): Promise<void> {
		await this.context.globalState.update(STORAGE_KEY, store)
	}

	/**
	 * L1: ensure a project-scoped stdio MCP server is approved before launch.
	 * Prompts (showing the exact command/args) on first run or when the command
	 * fingerprint changed. Returns false in restricted mode or on user decline.
	 */
	async ensureMcpServerApproved(cwd: string, name: string, desc: McpCommandDescriptor): Promise<boolean> {
		if (this.isRestrictedMode()) return false

		const store = await this.readStore()
		if (isMcpServerApprovedInStore(store, cwd, name, desc)) return true

		const approved = await this.prompt(
			t("mcp:security.project_mcp_prompt", {
				serverName: name,
				command: desc.command,
				args: (desc.args ?? []).join(" "),
			}),
		)
		if (!approved) return false

		const fp = workspaceFingerprint(cwd)
		const ws = store.workspaces[fp] ?? {
			path: cwd,
			approvedAt: Date.now(),
			mcp: {},
			customToolsApproved: false,
		}
		ws.mcp[name] = commandFingerprint(desc)
		store.workspaces[fp] = ws
		await this.writeStore(store)
		return true
	}

	/**
	 * L1: ensure a project's custom tools are approved before loading (which
	 * executes module top-level code via dynamic import).
	 */
	async ensureCustomToolsApproved(cwd: string, files: string[]): Promise<boolean> {
		if (this.isRestrictedMode()) return false
		// Nothing to execute -> nothing to gate.
		if (!files || files.length === 0) return true

		const store = await this.readStore()
		if (isCustomToolsApprovedInStore(store, cwd)) return true

		const approved = await this.prompt(
			t("mcp:security.custom_tools_prompt", {
				files: files.join("\n"),
			}),
		)
		if (!approved) return false

		const fp = workspaceFingerprint(cwd)
		const ws = store.workspaces[fp] ?? {
			path: cwd,
			approvedAt: Date.now(),
			mcp: {},
			customToolsApproved: false,
		}
		ws.customToolsApproved = true
		store.workspaces[fp] = ws
		await this.writeStore(store)
		return true
	}

	/** Remove all approvals for a workspace (reserved for future UI). */
	async revokeWorkspace(cwd: string): Promise<void> {
		const store = await this.readStore()
		delete store.workspaces[workspaceFingerprint(cwd)]
		await this.writeStore(store)
	}

	private async prompt(message: string): Promise<boolean> {
		const answer = await vscode.window.showInformationMessage(message, { modal: true }, t("common:answers.yes"))
		return answer === t("common:answers.yes")
	}
}
