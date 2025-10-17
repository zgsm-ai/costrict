import path from "path"
import fs from "fs/promises"
import * as vscode from "vscode"

import { TelemetryService } from "@roo-code/telemetry"
import { readFileWithEncodingDetection } from "../../utils/encoding"
import { DEFAULT_WRITE_DELAY_MS } from "@roo-code/types"

import { ClineSayTool } from "../../shared/ExtensionMessage"
import { getReadablePath } from "../../utils/path"
import { getDiffLines } from "../../utils/diffLines"
import { getLanguage } from "../../utils/file"
import { autoCommit } from "../../utils/git"
import { Task } from "../task/Task"
import { ToolUse, RemoveClosingTag, AskApproval, HandleError, PushToolResult } from "../../shared/tools"
import { formatResponse } from "../prompts/responses"
import { fileExistsAtPath } from "../../utils/fs"
import { RecordSource } from "../context-tracking/FileContextTrackerTypes"
import { unescapeHtmlEntities } from "../../utils/text-normalization"
import { EXPERIMENT_IDS, experiments } from "../../shared/experiments"
import { CodeReviewService } from "../costrict/code-review"

export async function applyDiffToolLegacy(
	cline: Task,
	block: ToolUse,
	askApproval: AskApproval,
	handleError: HandleError,
	pushToolResult: PushToolResult,
	removeClosingTag: RemoveClosingTag,
) {
	const relPath: string | undefined = block.params.path
	let diffContent: string | undefined = block.params.diff

	if (diffContent && !cline.api.getModel().id.includes("claude")) {
		diffContent = unescapeHtmlEntities(diffContent)
	}

	const sharedMessageProps: ClineSayTool = {
		tool: "appliedDiff",
		path: getReadablePath(cline.cwd, removeClosingTag("path", relPath)),
		diff: diffContent,
	}

	try {
		if (block.partial) {
			// Update GUI message
			let toolProgressStatus

			if (cline.diffStrategy && cline.diffStrategy.getProgressStatus) {
				toolProgressStatus = cline.diffStrategy.getProgressStatus(block)
			}

			if (toolProgressStatus && Object.keys(toolProgressStatus).length === 0) {
				return
			}

			await cline
				.ask("tool", JSON.stringify(sharedMessageProps), block.partial, toolProgressStatus)
				.catch(() => {})

			return
		} else {
			if (!relPath) {
				cline.consecutiveMistakeCount++
				cline.recordToolError("apply_diff")
				pushToolResult(await cline.sayAndCreateMissingParamError("apply_diff", "path"))
				return
			}

			if (!diffContent) {
				cline.consecutiveMistakeCount++
				cline.recordToolError("apply_diff")
				pushToolResult(await cline.sayAndCreateMissingParamError("apply_diff", "diff"))
				return
			}

			const accessAllowed = cline.rooIgnoreController?.validateAccess(relPath)

			if (!accessAllowed) {
				await cline.say("rooignore_error", relPath)
				pushToolResult(formatResponse.toolError(formatResponse.rooIgnoreError(relPath)))
				return
			}

			const absolutePath = path.resolve(cline.cwd, relPath)
			const fileExists = await fileExistsAtPath(absolutePath)

			if (!fileExists) {
				cline.consecutiveMistakeCount++
				cline.recordToolError("apply_diff")
				const formattedError = `File does not exist at path: ${absolutePath}\n\n<error_details>\nThe specified file could not be found. Please verify the file path and try again.\n</error_details>`
				await cline.say("error", formattedError)
				pushToolResult(formattedError)
				return
			}

			const originalContent: string = await readFileWithEncodingDetection(absolutePath)

			// Apply the diff to the original content
			const diffResult = (await cline.diffStrategy?.applyDiff(
				originalContent,
				diffContent,
				parseInt(block.params.start_line ?? ""),
			)) ?? {
				success: false,
				error: "No diff strategy available",
			}

			if (!diffResult.success) {
				cline.consecutiveMistakeCount++
				const currentCount = (cline.consecutiveMistakeCountForApplyDiff.get(relPath) || 0) + 1
				cline.consecutiveMistakeCountForApplyDiff.set(relPath, currentCount)
				let formattedError = ""
				TelemetryService.instance.captureDiffApplicationError(cline.taskId, currentCount)

				if (diffResult.failParts && diffResult.failParts.length > 0) {
					for (const failPart of diffResult.failParts) {
						if (failPart.success) {
							continue
						}

						const errorDetails = failPart.details ? JSON.stringify(failPart.details, null, 2) : ""

						formattedError = `<error_details>\n${
							failPart.error
						}${errorDetails ? `\n\nDetails:\n${errorDetails}` : ""}\n</error_details>`
					}
				} else {
					const errorDetails = diffResult.details ? JSON.stringify(diffResult.details, null, 2) : ""

					formattedError = `Unable to apply diff to file: ${absolutePath}\n\n<error_details>\n${
						diffResult.error
					}${errorDetails ? `\n\nDetails:\n${errorDetails}` : ""}\n</error_details>`
				}

				if (currentCount >= 2) {
					await cline.say("diff_error", formattedError)
				}

				cline.recordToolError("apply_diff", formattedError)

				pushToolResult(formattedError)
				return
			}

			cline.consecutiveMistakeCount = 0
			cline.consecutiveMistakeCountForApplyDiff.delete(relPath)

			// Track edit position for auto-focus
			if (cline.editPositionTracker) {
				const blockStartLine = parseInt(block.params.start_line ?? "1")

				// For apply_diff, we need to parse the actual edit position from diffContent
				// diffContent format: '<<<<<<< SEARCH\n:start_line:9\n-------\n    <h1>123</h1>\n=======\n    <h1>333</h1>\n>>>>>>> REPLACE'
				// Now supports multiple SEARCH/REPLACE blocks, cursor will focus on the last position of all modified content
				let finalStartLine = blockStartLine // Default to blockStartLine
				let finalEndLine = blockStartLine // Default end line
				let finalStartColumn = 1 // Default to column 1
				let finalEndColumn = 1 // Default to column 1

				// Try to parse multiple SEARCH/REPLACE blocks from diffContent
				if (diffContent && diffResult.content) {
					// Use regex to match all SEARCH/REPLACE blocks
					const searchReplaceRegex =
						/<<<<<<< SEARCH\n:start_line:(\d+)\n-------\n([\s\S]*?)\n=======\n([\s\S]*?)\n>>>>>>> REPLACE/g
					let match
					const allMatches = []

					// Collect all matching SEARCH/REPLACE blocks
					while ((match = searchReplaceRegex.exec(diffContent)) !== null) {
						allMatches.push({
							startLine: parseInt(match[1]),
							searchContent: match[2],
							replaceContent: match[3],
							matchIndex: match.index,
						})
					}

					if (allMatches.length > 0) {
						// Sort by start line in ascending order to correctly calculate line offset
						const sortedMatches = allMatches.sort((a, b) => a.startLine - b.startLine)

						let cumulativeLineOffset = 0 // Cumulative line offset

						// Get the complete modified content for precise column position calculation
						const modifiedContentLines = diffResult.content.split("\n")

						// Process each edit block to calculate line offset
						for (let i = 0; i < sortedMatches.length; i++) {
							const match = sortedMatches[i]
							const originalStartLine = match.startLine
							const searchContent = match.searchContent
							const replaceContent = match.replaceContent

							const searchLines = searchContent.split("\n")
							const replaceLines = replaceContent.split("\n")

							// Calculate the line change for this edit block
							const lineDelta = replaceLines.length - searchLines.length

							// Calculate the actual start line considering offset
							const adjustedStartLine = originalStartLine + cumulativeLineOffset

							// Calculate the end position of this edit block
							// Fixed: end line should be adjusted start line plus replace content lines minus 1
							const adjustedEndLine = adjustedStartLine + replaceLines.length - 1

							// Calculate column positions - use modified content for precise calculation
							let startColumn = 1
							let endColumn = 1

							// Use modified content to calculate start column position
							if (adjustedStartLine <= modifiedContentLines.length && adjustedStartLine > 0) {
								const modifiedFirstLine = modifiedContentLines[adjustedStartLine - 1]
								if (modifiedFirstLine && replaceLines.length > 0) {
									const replaceFirstLine = replaceLines[0]
									// Find the start position of replacement content in the modified line
									const startIndex = modifiedFirstLine.indexOf(replaceFirstLine.trim())
									if (startIndex !== -1) {
										startColumn = startIndex + 1 // Convert to 1-based
									} else {
										// If exact match not found, use indentation as start position
										const leadingSpaces =
											replaceFirstLine.length - replaceFirstLine.trimStart().length
										startColumn = leadingSpaces + 1
									}
								}
							}

							// Use modified content to calculate end column position
							if (
								adjustedEndLine <= modifiedContentLines.length &&
								adjustedEndLine > 0 &&
								replaceLines.length > 0
							) {
								const modifiedLastLine = modifiedContentLines[adjustedEndLine - 1]
								const replaceLastLine = replaceLines[replaceLines.length - 1]

								if (modifiedLastLine) {
									const trimmedReplaceLastLine = replaceLastLine.trimEnd()
									// Find the end position of replacement content in the modified line
									const startIndex = modifiedLastLine.indexOf(trimmedReplaceLastLine)
									if (startIndex !== -1) {
										endColumn = startIndex + trimmedReplaceLastLine.length + 1 // Convert to 1-based
									} else {
										// If exact match not found, use line length as end position
										endColumn = modifiedLastLine.trimEnd().length + 1
									}
								}
							}

							// Update final position to current processed position (last edit block)
							finalStartLine = adjustedStartLine
							finalStartColumn = startColumn
							finalEndLine = adjustedEndLine
							finalEndColumn = endColumn

							// Update cumulative line offset, affecting subsequent edit blocks
							cumulativeLineOffset += lineDelta
						}
					} else {
						// If no SEARCH/REPLACE blocks found, try using the original single block matching logic
						const startLineMatch = diffContent.match(/:start_line:(\d+)/)
						if (startLineMatch) {
							finalStartLine = parseInt(startLineMatch[1])
						}

						// Try to parse the specific edit position
						const searchMatch = diffContent.match(
							/<<<<<<< SEARCH\n:start_line:\d+\n-------\n([\s\S]*?)\n=======\n([\s\S]*?)\n>>>>>>> REPLACE/,
						)
						if (searchMatch) {
							const replaceContent = searchMatch[2]

							// Use modified content for precise position calculation
							const modifiedContentLines = diffResult.content.split("\n")

							// Calculate start column position
							const replaceLines = replaceContent.split("\n")
							if (
								replaceLines.length > 0 &&
								finalStartLine <= modifiedContentLines.length &&
								finalStartLine > 0
							) {
								const modifiedFirstLine = modifiedContentLines[finalStartLine - 1]
								const replaceFirstLine = replaceLines[0]

								if (modifiedFirstLine) {
									const startIndex = modifiedFirstLine.indexOf(replaceFirstLine.trim())
									if (startIndex !== -1) {
										finalStartColumn = startIndex + 1 // Convert to 1-based
									} else {
										const leadingSpaces =
											replaceFirstLine.length - replaceFirstLine.trimStart().length
										finalStartColumn = leadingSpaces + 1
									}
								}
							}

							// Calculate end position
							if (replaceLines.length > 0) {
								finalEndLine = finalStartLine + replaceLines.length - 1

								if (finalEndLine <= modifiedContentLines.length && finalEndLine > 0) {
									const modifiedLastLine = modifiedContentLines[finalEndLine - 1]
									const replaceLastLine = replaceLines[replaceLines.length - 1]

									if (modifiedLastLine) {
										const trimmedReplaceLastLine = replaceLastLine.trimEnd()
										const startIndex = modifiedLastLine.indexOf(trimmedReplaceLastLine)
										if (startIndex !== -1) {
											finalEndColumn = startIndex + trimmedReplaceLastLine.length + 1 // Convert to 1-based
										} else {
											finalEndColumn = modifiedLastLine.trimEnd().length + 1
										}
									}
								}
							}
						}
					}
				}

				cline.editPositionTracker.trackPosition(relPath, {
					filePath: relPath,
					startLine: finalEndLine,
					endLine: finalEndLine,
					startColumn: finalEndColumn,
					endColumn: finalEndColumn,
					editType: "modify",
				})
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

			// Check if file is write-protected
			const isWriteProtected = cline.rooProtectedController?.isWriteProtected(relPath) || false
			const fileLanguage = await getLanguage(absolutePath)
			const changedLines = getDiffLines(originalContent ?? "", diffResult.content ?? "")
			const captureCodeAccept = (fileLanguage: string, changedLines: number) => {
				try {
					TelemetryService.instance.captureCodeAccept(fileLanguage, changedLines)

					// Check if AutoCommit is enabled before committing
					const autoCommitEnabled = vscode.workspace.getConfiguration().get<boolean>("AutoCommit", false)
					if (autoCommitEnabled) {
						autoCommit(relPath, cline.cwd, {
							model: cline.api.getModel().id,
							editorName: vscode.env.appName,
							date: new Date().toLocaleString(),
						})
					}
				} catch (err) {
					console.log(err)
				}
			}
			if (isPreventFocusDisruptionEnabled) {
				// Direct file write without diff view
				const completeMessage = JSON.stringify({
					...sharedMessageProps,
					diff: diffContent,
					isProtected: isWriteProtected,
				} satisfies ClineSayTool)

				let toolProgressStatus

				if (cline.diffStrategy && cline.diffStrategy.getProgressStatus) {
					toolProgressStatus = cline.diffStrategy.getProgressStatus(block, diffResult)
				}

				const didApprove = await askApproval("tool", completeMessage, toolProgressStatus, isWriteProtected)

				if (!didApprove) {
					TelemetryService.instance.captureCodeReject(fileLanguage, changedLines)
					return
				}

				// Save directly without showing diff view or opening the file
				cline.diffViewProvider.editType = "modify"
				cline.diffViewProvider.originalContent = originalContent
				await cline.diffViewProvider.saveDirectly(
					relPath,
					diffResult.content,
					false,
					diagnosticsEnabled,
					writeDelayMs,
				)
			} else {
				// Original behavior with diff view
				// Show diff view before asking for approval
				cline.diffViewProvider.editType = "modify"
				await cline.diffViewProvider.open(relPath)
				await cline.diffViewProvider.update(diffResult.content, true)
				cline.diffViewProvider.scrollToFirstDiff()

				const completeMessage = JSON.stringify({
					...sharedMessageProps,
					diff: diffContent,
					isProtected: isWriteProtected,
				} satisfies ClineSayTool)

				let toolProgressStatus

				if (cline.diffStrategy && cline.diffStrategy.getProgressStatus) {
					toolProgressStatus = cline.diffStrategy.getProgressStatus(block, diffResult)
				}

				const didApprove = await askApproval("tool", completeMessage, toolProgressStatus, isWriteProtected)
				if (!didApprove) {
					await cline.diffViewProvider.revertChanges() // Cline likely handles closing the diff view
					cline.processQueuedMessages()
					TelemetryService.instance.captureCodeReject(fileLanguage, changedLines)
					return
				}

				// Call saveChanges to update the DiffViewProvider properties
				await cline.diffViewProvider.saveChanges(diagnosticsEnabled, writeDelayMs)
			}

			// Track file edit operation
			if (relPath) {
				await cline.fileContextTracker.trackFileContext(relPath, "roo_edited" as RecordSource)
			}
			captureCodeAccept(fileLanguage, changedLines)
			const codeReviewService = CodeReviewService.getInstance()
			codeReviewService.checkAndAcceptIssueByTaskId(cline.taskId)

			// Used to determine if we should wait for busy terminal to update before sending api request
			cline.didEditFile = true
			let partFailHint = ""

			if (diffResult.failParts && diffResult.failParts.length > 0) {
				partFailHint = `But unable to apply all diff parts to file: ${absolutePath}, silently use <read_file> tool to check newest file version and re-apply diffs\n`
			}

			// Get the formatted response message
			const message = await cline.diffViewProvider.pushToolWriteResult(cline, cline.cwd, !fileExists)

			// Check for single SEARCH/REPLACE block warning
			const searchBlocks = (diffContent.match(/<<<<<<< SEARCH/g) || []).length
			const singleBlockNotice =
				searchBlocks === 1
					? "\n<notice>Making multiple related changes in a single apply_diff is more efficient. If other changes are needed in this file, please include them as additional SEARCH/REPLACE blocks.</notice>"
					: ""

			if (partFailHint) {
				pushToolResult(partFailHint + message + singleBlockNotice)
			} else {
				pushToolResult(message + singleBlockNotice)
			}

			await cline.diffViewProvider.reset()

			// Process any queued messages after file edit completes
			cline.processQueuedMessages()

			return
		}
	} catch (error) {
		await handleError("applying diff", error)
		await cline.diffViewProvider.reset()
		cline.processQueuedMessages()
		return
	}
}
