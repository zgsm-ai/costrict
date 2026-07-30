import * as vscode from "vscode"
import * as path from "path"

/**
 * Checks if a file path is outside all workspace folders
 * @param filePath The file path to check
 * @returns true if the path is outside all workspace folders, false otherwise
 */
export function isPathOutsideWorkspace(filePath: string): boolean {
	// If there are no workspace folders, consider everything outside workspace for safety
	if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
		return true
	}

	// Normalize and resolve the path to handle .. and . components correctly
	const absolutePath = path.resolve(filePath)

	// Check if the path is within any workspace folder
	return !vscode.workspace.workspaceFolders.some((folder) => {
		const folderPath = folder.uri.fsPath
		// Path is inside a workspace if it equals the workspace path or is a subfolder
		return absolutePath === folderPath || absolutePath.startsWith(folderPath + path.sep)
	})
}

/**
 * Checks whether `filePath` resolves to `baseDir` itself or a path beneath it.
 *
 * Unlike {@link isPathOutsideWorkspace}, this checks against an arbitrary base
 * directory (e.g. task.cwd or a checkpoint workspace dir) rather than the VS
 * Code workspace folders. Use this for boundary checks where the relevant base
 * is the task's working directory, not the IDE workspace — relying on
 * isPathOutsideWorkspace for such checks is a known source of false positives
 * (CLI mode, custom working dirs) and regressions.
 *
 * @param filePath The path to check (absolute, or relative to cwd).
 * @param baseDir The base directory that filePath must stay within.
 * @returns true if filePath is baseDir or a descendant of it.
 */
export function isPathWithin(filePath: string, baseDir: string): boolean {
	const absolutePath = path.resolve(filePath)
	const base = path.resolve(baseDir)
	return absolutePath === base || absolutePath.startsWith(base + path.sep)
}
