import path from "path"
import { isBinaryFile } from "isbinaryfile"

import { Task } from "../task/Task"
import { ClineSayTool } from "../../shared/ExtensionMessage"
import { formatResponse } from "../prompts/responses"
import { t } from "../../i18n"
import { ToolUse, AskApproval, HandleError, PushToolResult, RemoveClosingTag } from "../../shared/tools"
import { RecordSource } from "../context-tracking/FileContextTrackerTypes"
import { isPathOutsideWorkspace } from "../../utils/pathUtils"
import { getReadablePath } from "../../utils/path"
import { countFileLines } from "../../integrations/misc/line-counter"
import { readLines } from "../../integrations/misc/read-lines"
import { extractTextFromFile, addLineNumbers } from "../../integrations/misc/extract-text"
import { parseSourceCodeDefinitionsForFile } from "../../services/tree-sitter"
import { truncateContent } from "../../../zgsm/src/core/tools/readFileTool"

export async function readFileTool(
	cline: Task,
	block: ToolUse,
	askApproval: AskApproval,
	handleError: HandleError,
	pushToolResult: PushToolResult,
	removeClosingTag: RemoveClosingTag,
) {
	const relPath: string | undefined = block.params.path
	const startLineStr: string | undefined = block.params.start_line
	const endLineStr: string | undefined = block.params.end_line

	// Get the full path and determine if it's outside the workspace
	const fullPath = relPath ? path.resolve(cline.cwd, removeClosingTag("path", relPath)) : ""
	const isOutsideWorkspace = isPathOutsideWorkspace(fullPath)

	const sharedMessageProps: ClineSayTool = {
		tool: "readFile",
		path: getReadablePath(cline.cwd, removeClosingTag("path", relPath)),
		isOutsideWorkspace,
	}
	try {
		if (block.partial) {
			const partialMessage = JSON.stringify({ ...sharedMessageProps, content: undefined } satisfies ClineSayTool)
			await cline.ask("tool", partialMessage, block.partial).catch(() => {})
			return
		} else {
			if (!relPath) {
				cline.consecutiveMistakeCount++
				cline.recordToolError("read_file")
				const errorMsg = await cline.sayAndCreateMissingParamError("read_file", "path")
				pushToolResult(`<file><path></path><error>${errorMsg}</error></file>`)
				return
			}

			const { maxReadFileLine = 500 } = (await cline.providerRef.deref()?.getState()) ?? {}
			const isFullRead = maxReadFileLine === -1

			// Check if we're doing a line range read
			let isRangeRead = false
			let startLine: number | undefined = undefined
			let endLine: number | undefined = undefined

			// Check if we have either range parameter and we're not doing a full read
			if (!isFullRead && (startLineStr || endLineStr)) {
				isRangeRead = true
			}

			// Parse start_line if provided
			if (startLineStr) {
				startLine = parseInt(startLineStr)

				if (isNaN(startLine)) {
					// Invalid start_line
					cline.consecutiveMistakeCount++
					cline.recordToolError("read_file")
					await cline.say("error", `Failed to parse start_line: ${startLineStr}`)
					pushToolResult(`<file><path>${relPath}</path><error>Invalid start_line value</error></file>`)
					return
				}

				startLine -= 1 // Convert to 0-based index
			}

			// Parse end_line if provided
			if (endLineStr) {
				endLine = parseInt(endLineStr)

				if (isNaN(endLine)) {
					// Invalid end_line
					cline.consecutiveMistakeCount++
					cline.recordToolError("read_file")
					await cline.say("error", `Failed to parse end_line: ${endLineStr}`)
					pushToolResult(`<file><path>${relPath}</path><error>Invalid end_line value</error></file>`)
					return
				}

				// Convert to 0-based index
				endLine -= 1
			}

			const accessAllowed = cline.rooIgnoreController?.validateAccess(relPath)

			if (!accessAllowed) {
				await cline.say("rooignore_error", relPath)
				const errorMsg = formatResponse.rooIgnoreError(relPath)
				pushToolResult(`<file><path>${relPath}</path><error>${errorMsg}</error></file>`)
				return
			}

			// Create line snippet description for approval message
			let lineSnippet = ""

			if (isFullRead) {
				// No snippet for full read
			} else if (startLine !== undefined && endLine !== undefined) {
				lineSnippet = t("tools:readFile.linesRange", { start: startLine + 1, end: endLine + 1 })
			} else if (startLine !== undefined) {
				lineSnippet = t("tools:readFile.linesFromToEnd", { start: startLine + 1 })
			} else if (endLine !== undefined) {
				lineSnippet = t("tools:readFile.linesFromStartTo", { end: endLine + 1 })
			} else if (maxReadFileLine === 0) {
				lineSnippet = t("tools:readFile.definitionsOnly")
			} else if (maxReadFileLine > 0) {
				lineSnippet = t("tools:readFile.maxLines", { max: maxReadFileLine })
			}

			cline.consecutiveMistakeCount = 0
			const absolutePath = path.resolve(cline.cwd, relPath)

			const completeMessage = JSON.stringify({
				...sharedMessageProps,
				content: absolutePath,
				reason: lineSnippet,
			} satisfies ClineSayTool)

			const didApprove = await askApproval("tool", completeMessage)

			if (!didApprove) {
				return
			}

			// Count total lines in the file
			let totalLines = 0

			try {
				totalLines = await countFileLines(absolutePath)
			} catch (error) {
				console.error(`Error counting lines in file ${absolutePath}:`, error)
			}

			// now execute the tool like normal
			let content: string
			let isFileTruncated = false
			let sourceCodeDef = ""

			const isBinary = await isBinaryFile(absolutePath).catch(() => false)

			if (isRangeRead) {
				if (startLine === undefined) {
					content = addLineNumbers(await readLines(absolutePath, endLine, startLine))
				} else {
					content = addLineNumbers(await readLines(absolutePath, endLine, startLine), startLine + 1)
				}
			} else if (!isBinary && maxReadFileLine >= 0 && totalLines > maxReadFileLine) {
				// If file is too large, only read the first maxReadFileLine lines
				isFileTruncated = true

				const res = await Promise.all([
					maxReadFileLine > 0 ? readLines(absolutePath, maxReadFileLine - 1, 0) : "",
					(async () => {
						try {
							return await parseSourceCodeDefinitionsForFile(absolutePath, cline.rooIgnoreController)
						} catch (error) {
							if (error instanceof Error && error.message.startsWith("Unsupported language:")) {
								console.warn(`[read_file] Warning: ${error.message}`)
								return undefined
							} else {
								console.error(
									`[read_file] Unhandled error: ${error instanceof Error ? error.message : String(error)}`,
								)
								return undefined
							}
						}
					})(),
				])

				content = res[0].length > 0 ? addLineNumbers(res[0]) : ""
				const result = res[1]

				if (result) {
					sourceCodeDef = `${result}`
				}
			} else {
				// Read entire file
				content = await extractTextFromFile(absolutePath)

				// Truncate content based on line count or character count
				content = truncateContent(content, maxReadFileLine)
			}

			// Create variables to store XML components
			let xmlInfo = ""
			let contentTag = ""

			// Add truncation notice if applicable
			if (isFileTruncated) {
				xmlInfo += `<notice>Showing only ${maxReadFileLine} of ${totalLines} total lines. Use start_line and end_line if you need to read more</notice>\n`

				// Add source code definitions if available
				if (sourceCodeDef) {
					xmlInfo += `<list_code_definition_names>${sourceCodeDef}</list_code_definition_names>\n`
				}
			}

			// Empty files (zero lines)
			if (content === "" && totalLines === 0) {
				// Always add self-closing content tag and notice for empty files
				contentTag = `<content/>`
				xmlInfo += `<notice>File is empty</notice>\n`
			}
			// Range reads should always show content regardless of maxReadFileLine
			else if (isRangeRead) {
				// Create content tag with line range information
				let lineRangeAttr = ""
				const displayStartLine = startLine !== undefined ? startLine + 1 : 1
				const displayEndLine = endLine !== undefined ? endLine + 1 : totalLines
				lineRangeAttr = ` lines="${displayStartLine}-${displayEndLine}"`

				// Maintain exact format expected by tests
				contentTag = `<content${lineRangeAttr}>\n${content}</content>\n`
			}
			// maxReadFileLine=0 for non-range reads
			else if (maxReadFileLine === 0) {
				// Skip content tag for maxReadFileLine=0 (definitions only mode)
				contentTag = ""
			}
			// Normal case: non-empty files with content (non-range reads)
			else {
				// For non-range reads, always show line range
				let lines = totalLines

				if (maxReadFileLine >= 0 && totalLines > maxReadFileLine) {
					lines = maxReadFileLine
				}

				const lineRangeAttr = ` lines="1-${lines}"`

				// Maintain exact format expected by tests
				contentTag = `<content${lineRangeAttr}>\n${content}</content>\n`
			}

			// Track file read operation
			if (relPath) {
				await cline.fileContextTracker.trackFileContext(relPath, "read_tool" as RecordSource)
			}

			// Format the result into the required XML structure
			const xmlResult = `<file><path>${relPath}</path>\n${contentTag}${xmlInfo}</file>`
			pushToolResult(xmlResult)
		}
	} catch (error) {
		const errorMsg = error instanceof Error ? error.message : String(error)
		pushToolResult(`<file><path>${relPath || ""}</path><error>Error reading file: ${errorMsg}</error></file>`)
		await handleError("reading file", error)
	}
}
