/**
 * Represents the context of the currently active file in the editor.
 */
export interface FileContext {
	/** Relative path from workspace root */
	relativePath: string
	/** Formatted file reference, e.g. "@src/foo.ts#L5-L10" */
	fileRef: string
	/** Selection range (1-based line numbers), if any */
	selection?: {
		startLine: number
		endLine: number
	}
	timestamp?: number
}
