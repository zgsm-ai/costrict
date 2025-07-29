import BaseMetrics from "./BaseMetrics"
import { Counter, Histogram, Registry } from "prom-client"
import { pick } from "lodash"
export interface CodeGenerationMetricsProperties {
	mode: string
	apiProvider: string
	modelId: string
	language: string
	userName: string
	[key: string]: string | number
}
export interface TabCompletionProperties {
	language: string
	action: string
	userName: string
	[key: string]: string | number
}
class CodeGenerationMetrics extends BaseMetrics {
	private static readonly CODE_GENERATION_FIELDS = ["mode", "apiProvider", "modelId", "language", "userName"]
	private static readonly TAB_COMPLETION_FIELDS = ["language", "action", "userName"]

	private acceptTotalCount!: Counter<string>
	private acceptLinesDistribution!: Histogram<string>
	private rejectTotalCount!: Counter<string>
	private rejectLinesDistribution!: Histogram<string>
	private completionTotalCount!: Counter<string>
	private completionLinesDistribution!: Histogram<string>
	private completionResponceTime!: Histogram<string>
	constructor(registry: Registry) {
		super(registry)
		this.init()
	}
	private init() {
		this.acceptTotalCount = this.createCounter(
			"costrict_code_accept_total",
			"Total number of code accepted",
			CodeGenerationMetrics.CODE_GENERATION_FIELDS,
		)
		this.acceptLinesDistribution = this.createHistogram(
			"costrict_code_accept_lines_distribution",
			"Distribution of code accepted lines",
			CodeGenerationMetrics.CODE_GENERATION_FIELDS,
		)
		this.rejectTotalCount = this.createCounter(
			"costrict_code_reject_total",
			"Total number of code rejected",
			CodeGenerationMetrics.CODE_GENERATION_FIELDS,
		)
		this.rejectLinesDistribution = this.createHistogram(
			"costrict_code_reject_lines_distribution",
			"Distribution of code rejected lines",
			CodeGenerationMetrics.CODE_GENERATION_FIELDS,
		)
		this.completionTotalCount = this.createCounter(
			"costrict_code_tab_completion_total",
			"Total number of code completions",
			CodeGenerationMetrics.TAB_COMPLETION_FIELDS,
		)
		this.completionLinesDistribution = this.createHistogram(
			"costrict_code_tab_completion_lines_distribution",
			"Distribution of code completion lines",
			CodeGenerationMetrics.TAB_COMPLETION_FIELDS,
		)
		this.completionResponceTime = this.createHistogram(
			"costrict_code_tab_completion_responce_time",
			"Responce time of code completion",
			CodeGenerationMetrics.TAB_COMPLETION_FIELDS,
		)
	}
	recordAccept(properties: CodeGenerationMetricsProperties, lines: number) {
		const props = pick(properties, CodeGenerationMetrics.CODE_GENERATION_FIELDS) as Pick<
			CodeGenerationMetricsProperties,
			keyof CodeGenerationMetricsProperties
		>
		this.recordAcceptTotal(props)
		this.recordAcceptLinesDistribution(Object.assign({}, props, { lines }))
	}
	recordReject(properties: CodeGenerationMetricsProperties, lines: number) {
		const props = pick(properties, CodeGenerationMetrics.CODE_GENERATION_FIELDS) as Pick<
			CodeGenerationMetricsProperties,
			keyof CodeGenerationMetricsProperties
		>
		this.recordRejectTotal(props)
		this.recordRejectLinesDistribution(Object.assign({}, props, { lines }))
	}
	recordTabCompletion(properties: TabCompletionProperties & { lines: number; responceTime: number }) {
		const props = pick(properties, CodeGenerationMetrics.TAB_COMPLETION_FIELDS) as TabCompletionProperties
		this.recordCompletionTotal(props)
		this.recordCompletionLinesDistribution(Object.assign({}, props, { lines: properties.lines }))
		this.recordCompletionResponceTime(Object.assign({}, props, { responceTime: properties.responceTime }))
	}
	recordAcceptTotal(properties: Pick<CodeGenerationMetricsProperties, keyof CodeGenerationMetricsProperties>) {
		this.acceptTotalCount.inc(properties)
	}
	recordAcceptLinesDistribution(
		properties: Pick<CodeGenerationMetricsProperties, keyof CodeGenerationMetricsProperties> & { lines: number },
	) {
		const { lines, ...props } = properties
		this.acceptLinesDistribution.observe(props, lines)
	}
	recordRejectTotal(properties: Pick<CodeGenerationMetricsProperties, keyof CodeGenerationMetricsProperties>) {
		this.rejectTotalCount.inc(properties)
	}
	recordRejectLinesDistribution(
		properties: Pick<CodeGenerationMetricsProperties, keyof CodeGenerationMetricsProperties> & { lines: number },
	) {
		const { lines, ...props } = properties
		this.rejectLinesDistribution.observe(props, lines)
	}
	recordCompletionTotal(properties: TabCompletionProperties) {
		const props = pick(properties, CodeGenerationMetrics.TAB_COMPLETION_FIELDS)
		this.completionTotalCount.inc(props)
	}
	recordCompletionLinesDistribution(properties: TabCompletionProperties & { lines: number }) {
		const props = pick(properties, CodeGenerationMetrics.TAB_COMPLETION_FIELDS)
		this.completionLinesDistribution.observe(props, properties.lines)
	}
	recordCompletionResponceTime(properties: TabCompletionProperties & { responceTime: number }) {
		const props = pick(properties, CodeGenerationMetrics.TAB_COMPLETION_FIELDS)
		this.completionResponceTime.observe(props, properties.responceTime)
	}
}

export default CodeGenerationMetrics
