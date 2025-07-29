import { Counter, Registry } from "prom-client"
import BaseMetrics from "./BaseMetrics"
import { pick } from "lodash"
export interface ErrorMetricsProperties {
	error_type: string
	[key: string]: string | number
}
export default class ErrorMetrics extends BaseMetrics {
	private errorCount!: Counter<string>
	constructor(registry: Registry) {
		super(registry)
		this.init()
	}
	private init() {
		this.errorCount = this.createCounter("costrict_error_count", "Total number of errors", ["error_type"])
	}
	recordError(properties: ErrorMetricsProperties) {
		const props = pick(properties, ["error_type"]) as Pick<ErrorMetricsProperties, keyof ErrorMetricsProperties>
		this.errorCount.inc(props)
	}
}
