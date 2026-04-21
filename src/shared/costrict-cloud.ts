export type CostrictCloudBridgeMethod = "GET" | "POST" | "PATCH" | "DELETE"

export type CostrictCloudBridgeRequest = {
	requestId: string
	path: string
	method?: CostrictCloudBridgeMethod
	query?: Record<string, string | number | boolean | null | undefined>
	body?: unknown
	headers?: Record<string, string>
	timeoutMs?: number
}

export type CostrictCloudBridgeSuccess = {
	requestId: string
	type: "costrict-cloud.response"
	ok: true
	status: number
	data: unknown
}

export type CostrictCloudBridgeFailure = {
	requestId: string
	type: "costrict-cloud.response"
	ok: false
	status?: number
	error: string
	details?: unknown
}

export type CostrictCloudBridgeResponse = CostrictCloudBridgeSuccess | CostrictCloudBridgeFailure

export type CostrictCloudBootstrap = {
	type: "costrict-cloud.bootstrap"
	payload: {
		authenticated: boolean
		serverUrl: string | null
		healthy: boolean
	}
}

export type CostrictCloudEvent = {
	type: "costrict-cloud.event"
	event: string
	data: unknown
}

export type CostrictCloudEventStatus = {
	type: "costrict-cloud.eventStatus"
	status: "connecting" | "connected" | "disconnected" | "error"
	error?: string
}

export type CostrictCloudDebugLog = {
	type: "costrict-cloud.debugLog"
	tag: string
	payload: unknown
}

export type CostrictCloudExtensionMessage =
	| CostrictCloudBootstrap
	| CostrictCloudBridgeResponse
	| CostrictCloudEvent
	| CostrictCloudEventStatus

export type CostrictCloudWebviewMessage =
	| { type: "costrict-cloud.refresh" }
	| { type: "costrict-cloud.events.start" }
	| { type: "costrict-cloud.events.stop" }
	| ({ type: "costrict-cloud.request" } & CostrictCloudBridgeRequest)
	| CostrictCloudDebugLog
