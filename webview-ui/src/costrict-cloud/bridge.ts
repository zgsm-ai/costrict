import type {
	CostrictCloudBridgeResponse,
	CostrictCloudBootstrap,
	CostrictCloudEvent,
	CostrictCloudEventStatus,
	CostrictCloudExtensionMessage,
	CostrictCloudWebviewMessage,
} from "@roo/costrict-cloud"

import { vscode } from "../utils/vscode"

export function postCostrictCloudMessage(message: CostrictCloudWebviewMessage) {
	vscode.postMessage(message as never)
}

export function isCostrictCloudBootstrapMessage(data: unknown): data is CostrictCloudBootstrap {
	return typeof data === "object" && data !== null && (data as { type?: string }).type === "costrict-cloud.bootstrap"
}

export function isCostrictCloudResponseMessage(data: unknown): data is CostrictCloudBridgeResponse {
	return typeof data === "object" && data !== null && (data as { type?: string }).type === "costrict-cloud.response"
}

export function isCostrictCloudEventMessage(data: unknown): data is CostrictCloudEvent {
	return typeof data === "object" && data !== null && (data as { type?: string }).type === "costrict-cloud.event"
}

export function isCostrictCloudEventStatusMessage(data: unknown): data is CostrictCloudEventStatus {
	return typeof data === "object" && data !== null && (data as { type?: string }).type === "costrict-cloud.eventStatus"
}

export function isCostrictCloudExtensionMessage(data: unknown): data is CostrictCloudExtensionMessage {
	return (
		isCostrictCloudBootstrapMessage(data) ||
		isCostrictCloudResponseMessage(data) ||
		isCostrictCloudEventMessage(data) ||
		isCostrictCloudEventStatusMessage(data)
	)
}
