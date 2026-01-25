/**
 * OpenCode Types for WebView
 *
 * These types are used by the WebView UI components to display OpenCode data.
 */

export type SessionStatus = "idle" | "busy" | "retry" | "error"

export type ToolStatus = "pending" | "running" | "completed" | "error"

export interface ToolPart {
	type: "tool"
	id: string
	name: string
	input: Record<string, any>
	status: ToolStatus
	output?: string
	error?: string
}

export interface OpenCodeSessionInfo {
	id: string
	status: SessionStatus
	connected: boolean
}

export interface OpenCodeMessagePart {
	type: "text" | "tool" | "thinking" | "error"
	content?: string
	tool?: ToolPart
}

export interface PermissionDetails {
	tool: string
	action: string
	resource?: string
	reason?: string
}

export interface PermissionRequest {
	requestId: string
	sessionId: string
	details: PermissionDetails
}

export interface QuestionRequest {
	requestId: string
	sessionId: string
	question: string
	options?: string[]
	multiSelect?: boolean
}
