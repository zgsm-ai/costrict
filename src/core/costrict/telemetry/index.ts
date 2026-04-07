import { TelemetryService, CostrictTelemetryClient } from "@roo-code/telemetry"
import type { ClineProvider } from "../../webview/ClineProvider"
import { CostrictAuthConfig } from "../auth"
export * from "./constants"

export function initTelemetry(provider: ClineProvider) {
	const telemetryService = TelemetryService.instance
	const costrictBaseUrl = provider.getValue("costrictBaseUrl")
	const baseUrl = costrictBaseUrl ? costrictBaseUrl : CostrictAuthConfig.getInstance().getDefaultApiBaseUrl()
	try {
		telemetryService.register(new CostrictTelemetryClient(`${baseUrl}`, false))
		telemetryService.setProvider(provider)
	} catch (error) {
		console.warn("Failed to register CostrictTelemetryClient:", error)
	}
}
