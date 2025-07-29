import { Registry } from "prom-client"
import { TelemetryEvent, TelemetryEventName } from "@roo-code/types"
import CodeGenerationMetrics, {
	CodeGenerationMetricsProperties,
	TabCompletionProperties,
} from "./CodeGenerationMetrics"
import ErrorMetrics, { ErrorMetricsProperties } from "./ErrorMetrics"

export default class MetricsRecorder {
	private registry: Registry
	private codeGenerationMetrics!: CodeGenerationMetrics
	private errorMetrics!: ErrorMetrics
	constructor(registry: Registry) {
		this.registry = registry
		this.createMetrics(registry)
	}
	private createMetrics(registry: Registry) {
		this.codeGenerationMetrics = new CodeGenerationMetrics(registry)
		this.errorMetrics = new ErrorMetrics(registry)
	}
	public record(event: TelemetryEvent) {
		const { properties } = event
		switch (event.event) {
			case TelemetryEventName.CODE_ACCEPT:
				this.codeGenerationMetrics.recordAccept(
					properties as CodeGenerationMetricsProperties,
					Number(properties?.lines) || 0,
				)
				break
			case TelemetryEventName.CODE_REJECT:
				this.codeGenerationMetrics.recordReject(
					properties as CodeGenerationMetricsProperties,
					Number(properties?.lines) || 0,
				)
				break
			case TelemetryEventName.CODE_TAB_COMPLETION:
				this.codeGenerationMetrics.recordTabCompletion(
					properties as TabCompletionProperties & { lines: number; responceTime: number },
				)
				break
			case TelemetryEventName.ERROR:
				this.errorMetrics.recordError(properties as ErrorMetricsProperties)
				break
			default:
				break
		}
	}
}
