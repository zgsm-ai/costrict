import { ReviewIssue, IssueStatus } from "../../shared/codeReview"
/**
 * Type definitions for code review service
 *
 * This file contains all type definitions required for code review functionality, including:
 * - Enum types: issue status, review target type, severity level
 * - Interface definitions: request/response data structures
 * - Error types: API error response structure
 */

/**
 * Review target type enumeration
 *
 * @description Defines the type of code review target
 * @example
 * ```typescript
 * const target = { type: ReviewTargetType.FILE, file_path: "src/main.ts" };
 * ```
 */
export enum ReviewTargetType {
	/** File - review entire file */
	FILE = "file",
	/** Folder - review entire folder */
	FOLDER = "folder",
	/** Code snippet - review specified line range of code */
	CODE = "code",
}

/**
 * Review target interface
 *
 * @description Defines the target object for code review
 * @example
 * ```typescript
 * // Review entire file
 * const fileTarget: ReviewTarget = {
 *   type: ReviewTargetType.FILE,
 *   file_path: "src/components/Button.tsx"
 * };
 *
 * // Review code snippet
 * const codeTarget: ReviewTarget = {
 *   type: ReviewTargetType.CODE,
 *   file_path: "src/utils/helper.ts",
 *   line_range: [10, 25]
 * };
 * ```
 */
export interface ReviewTarget {
	/** Review target type */
	type: ReviewTargetType
	/** File path (relative to workspace root) */
	file_path: string
	/** Line range - only valid when type is CODE, format: [start_line, end_line] */
	line_range?: [number, number]
}

/**
 * Create review task request interface
 *
 * @description Request data sent when creating a code review task
 * @example
 * ```typescript
 * const request: ReviewTaskRequest = {
 *   client_id: "vscode-extension-123",
 *   workspace: "/path/to/project",
 *   targets: [
 *     { type: ReviewTargetType.FILE, file_path: "src/main.ts" }
 *   ]
 * };
 * ```
 */
export interface ReviewTaskRequest {
	/** Client identifier */
	client_id: string
	/** Workspace path */
	workspace: string
	/** List of review targets */
	targets: ReviewTarget[]
}

/**
 * Create review task response interface
 *
 * @description Response data returned by server after creating a code review task
 * @example
 * ```typescript
 * const response: ReviewTaskResponse = {
 *   code: 200,
 *   message: "Task created successfully",
 *   data: {
 *     review_task_id: "task-uuid-123"
 *   }
 * };
 * ```
 */
export interface ReviewTaskResponse {
	/** Response status code, 200 indicates success */
	code: number
	/** Response message */
	message: string
	/** Response data */
	data: {
		/** Review task ID */
		review_task_id: string
	}
}

/**
 * Review task result interface
 *
 * @description Response data returned by server when getting code review task results
 * @example
 * ```typescript
 * const result: ReviewTaskResult = {
 *   code: 200,
 *   message: "Success",
 *   data: {
 *     is_done: false,
 *     progress: 5,
 *     total: 10,
 *     next_offset: 5,
 *     issues: [...]
 *   }
 * };
 * ```
 */
export interface ReviewTaskResult {
	/** Response status code, 200 indicates success */
	code: number
	/** Response message */
	message: string
	/** Response data */
	data: {
		/** Whether the task is completed */
		is_done: boolean
		/** Current progress (number of processed files) */
		progress: number
		/** Total number of files */
		total: number
		/** Offset for next query */
		next_offset: number
		/** List of issues */
		issues: ReviewIssue[]
		/** Whether the task is failed */
		is_task_failed?: boolean
		/** Error message */
		error_msg?: string
	}
}

/**
 * Update issue status request interface
 *
 * @description Request data sent when updating code review issue status
 * @example
 * ```typescript
 * const request: UpdateIssueStatusRequest = {
 *   review_task_id: "task-uuid-123",
 *   status: IssueStatus.ACCEPT
 * };
 * ```
 */
export interface UpdateIssueStatusRequest {
	/** Review task ID */
	review_task_id: string
	/** New issue status */
	status: IssueStatus
}

/**
 * Update issue status response interface
 *
 * @description Response data returned by server after updating code review issue status
 * @example
 * ```typescript
 * const response: UpdateIssueStatusResponse = {
 *   code: 200,
 *   message: "Status updated successfully"
 * };
 * ```
 */
export interface UpdateIssueStatusResponse {
	/** Response status code, 200 indicates success */
	code: string
	success: boolean
	/** Response message */
	message: string
}

/**
 * API error response interface
 *
 * @description Error response structure returned by server when API call fails
 * @example
 * ```typescript
 * const error: APIErrorResponse = {
 *   code: 400,
 *   message: "Invalid request parameters"
 * };
 * ```
 */
export interface APIErrorResponse {
	/** Error status code */
	code: number
	/** Error message */
	message: string
}

/**
 * Review task interface
 *
 * @description Internal representation of a review task
 * @example
 * ```typescript
 * const task: ReviewTask = {
 *   taskId: "rt_1234567890",
 *   targets: [{ type: ReviewTargetType.FILE, file_path: "src/main.ts" }],
 *   isCompleted: false,
 *   createdAt: new Date(),
 *   progress: 5,
 *   total: 10
 * };
 * ```
 */
export interface ReviewTask {
	/** Task ID from server response */
	taskId: string
	/** Review targets */
	targets: ReviewTarget[]
	/** Task completion status */
	isCompleted: boolean
	/** Task creation timestamp */
	createdAt: Date
	/** Current progress */
	progress: number
	/** Total items to process */
	total: number
}

export interface TaskData {
	issues: ReviewIssue[]
	progress: number | null
	error?: string
	message?: string
}
