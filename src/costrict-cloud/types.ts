import type {
	CostrictCloudBridgeRequest,
	CostrictCloudExtensionMessage,
	CostrictCloudWebviewMessage,
} from "../shared/costrict-cloud"

export type {
	CostrictCloudBridgeMethod,
	CostrictCloudBridgeRequest,
	CostrictCloudBridgeSuccess,
	CostrictCloudBridgeFailure,
	CostrictCloudBridgeResponse,
	CostrictCloudBootstrap,
	CostrictCloudEvent,
	CostrictCloudEventStatus,
	CostrictCloudExtensionMessage,
	CostrictCloudWebviewMessage,
} from "../shared/costrict-cloud"

function ensureApiPath(path: string): string {
	if (!path.startsWith("/")) {
		throw new Error("cs-cloud path must start with '/'")
	}
	return path.startsWith("/api/v1/") ? path : `/api/v1${path}`
}

export function buildCsCloudUrl(
	serverUrl: string,
	path: string,
	query?: CostrictCloudBridgeRequest["query"],
): string {
	const url = new URL(`${serverUrl}${ensureApiPath(path)}`)
	if (query) {
		for (const [key, value] of Object.entries(query)) {
			if (value === undefined || value === null) {
				continue
			}
			url.searchParams.set(key, String(value))
		}
	}
	return url.toString()
}

export function isCostrictCloudRequest(message: CostrictCloudWebviewMessage | { type?: string }): message is {
	type: "costrict-cloud.request"
} & CostrictCloudBridgeRequest {
	return message.type === "costrict-cloud.request"
}

export function isCostrictCloudExtensionMessage(
	message: unknown,
): message is CostrictCloudExtensionMessage {
	return typeof message === "object" && message !== null && "type" in message
}
