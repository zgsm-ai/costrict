/**
 * Copyright (c) 2024 - Sangfor LTD.
 *
 * All rights reserved. Code licensed under the MIT license
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 */
/**
 * Code completion prompt information (simple context).
 */
export interface CompletionPrompt {
	prefix: string // All code before the cursor.
	suffix: string // All code after the cursor.
	cursor_line_prefix: string // Prefix code of the line where the cursor is located.
	cursor_line_suffix: string // Suffix code of the line where the cursor is located.
}
/**
 * Document information.
 */
export interface CompletionDocumentInformation {
	fpath: string // Document path.
	language: string // Language.
}
/**
 * Completion feedback.
 */
export interface CompletionFeedback {
	acception: string // Acceptance status.
	correction: string // Correction status.
	actual_code: string // Actual code entered by the user.
	tab_enter: boolean // Whether the user has entered TAB.
	expend_time: number // Total time elapsed from when the system starts to obtain completion content to when the completion result is displayed.
}

/**
 * Results of whether the completion is accepted.
 */
export enum CompletionAcception {
	None = 0, // No result yet, the user has not performed any operation on the completion content.
	Canceled = 1, // The completion request has been cancelled, including: the user edits the preceding content, the user enters new content, or switches the editing position, causing the completion point to become invalid.
	Accepted = 2, // Accepted: the user presses the TAB key to accept the completion content.
	Rejected = 3, // Rejected: the user rejects the completion, including when the newly entered content is different from the completion content.
}
/**
 * User acceptance status.
 */
export function getAcceptionString(acception: CompletionAcception): string {
	switch (acception) {
		case CompletionAcception.None:
			return "none"
		case CompletionAcception.Canceled:
			return "canceled"
		case CompletionAcception.Accepted:
			return "accepted"
		case CompletionAcception.Rejected:
			return "rejected"
		default:
			return ""
	}
}

/**
 * User correction status of the completion result.
 */
export enum CompletionCorrection {
	None = 0, // Unknown.
	Unchanged = 1, // Unchanged.
	Changed = 2, // Changed.
}

/**
 * User correction status.
 */
export function getCorrectionString(state: CompletionCorrection): string {
	switch (state) {
		case CompletionCorrection.None:
			return "none"
		case CompletionCorrection.Unchanged:
			return "unchanged"
		case CompletionCorrection.Changed:
			return "changed"
		default:
			return ""
	}
}
/**
 * Request completion mode.
 */
export enum CompletionMode {
	DontNeed = 0, // No completion needed.
	Cached = 1, // Cached: use all the results left over from the previous position.
	Partial = 2, // Cache the second half (since the user has entered the first half, only the second half can be used).
	Newest = 3, // Get the latest content: there is no content that can be used.
}

/**
 * Matching situation of the completion result.
 */
export interface CompletionRequirement {
	mode: CompletionMode
	matchLen?: number
	remain?: string
}
