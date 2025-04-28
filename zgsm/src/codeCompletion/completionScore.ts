/**
 * Copyright (c) 2024 - Sangfor LTD.
 *
 * All rights reserved. Code licensed under the MIT license
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 */
import { TextDocument } from "vscode"
import { CompletionAcception } from "./completionDataInterface"
import { CompletionPoint } from "./completionPoint"

/**
 * Scoring data for quick pre - judgment.
 */
export interface CompletionScores {
	is_whitespace_after_cursor: boolean // Whether all characters after the cursor are whitespace characters.
	prefix: string // Prefix code.
	document_length: number // Document length.
	prompt_end_pos: number // Offset of the cursor in the document.
	previous_label: number // Whether the previous completion was accepted, 1: accepted, 0: rejected.
	previous_label_timestamp: number // Timestamp of the previous completion.
}

/**
 * Used for the completion service to calculate scores (used to quickly filter low - quality requests and reduce the inference workload of the large model).
 */
export function getHideScoreArgs(
	document: TextDocument,
	latest: CompletionPoint | undefined,
	cur: CompletionPoint,
): CompletionScores {
	let previousLabel = 0
	let previousLabelTimestamp = Date.now() - 3600
	if (latest && latest.getAcception() == CompletionAcception.Accepted) {
		previousLabel = 1
		previousLabelTimestamp = latest.getHandleTime()
	}

	const lineSuffix = cur.lineSuffix
	let iswhitespaceAfterCursorTrue = false
	if ("" === lineSuffix.trim()) {
		iswhitespaceAfterCursorTrue = true
	}
	const promptEndPos = document.offsetAt(cur.pos)
	const editorArgs = {
		is_whitespace_after_cursor: iswhitespaceAfterCursorTrue,
		prefix: cur.prefix,
		document_length: document.getText().length,
		prompt_end_pos: promptEndPos,
		previous_label: previousLabel,
		previous_label_timestamp: previousLabelTimestamp,
	}
	return editorArgs
}
