/**
 * Severity level enumeration
 *
 * @description Defines the severity level of code issues
 * @example
 * ```typescript
 * const severity = SeverityLevel.HIGH; // High severity issue
 * ```
 */
export enum SeverityLevel {
	/** Low severity - advisory issues */
	LOW = 1,
	/** Medium severity - issues that need attention */
	MIDDLE = 2,
	/** High severity - issues that must be fixed */
	HIGH = 3,
}
/**
 * Issue status enumeration
 *
 * @description Defines the processing status of code review issues
 * @example
 * ```typescript
 * const status = IssueStatus.ACCEPT; // Accept the fix suggestion
 * ```
 */
export enum IssueStatus {
	/** Initial state - issue just discovered, not yet processed */
	INITIAL = 0,
	/** Ignore - user chooses to ignore this issue */
	IGNORE = 1,
	/** Accept - user accepts the fix suggestion */
	ACCEPT = 2,
	/** Reject - user rejects the fix suggestion */
	REJECT = 3,
}
/**
 * Review issue interface
 *
 * @description Details of issues found during code review
 * @example
 * ```typescript
 * const issue: ReviewIssue = {
 *   issue_id: "issue-123",
 *   file_path: "src/utils/helper.ts",
 *   issue_code: "unused-variable",
 *   fix_patch: "- const unusedVar = 123;",
 *   start_line: 15,
 *   end_line: 15,
 *   title: "Unused Variable",
 *   message: "Variable 'unusedVar' is declared but never used",
 *   issue_types: ["code-quality", "unused-code"],
 *   severity: SeverityLevel.MIDDLE,
 *   status: IssueStatus.INITIAL,
 *   confidence: 0.95,
 *   created_at: "2024-01-01T00:00:00Z",
 *   updated_at: "2024-01-01T00:00:00Z"
 * };
 * ```
 */
export interface ReviewIssue {
	/** Unique issue identifier */
	id: string
	/** File path where the issue is located */
	file_path: string
	/** Issue code identifier (optional) */
	issue_code?: string
	/** Fix patch (optional) */
	fix_patch?: string
	/** Issue start line number */
	start_line: number
	/** Issue end line number */
	end_line: number
	/** Issue title (optional) */
	title?: string
	/** Issue description message */
	message: string
	/** List of issue types */
	issue_types: string[]
	/** Severity level */
	severity: SeverityLevel
	/** Issue status */
	status: IssueStatus
	/** Confidence level (value between 0-1) */
	confidence: number
	/** Creation time (ISO 8601 format) */
	created_at: string
	/** Update time (ISO 8601 format) */
	updated_at: string
}

export enum TaskStatus {
	INITIAL = "initial",
	RUNNING = "running",
	COMPLETED = "completed",
	ERROR = "error",
}

export interface ReviewTaskPayload {
	status: TaskStatus
	data: {
		issues: ReviewIssue[]
		progress: number | null
		error?: string
		message?: string
	}
}
