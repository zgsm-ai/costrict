import * as path from "path"
import * as os from "os"
import * as fs from "fs"
import * as vscode from "vscode"
import { parsePatch, reversePatch, applyPatch } from "diff"

/**
 * Apply a unified diff in reverse to the current file content,
 * writing the "before" state to a temp file and opening VSCode's
 * built-in diff editor.
 */
export async function openDiffView(filePath: string, unifiedDiff: string): Promise<void> {
	const workspaceDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
	const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(workspaceDir ?? "", filePath)

	const afterUri = vscode.Uri.file(absolutePath)

	// Read current file content (the "after" state)
	let currentContent: string
	try {
		const raw = await vscode.workspace.fs.readFile(afterUri)
		currentContent = Buffer.from(raw).toString("utf-8")
	} catch {
		vscode.window.showErrorMessage(`Cannot read file for diff: ${absolutePath}`)
		return
	}

	// Parse, reverse, and apply the patch to get the "before" content
	let beforeContent: string
	try {
		const parsedPatches = parsePatch(unifiedDiff)
		if (parsedPatches.length === 0) {
			vscode.window.showWarningMessage("No diff data available for this file.")
			return
		}

		// Filter to patches matching this file
		const matchingPatches = parsedPatches.filter((p) => {
			const oldFile = p.oldFileName?.replace(/^[ab]\//, "") ?? ""
			const newFile = p.newFileName?.replace(/^[ab]\//, "") ?? ""
			const absBase = path.basename(absolutePath)
			return (
				oldFile === absBase ||
				newFile === absBase ||
				absolutePath.endsWith(oldFile) ||
				absolutePath.endsWith(newFile)
			)
		})

		const patchesToReverse = matchingPatches.length > 0 ? matchingPatches : parsedPatches

		// Reverse the patches (swap old/new to go from after → before)
		const reversedPatches = reversePatch(patchesToReverse)

		// applyPatch only accepts a single ParsedDiff, so apply sequentially
		const reversedList = Array.isArray(reversedPatches) ? reversedPatches : [reversedPatches]

		let patchedContent = currentContent
		for (const rp of reversedList) {
			const applied = applyPatch(patchedContent, rp)
			if (applied === false) {
				vscode.window.showErrorMessage("Failed to apply diff patch to current file content.")
				return
			}
			patchedContent = applied
		}

		beforeContent = patchedContent
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err)
		vscode.window.showErrorMessage(`Failed to process diff: ${message}`)
		return
	}

	// Write the "before" content to a temp file
	const ext = path.extname(absolutePath)
	const baseName = path.basename(absolutePath, ext)
	const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cs-cloud-diff-"))
	const beforePath = path.join(tempDir, `${baseName}__before${ext}`)
	fs.writeFileSync(beforePath, beforeContent, "utf-8")

	const beforeUri = vscode.Uri.file(beforePath)

	// Open VSCode's built-in diff view: before (original) ↔ after (current)
	const title = `${path.basename(absolutePath)} (before ↔ after)`

	await vscode.commands.executeCommand("vscode.diff", beforeUri, afterUri, title)
}
