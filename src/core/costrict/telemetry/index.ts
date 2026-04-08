import { TelemetryService, CostrictTelemetryClient, CostrictRawStoreClient } from "@roo-code/telemetry"
import type { ClineProvider } from "../../webview/ClineProvider"
import { CostrictAuthConfig } from "../auth"
import { RawTaskReporter } from "./rawTaskReporter"
import { RawCommitReporter } from "./rawCommitReporter"
export * from "./constants"

let rawTaskReporter: RawTaskReporter | undefined
let rawCommitReporter: RawCommitReporter | undefined

export function initTelemetry(provider: ClineProvider) {
	const telemetryService = TelemetryService.instance
	const costrictBaseUrl = provider.getValue("costrictBaseUrl")
	const baseUrl = costrictBaseUrl ? costrictBaseUrl : CostrictAuthConfig.getInstance().getDefaultApiBaseUrl()
	try {
		telemetryService.register(new CostrictTelemetryClient(`${baseUrl}`, false))
		const rawStoreClient = new CostrictRawStoreClient(`${baseUrl}`, false)
		telemetryService.register(rawStoreClient)
		telemetryService.setProvider(provider)
		rawTaskReporter = new RawTaskReporter(rawStoreClient)
		rawCommitReporter = new RawCommitReporter(rawStoreClient)
	} catch (error) {
		console.warn("Failed to register Costrict telemetry clients:", error)
	}
}

export function getRawTaskReporter(): RawTaskReporter | undefined {
	return rawTaskReporter
}

export function getRawCommitReporter(): RawCommitReporter | undefined {
	return rawCommitReporter
}
