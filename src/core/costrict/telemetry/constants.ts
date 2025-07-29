export const CodeReviewErrorType = {
	StartReviewError: "StartReviewError",
	FetchResultError: "FetchResultError",
	CancelReviewError: "CancelReviewError",
	UpdateIssueError: "UpdateIssueError",
	AuthError: "AuthError",
	UnknownError: "Unknown",
}

export const CodeBaseError = {
	AuthError: "AuthError",
	SyncFailed: "SyncFailed",
	CheckFileError: "CheckFileError",
}

export const CodeCompletionError = {
	ApiError: "ApiError",
}

export type CodeBaseErrorType = keyof typeof CodeBaseError
export type CodeReviewErrorType = keyof typeof CodeReviewErrorType
export type CodeCompletionErrorType = keyof typeof CodeCompletionError

export type TelemetryErrorType = CodeReviewErrorType | CodeBaseErrorType | CodeCompletionErrorType
