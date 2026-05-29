import * as vscode from "vscode"
import type { Mode } from "../../../../shared/modes"
import { toRelativePath } from "../../../../utils/path"
import { getWorkingState } from "../../../../utils/git"
import { supportPrompt } from "../../../../shared/support-prompt"
import { t } from "../../../../i18n"

// ─── Workspace / path helpers ────────────────────────────────────────

/**
 * Resolve a workspace folder from an optional file path.
 * Falls back to the first workspace folder if the file is not in any workspace.
 */
export function resolveWorkspaceFolderForPath(filePath: string | undefined): vscode.WorkspaceFolder | undefined {
	if (filePath) {
		const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath))
		if (workspaceFolder) {
			return workspaceFolder
		}
	}
	return vscode.workspace.workspaceFolders?.[0]
}

/**
 * Resolve a workspace folder for a VS Code URI.
 * Falls back to the first workspace folder.
 */
export function resolveWorkspaceFolderForUri(uri: vscode.Uri): vscode.WorkspaceFolder | undefined {
	return vscode.workspace.getWorkspaceFolder(uri) ?? vscode.workspace.workspaceFolders?.[0]
}

/**
 * Resolve a cwd (workspace root path in Posix) from an optional file path.
 */
// ─── Selected code params ────────────────────────────────────────────

export interface SelectedCodeParams {
	filePath: string
	startLine: string
	endLine: string
	selectedText: string
}

/**
 * Build selected-code review parameters from the active text editor and a cwd.
 */
export function getSelectedCodeParams(editor: vscode.TextEditor, cwd: string): SelectedCodeParams {
	const fileUri = editor.document.uri
	const range = editor.selection
	return {
		filePath: toRelativePath(fileUri.fsPath.toPosix(), cwd),
		startLine: (range.start.line + 1).toString(),
		endLine: (range.end.line + 1).toString(),
		selectedText: editor.document.getText(range),
	}
}

/**
 * Build the "ADD_TO_CONTEXT" prompt text for selected code review (used by cloud path).
 */
export function buildSelectedCodePrompt(params: SelectedCodeParams): string {
	return supportPrompt.create("ADD_TO_CONTEXT", {
		filePath: params.filePath,
		endLine: params.endLine,
		startLine: params.startLine,
		selectedText: params.selectedText,
	})
}

/**
 * Build the classic-style file:line-range argument string for selected code.
 */
export function buildSelectedCodeArgs(params: SelectedCodeParams): string {
	return `@/${params.filePath}:${params.startLine}-${params.endLine}`
}

// ─── File list args ──────────────────────────────────────────────────

/**
 * Build a space-separated list of @/-prefixed relative file paths from absolute paths.
 * Each path is resolved against its own workspace folder so that multi-workspace
 * selections produce correct relative paths.
 */
export function buildFileListArgs(paths: readonly string[]): string {
	return paths
		.map((p) => {
			const uri = vscode.Uri.file(p)
			const folder = vscode.workspace.getWorkspaceFolder(uri)
			const cwd = folder?.uri.fsPath ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
			const relative = cwd ? toRelativePath(p.toPosix(), cwd.toPosix()) : p.toPosix()
			return `@/${relative}`
		})
		.join(" ")
}

// ─── Git changes ─────────────────────────────────────────────────────

/**
 * Fetch the git working state for a given cwd and wrap it for inclusion in a review prompt.
 */
export async function resolveGitChangesContent(cwd: string): Promise<string> {
	try {
		const workingState = await getWorkingState(cwd)
		return `Working directory changes (see below for details)\n\n<git_working_state>\n${workingState}\n</git_working_state>`
	} catch (error) {
		const errorMsg = error instanceof Error ? error.message : String(error)
		return `Working directory changes (see below for details)\n\n<git_working_state>\nError fetching working state: ${errorMsg}\n</git_working_state>`
	}
}

// ─── Cloud labels ─────────────────────────────────────────────────────

/** Map of review mode to the slash command prefix used in chat (includes trailing space). */
const SLASH_COMMAND_PREFIX_MAP: Record<string, string> = {
	review: "/review ",
	"security-review": "/security-review ",
}

/**
 * Get the slash command prefix (with trailing space) for a given review mode.
 * Falls back to "/review " for unknown modes.
 */
export function getSlashCommandPrefix(mode: Mode): string {
	return SLASH_COMMAND_PREFIX_MAP[mode] ?? "/review "
}

/**
 * Get the preview label prefix for a given review mode.
 */
export function getPreviewLabel(mode: Mode): string {
	return mode === "security-review" ? "Security Review: " : "Code Review: "
}

// ─── Auto-execute message ────────────────────────────────────────────

/**
 * Get the auto-execute confirmation message for security review mode.
 */
export function getSecurityReviewAutoExecuteMessage(): string {
	return t("common:review.tip.auto_execute_with_default_config")
}
