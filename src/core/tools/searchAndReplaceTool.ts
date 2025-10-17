// Core Node.js imports
import path from "path"
import fs from "fs/promises"
import delay from "delay"
import * as vscode from "vscode"

// Internal imports
import { readFileWithEncodingDetection } from "../../utils/encoding"
import { Task } from "../task/Task"
import { AskApproval, HandleError, PushToolResult, RemoveClosingTag, ToolUse } from "../../shared/tools"
import { formatResponse } from "../prompts/responses"
import { ClineSayTool } from "../../shared/ExtensionMessage"
import { getReadablePath } from "../../utils/path"
import { fileExistsAtPath } from "../../utils/fs"
import { getLanguage } from "../../utils/file"
import { getDiffLines } from "../../utils/diffLines"
import { autoCommit } from "../../utils/git"
import { RecordSource } from "../context-tracking/FileContextTrackerTypes"
import { DEFAULT_WRITE_DELAY_MS } from "@roo-code/types"
import { EXPERIMENT_IDS, experiments } from "../../shared/experiments"
import { TelemetryService } from "@roo-code/telemetry"
import { CodeReviewService } from "../costrict/code-review"

/**
 * Tool for performing search and replace operations on files
 * Supports regex and case-sensitive/insensitive matching
 */

/**
 * Validates required parameters for search and replace operation
 */
async function validateParams(
	cline: Task,
	relPath: string | undefined,
	search: string | undefined,
	replace: string | undefined,
	pushToolResult: PushToolResult,
): Promise<boolean> {
	if (!relPath) {
		cline.consecutiveMistakeCount++
		cline.recordToolError("search_and_replace")
		pushToolResult(await cline.sayAndCreateMissingParamError("search_and_replace", "path"))
		return false
	}

	if (!search) {
		cline.consecutiveMistakeCount++
		cline.recordToolError("search_and_replace")
		pushToolResult(await cline.sayAndCreateMissingParamError("search_and_replace", "search"))
		return false
	}

	if (replace === undefined) {
		cline.consecutiveMistakeCount++
		cline.recordToolError("search_and_replace")
		pushToolResult(await cline.sayAndCreateMissingParamError("search_and_replace", "replace"))
		return false
	}

	return true
}

/**
 * Performs search and replace operations on a file
 * @param cline - Cline instance
 * @param block - Tool use parameters
 * @param askApproval - Function to request user approval
 * @param handleError - Function to handle errors
 * @param pushToolResult - Function to push tool results
 * @param removeClosingTag - Function to remove closing tags
 */
export async function searchAndReplaceTool(
	cline: Task,
	block: ToolUse,
	askApproval: AskApproval,
	handleError: HandleError,
	pushToolResult: PushToolResult,
	removeClosingTag: RemoveClosingTag,
): Promise<void> {
	// Extract and validate parameters
	const relPath: string | undefined = block.params.path
	const search: string | undefined = block.params.search
	const replace: string | undefined = block.params.replace
	const useRegex: boolean = block.params.use_regex === "true"
	const ignoreCase: boolean = block.params.ignore_case === "true"
	const startLine: number | undefined = block.params.start_line ? parseInt(block.params.start_line, 10) : undefined
	const endLine: number | undefined = block.params.end_line ? parseInt(block.params.end_line, 10) : undefined
	const startColumn: number | undefined = block.params.start_column
		? parseInt(block.params.start_column, 10)
		: undefined
	const endColumn: number | undefined = block.params.end_column ? parseInt(block.params.end_column, 10) : undefined

	try {
		// Handle partial tool use
		if (block.partial) {
			const partialMessageProps = {
				tool: "searchAndReplace" as const,
				path: getReadablePath(cline.cwd, removeClosingTag("path", relPath)),
				search: removeClosingTag("search", search),
				replace: removeClosingTag("replace", replace),
				useRegex: block.params.use_regex === "true",
				ignoreCase: block.params.ignore_case === "true",
				startLine,
				endLine,
				startColumn,
				endColumn,
			}
			await cline.ask("tool", JSON.stringify(partialMessageProps), block.partial).catch(() => {})
			return
		}

		// Validate required parameters
		if (!(await validateParams(cline, relPath, search, replace, pushToolResult))) {
			return
		}

		// At this point we know relPath, search and replace are defined
		const validRelPath = relPath as string
		const validSearch = search as string
		const validReplace = replace as string

		const sharedMessageProps: ClineSayTool = {
			tool: "searchAndReplace",
			path: getReadablePath(cline.cwd, validRelPath),
			search: validSearch,
			replace: validReplace,
			useRegex: useRegex,
			ignoreCase: ignoreCase,
			startLine: startLine,
			endLine: endLine,
			startColumn: startColumn,
			endColumn: endColumn,
		}

		const accessAllowed = cline.rooIgnoreController?.validateAccess(validRelPath)

		if (!accessAllowed) {
			await cline.say("rooignore_error", validRelPath)
			pushToolResult(formatResponse.toolError(formatResponse.rooIgnoreError(validRelPath)))
			return
		}

		// Check if file is write-protected
		const isWriteProtected = cline.rooProtectedController?.isWriteProtected(validRelPath) || false

		const absolutePath = path.resolve(cline.cwd, validRelPath)
		const fileExists = await fileExistsAtPath(absolutePath)

		if (!fileExists) {
			cline.consecutiveMistakeCount++
			cline.recordToolError("search_and_replace")
			const formattedError = formatResponse.toolError(
				`File does not exist at path: ${absolutePath}\nThe specified file could not be found. Please verify the file path and try again.`,
			)
			await cline.say("error", formattedError)
			pushToolResult(formattedError)
			return
		}

		// Reset consecutive mistakes since all validations passed
		cline.consecutiveMistakeCount = 0

		// Read and process file content
		let fileContent: string
		try {
			fileContent = await readFileWithEncodingDetection(absolutePath)
		} catch (error) {
			cline.consecutiveMistakeCount++
			cline.recordToolError("search_and_replace")
			const errorMessage = `Error reading file: ${absolutePath}\nFailed to read the file content: ${
				error instanceof Error ? error.message : String(error)
			}\nPlease verify file permissions and try again.`
			const formattedError = formatResponse.toolError(errorMessage)
			await cline.say("error", formattedError)
			pushToolResult(formattedError)
			return
		}

		// Create search pattern and perform replacement
		const flags = ignoreCase ? "gi" : "g"
		const searchPattern = useRegex ? new RegExp(validSearch, flags) : new RegExp(escapeRegExp(validSearch), flags)

		let newContent: string
		if (startLine !== undefined || endLine !== undefined || startColumn !== undefined || endColumn !== undefined) {
			// Handle line and column-specific replacement
			const lines = fileContent.split("\n")
			const start = Math.max((startLine ?? 1) - 1, 0)
			const end = Math.min((endLine ?? lines.length) - 1, lines.length - 1)

			// Get content before and after target section
			const beforeLines = lines.slice(0, start)
			const afterLines = lines.slice(end + 1)

			// Get and modify target section with column constraints
			const targetLines = lines.slice(start, end + 1)
			const modifiedLines = targetLines.map((line, lineIndex) => {
				const actualLineIndex = start + lineIndex
				if (actualLineIndex >= start && actualLineIndex <= end) {
					// Apply column constraints if specified
					if (startColumn !== undefined || endColumn !== undefined) {
						const lineStart = Math.max((startColumn ?? 1) - 1, 0)
						const lineEnd = Math.min((endColumn ?? line.length) - 1, line.length - 1)

						if (lineStart < lineEnd) {
							const beforeColumn = line.slice(0, lineStart)
							const targetColumn = line.slice(lineStart, lineEnd + 1)
							const afterColumn = line.slice(lineEnd + 1)

							const modifiedColumn = targetColumn.replace(searchPattern, validReplace)
							return beforeColumn + modifiedColumn + afterColumn
						}
					}
				}
				return line
			})

			// Reconstruct full content
			newContent = [...beforeLines, ...modifiedLines, ...afterLines].join("\n")
		} else {
			// Global replacement
			newContent = fileContent.replace(searchPattern, validReplace)
		}

		// Initialize diff view
		cline.diffViewProvider.editType = "modify"
		cline.diffViewProvider.originalContent = fileContent

		// Generate and validate diff
		const diff = formatResponse.createPrettyPatch(validRelPath, fileContent, newContent)
		if (!diff) {
			pushToolResult(`No changes needed for '${relPath}'`)
			await cline.diffViewProvider.reset()
			return
		}

		// Check if preventFocusDisruption experiment is enabled
		const provider = cline.providerRef.deref()
		const state = await provider?.getState()
		const diagnosticsEnabled = state?.diagnosticsEnabled ?? true
		const writeDelayMs = state?.writeDelayMs ?? DEFAULT_WRITE_DELAY_MS
		const isPreventFocusDisruptionEnabled = experiments.isEnabled(
			state?.experiments ?? {},
			EXPERIMENT_IDS.PREVENT_FOCUS_DISRUPTION,
		)

		const completeMessage = JSON.stringify({
			...sharedMessageProps,
			diff,
			isProtected: isWriteProtected,
		} satisfies ClineSayTool)

		// Show diff view if focus disruption prevention is disabled
		if (!isPreventFocusDisruptionEnabled) {
			await cline.diffViewProvider.open(validRelPath)
			await cline.diffViewProvider.update(newContent, true)
			cline.diffViewProvider.scrollToFirstDiff()
		}

		const language = await getLanguage(validRelPath)
		const diffLines = getDiffLines(fileContent, newContent)
		const didApprove = await askApproval("tool", completeMessage, undefined, isWriteProtected)

		if (!didApprove) {
			// Revert changes if diff view was shown
			if (!isPreventFocusDisruptionEnabled) {
				await cline.diffViewProvider.revertChanges()
			}
			pushToolResult("Changes were rejected by the user.")
			await cline.diffViewProvider.reset()
			TelemetryService.instance.captureCodeReject(language, diffLines)
			return
		}

		// Track edit position for auto-focus
		if (cline.editPositionTracker && search) {
			// Find all match positions for search and replace
			const lines = fileContent.split("\n")
			const searchRegex = useRegex
				? new RegExp(search, ignoreCase ? "gi" : "g")
				: new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), ignoreCase ? "gi" : "g")
			let matchCount = 0

			// Reset regex lastIndex to ensure we start from the beginning
			searchRegex.lastIndex = 0

			// We need to track the last match position to set cursor at the end of replacement
			let lastMatchPosition: {
				startLine: number
				endLine: number
				startColumn: number
				endColumn: number
			} | null = null

			// Search in the entire file content to properly handle multi-line matches
			let match
			while ((match = searchRegex.exec(fileContent)) !== null) {
				// Calculate line and column positions for the match
				const matchStart = match.index
				const matchEnd = matchStart + match[0].length

				// Find the start line and column
				let startLineIndex = 0
				let startColumn = matchStart + 1 // Convert to 1-based
				let charCount = 0

				for (let i = 0; i < lines.length; i++) {
					const lineLength = lines[i].length + 1 // +1 for newline character
					if (charCount + lineLength > matchStart) {
						startLineIndex = i
						startColumn = matchStart - charCount + 1 // Convert to 1-based
						break
					}
					charCount += lineLength
				}

				// Find the end line and column
				let endLineIndex = startLineIndex
				let endColumn = startColumn + match[0].length - 1

				// Check if the match spans multiple lines
				let remainingLength = match[0].length
				let currentLineIndex = startLineIndex
				let currentColumnInLine = startColumn

				while (remainingLength > 0 && currentLineIndex < lines.length) {
					const lineLength = lines[currentLineIndex].length
					const availableInLine = lineLength - currentColumnInLine + 1

					if (remainingLength <= availableInLine) {
						// Match ends on this line
						endLineIndex = currentLineIndex
						endColumn = currentColumnInLine + remainingLength - 1
						break
					} else {
						// Match continues to next line
						remainingLength -= availableInLine
						currentLineIndex++
						currentColumnInLine = 1
					}
				}

				// Convert to 1-based line numbers
				const startLineNumber = startLineIndex + 1
				const endLineNumber = endLineIndex + 1

				// Check if match is within specified line and column ranges
				const withinLineRange =
					startLine === undefined ||
					endLine === undefined ||
					(startLineNumber >= startLine && endLineNumber <= endLine)

				// For multi-line matches, column range check is more complex
				let withinColumnRange = true
				if (startColumn !== undefined || endColumn !== undefined) {
					if (startLineNumber === endLineNumber) {
						// Single line match - simple column check
						withinColumnRange =
							startColumn === undefined ||
							endColumn === undefined ||
							(startColumn >= startColumn && endColumn <= endColumn)
					} else {
						// Multi-line match - check if any part of the match is within the column range
						// For simplicity, we'll check if the start of the match is within range
						withinColumnRange =
							startColumn === undefined || endColumn === undefined || startColumn >= startColumn
					}
				}

				// Only track if within specified ranges
				if (withinLineRange && withinColumnRange) {
					matchCount++
					// Store the last match position
					lastMatchPosition = {
						startLine: startLineNumber,
						endLine: endLineNumber,
						startColumn: startColumn,
						endColumn: endColumn,
					}

					// Avoid infinite loops with zero-length matches
					if (match[0].length === 0) {
						searchRegex.lastIndex++
					}
				}
			}

			// Track the position of the last match, but adjust it to be at the end of the replacement
			if (lastMatchPosition) {
				// Calculate the position at the end of the replacement text
				const replacementLines = validReplace.split("\n")
				const replacementEndLine = lastMatchPosition.startLine + replacementLines.length - 1
				let replacementEndColumn: number

				if (replacementLines.length === 1) {
					// Single line replacement
					replacementEndColumn = lastMatchPosition.startColumn + validReplace.length - 1
				} else {
					// Multi-line replacement - cursor is at the end of the last line
					replacementEndColumn = replacementLines[replacementLines.length - 1].length
				}

				// Track the position at the end of the replacement
				cline.editPositionTracker.trackPosition(validRelPath, {
					filePath: validRelPath,
					startLine: replacementEndLine,
					endLine: replacementEndLine,
					startColumn: replacementEndColumn,
					endColumn: replacementEndColumn + 1,
					editType: "replace",
				})
			}
		}

		// Save the changes
		if (isPreventFocusDisruptionEnabled) {
			// Direct file write without diff view or opening the file
			await cline.diffViewProvider.saveDirectly(validRelPath, newContent, false, diagnosticsEnabled, writeDelayMs)
		} else {
			// Call saveChanges to update the DiffViewProvider properties
			await cline.diffViewProvider.saveChanges(diagnosticsEnabled, writeDelayMs)
		}

		// Track file edit operation
		if (relPath) {
			await cline.fileContextTracker.trackFileContext(relPath, "roo_edited" as RecordSource)
		}

		try {
			TelemetryService.instance.captureCodeAccept(language, diffLines)

			// Check if AutoCommit is enabled before committing
			const autoCommitEnabled = vscode.workspace.getConfiguration().get<boolean>("AutoCommit", false)
			if (autoCommitEnabled) {
				autoCommit(relPath as string, cline.cwd, {
					model: cline.api.getModel().id,
					editorName: vscode.env.appName,
					date: new Date().toLocaleString(),
				})
			}
		} catch (err) {
			console.log(err)
		}
		const codeReviewService = CodeReviewService.getInstance()
		codeReviewService.checkAndAcceptIssueByTaskId(cline.taskId)

		cline.didEditFile = true

		// Get the formatted response message
		const message = await cline.diffViewProvider.pushToolWriteResult(
			cline,
			cline.cwd,
			false, // Always false for search_and_replace
		)

		pushToolResult(message)

		// Record successful tool usage and cleanup
		cline.recordToolUsage("search_and_replace")
		await cline.diffViewProvider.reset()

		// Process any queued messages after file edit completes
		cline.processQueuedMessages()
	} catch (error) {
		handleError("search and replace", error)
		await cline.diffViewProvider.reset()
	}
}

/**
 * Escapes special regex characters in a string
 * @param input String to escape regex characters in
 * @returns Escaped string safe for regex pattern matching
 */
function escapeRegExp(input: string): string {
	return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
