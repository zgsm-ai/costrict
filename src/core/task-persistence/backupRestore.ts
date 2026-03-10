import { execFile } from "child_process"
import * as fs from "fs/promises"
import * as os from "os"
import * as path from "path"
import { promisify } from "util"

import type { HistoryItem } from "@roo-code/types"

import { GlobalFileNames } from "../../shared/globalFileNames"
import { safeWriteJson } from "../../utils/safeWriteJson"

const execFileAsync = promisify(execFile)

/** Timeout for system tool invocations (5 minutes). */
const EXEC_TIMEOUT_MS = 5 * 60 * 1000

/**
 * Result returned by restoreTasksBackup describing what happened during restore.
 */
export interface RestoreResult {
	/** Number of task directories successfully imported from the backup. */
	imported: number
	/** Number of tasks skipped because they already existed (conflict='skip'). */
	skipped: number
	/** Number of tasks overwritten (conflict='overwrite'). */
	overwritten: number
	/** Per-task error messages for tasks that failed to import (non-fatal). */
	errors: string[]
}

/**
 * Internal index format matching TaskHistoryStore's HistoryIndex.
 */
interface HistoryIndex {
	version: number
	updatedAt: number
	entries: HistoryItem[]
}

// ─────────────────────────── Platform helpers ───────────────────────────

const isWindows = process.platform === "win32"

/**
 * Run a system command in a child process with a 5-minute timeout.
 * Throws if the command exits with a non-zero code.
 */
async function runSystemCommand(cmd: string, args: string[], cwd?: string): Promise<void> {
	await execFileAsync(cmd, args, {
		timeout: EXEC_TIMEOUT_MS,
		cwd,
		// Windows needs shell for built-in commands
		windowsHide: true,
	})
}

/**
 * Create a gzip-compressed tar archive of the tasks directory.
 * - Linux/macOS: uses `tar -czf`
 * - Windows: uses PowerShell `Compress-Archive` (produces zip), falling back to
 *   the Windows built-in `tar.exe` available since Windows 10 1803.
 */
async function archiveTasks(basePath: string, destPath: string): Promise<void> {
	if (isWindows) {
		// Windows 10 1803+ ships tar.exe; try it first.
		try {
			await runSystemCommand("tar", ["-czf", destPath, "-C", basePath, "tasks"])
		} catch {
			// Fall back to PowerShell Compress-Archive (produces .zip, not .tar.gz)
			const srcGlob = path.join(basePath, "tasks")
			await runSystemCommand("powershell", [
				"-NoProfile",
				"-NonInteractive",
				"-Command",
				`Compress-Archive -Path '${srcGlob}' -DestinationPath '${destPath}' -Force`,
			])
		}
	} else {
		await runSystemCommand("tar", ["-czf", destPath, "-C", basePath, "tasks"])
	}
}

/**
 * Extract an archive into a target directory.
 * Supports .tar.gz and .zip (Windows fallback).
 */
async function extractArchive(srcPath: string, destDir: string): Promise<void> {
	if (isWindows && srcPath.toLowerCase().endsWith(".zip")) {
		await runSystemCommand("powershell", [
			"-NoProfile",
			"-NonInteractive",
			"-Command",
			`Expand-Archive -Path '${srcPath}' -DestinationPath '${destDir}' -Force`,
		])
	} else {
		await runSystemCommand("tar", ["-xzf", srcPath, "-C", destDir])
	}
}

/**
 * Copy a directory tree recursively using a system tool.
 * - Linux/macOS: `cp -r`
 * - Windows: `xcopy /E /I /Y`
 */
async function copyDirectorySystem(src: string, dest: string): Promise<void> {
	if (isWindows) {
		// xcopy requires the destination to exist
		await fs.mkdir(dest, { recursive: true })
		await runSystemCommand("xcopy", [src, dest, "/E", "/I", "/Y", "/Q"])
	} else {
		// cp -r src dest  →  copies src INTO dest if dest exists, so use src/. trick
		// to copy contents. We actually want to copy the whole src dir as dest.
		const parentDest = path.dirname(dest)
		await fs.mkdir(parentDest, { recursive: true })
		await runSystemCommand("cp", ["-r", src, dest])
	}
}

// ─────────────────────────── Index helpers ───────────────────────────

/**
 * Read and parse a `_index.json` file. Returns null if missing/corrupt.
 */
async function readIndexFile(indexPath: string): Promise<HistoryIndex | null> {
	try {
		const raw = await fs.readFile(indexPath, "utf8")
		const parsed: HistoryIndex = JSON.parse(raw)
		if (parsed.version === 1 && Array.isArray(parsed.entries)) {
			return parsed
		}
		return null
	} catch {
		return null
	}
}

/**
 * Write a `_index.json` file atomically via safeWriteJson.
 */
async function writeIndexFile(indexPath: string, index: HistoryIndex): Promise<void> {
	await safeWriteJson(indexPath, index)
}

// ─────────────────────────── Public API ───────────────────────────

/**
 * Creates a compressed backup of the entire `tasks/` directory.
 *
 * Uses the system `tar` (Linux/macOS/Windows 10+) or PowerShell
 * `Compress-Archive` (Windows fallback) so that I/O-intensive work is
 * offloaded from the Node.js event loop.
 *
 * @param basePath  The storage base directory (contains `tasks/`).
 * @param destPath  Destination archive path (`.tar.gz` on Unix, `.zip` Windows
 *                  fallback).
 */
export async function createTasksBackup(basePath: string, destPath: string): Promise<void> {
	const tasksDir = path.join(basePath, "tasks")

	// Ensure tasks directory exists before archiving
	try {
		await fs.access(tasksDir)
	} catch {
		throw new Error(`Tasks directory not found: ${tasksDir}`)
	}

	// Ensure destination parent directory exists
	await fs.mkdir(path.dirname(destPath), { recursive: true })

	await archiveTasks(basePath, destPath)
}

/**
 * Restores tasks from a backup archive and **merges** them with existing data.
 *
 * Merge semantics per task directory:
 * - `conflict = 'skip'` (default): if a task directory already exists locally,
 *   skip it and increment `result.skipped`.
 * - `conflict = 'overwrite'`: replace the existing directory with the backup
 *   copy and increment `result.overwritten`.
 *
 * After copying task directories the `_index.json` is rebuilt by merging the
 * backup's entries into the current entries, de-duplicating by task id.
 *
 * @param basePath  The storage base directory (contains `tasks/`).
 * @param srcPath   Path to the archive produced by `createTasksBackup`.
 * @param options   `conflict` resolution strategy (default: `'skip'`).
 * @returns         A `RestoreResult` summary of the operation.
 */
export async function restoreTasksBackup(
	basePath: string,
	srcPath: string,
	options: { conflict?: "skip" | "overwrite" } = {},
): Promise<RestoreResult> {
	const conflict = options.conflict ?? "skip"
	const result: RestoreResult = { imported: 0, skipped: 0, overwritten: 0, errors: [] }

	// 1. Create an isolated temp directory for extraction
	const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "costrict-restore-"))

	try {
		// 2. Extract the archive into the temp directory
		await extractArchive(srcPath, tempDir)

		// 3. Locate the extracted tasks directory
		const extractedTasksDir = path.join(tempDir, "tasks")
		try {
			await fs.access(extractedTasksDir)
		} catch {
			throw new Error("Archive does not contain a 'tasks/' directory.")
		}

		// 4. Read backup index (source of truth for which tasks are in the archive)
		const backupIndexPath = path.join(extractedTasksDir, GlobalFileNames.historyIndex)
		const backupIndex = await readIndexFile(backupIndexPath)
		const backupEntries: HistoryItem[] = backupIndex?.entries ?? []

		// If no index, enumerate directories as a fallback
		let taskIdsToProcess: string[]
		if (backupEntries.length > 0) {
			taskIdsToProcess = backupEntries.map((e) => e.id)
		} else {
			const dirs = await fs.readdir(extractedTasksDir)
			taskIdsToProcess = dirs.filter((d) => !d.startsWith("_") && !d.startsWith("."))
		}

		// 5. Ensure local tasks directory exists
		const localTasksDir = path.join(basePath, "tasks")
		await fs.mkdir(localTasksDir, { recursive: true })

		// 6. Read existing local index
		const localIndexPath = path.join(localTasksDir, GlobalFileNames.historyIndex)
		const localIndex = await readIndexFile(localIndexPath)
		const localEntriesMap = new Map<string, HistoryItem>((localIndex?.entries ?? []).map((e) => [e.id, e]))

		// 7. Process each task directory from the backup
		for (const taskId of taskIdsToProcess) {
			const srcTaskDir = path.join(extractedTasksDir, taskId)
			const destTaskDir = path.join(localTasksDir, taskId)

			try {
				// Check whether the source task directory actually exists
				await fs.access(srcTaskDir)
			} catch {
				result.errors.push(`Task ${taskId}: source directory not found in archive`)
				continue
			}

			let destExists = false
			try {
				await fs.access(destTaskDir)
				destExists = true
			} catch {
				destExists = false
			}

			if (destExists && conflict === "skip") {
				result.skipped++
				continue
			}

			try {
				if (destExists && conflict === "overwrite") {
					// Remove existing directory before copying
					await fs.rm(destTaskDir, { recursive: true, force: true })
					result.overwritten++
				} else {
					result.imported++
				}

				// Copy task directory using system tool
				await copyDirectorySystem(srcTaskDir, destTaskDir)

				// Track the entry for index merge
				const backupEntry = backupEntries.find((e) => e.id === taskId)
				if (backupEntry) {
					localEntriesMap.set(taskId, backupEntry)
				} else {
					// Try to read history_item.json from the newly copied directory
					try {
						const hiPath = path.join(destTaskDir, GlobalFileNames.historyItem)
						const raw = await fs.readFile(hiPath, "utf8")
						const item: HistoryItem = JSON.parse(raw)
						if (item.id) {
							localEntriesMap.set(item.id, item)
						}
					} catch {
						// No history_item.json; index will be healed on next reconcile
					}
				}
			} catch (err) {
				// Non-fatal: record error and continue with other tasks
				const msg = err instanceof Error ? err.message : String(err)
				result.errors.push(`Task ${taskId}: ${msg}`)
				// Undo the counter we already bumped for overwritten/imported
				if (destExists && conflict === "overwrite") {
					result.overwritten--
				} else if (!destExists) {
					result.imported--
				}
			}
		}

		// 8. Write merged index atomically
		const mergedEntries = Array.from(localEntriesMap.values()).sort((a, b) => b.ts - a.ts)
		const mergedIndex: HistoryIndex = {
			version: 1,
			updatedAt: Date.now(),
			entries: mergedEntries,
		}
		await writeIndexFile(localIndexPath, mergedIndex)
	} finally {
		// 9. Always clean up the temp directory
		try {
			await fs.rm(tempDir, { recursive: true, force: true })
		} catch (cleanupErr) {
			console.warn("[restoreTasksBackup] Failed to clean up temp directory:", cleanupErr)
		}
	}

	return result
}
