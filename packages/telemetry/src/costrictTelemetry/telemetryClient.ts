import { createLogger } from "@roo-code/logger"
import { type TelemetryEvent } from "@roo-code/types"
import { TelemetryControlResponse } from "./types"
import { MetricsRecorder } from "./metricsRecorder"
import { BaseCostrictApiClient } from "./baseCostrictApiClient"
import * as os from "os"
import * as path from "path"
import * as fs from "fs"

export class CostrictTelemetryClient extends BaseCostrictApiClient {
	private reportIntervalMinutes: number = 20
	private reportTimer: ReturnType<typeof setInterval> | null = null
	private metricsRecorder: MetricsRecorder
	private hasFetchedControlConfig: boolean = false

	constructor(endpoint: string, debug = false) {
		super(endpoint, debug)
		this.logger = createLogger()
		this.metricsRecorder = new MetricsRecorder()
		this.cleanupLegacyTelemetryDir()
	}
	public override async capture(event: TelemetryEvent): Promise<void> {
		if (!this.isTelemetryEnabled() || !this.isEventCapturable(event.event)) {
			if (this.debug) {
				this.logger.debug(`[CostrictTelemetryClient#capture] Skipping event: ${event.event}`)
			}
			return
		}
		const properties = await this.getEventProperties(event)
		this.metricsRecorder.record({ event: event.event, properties })
	}
	protected override async getEventProperties(event: TelemetryEvent) {
		let providerProperties: TelemetryEvent["properties"] = {}
		const { properties } = event
		const provider = this.providerRef?.deref()
		if (provider) {
			try {
				// Get properties from the provider
				providerProperties = await provider.getTelemetryProperties()
			} catch (error) {
				// Log error but continue with capturing the event.
				console.error(
					`Error getting telemetry properties: ${error instanceof Error ? error.message : String(error)}`,
				)
			}
		}
		const mergedProperties = { ...providerProperties, ...(properties || {}) }
		return mergedProperties
	}
	public override updateTelemetryState(_didUserOptIn: boolean): void {
		if (!this.hasFetchedControlConfig) {
			this.fetchTelemetryControl()
			this.hasFetchedControlConfig = true
		}
	}

	public async fetchTelemetryControl(): Promise<TelemetryControlResponse | null> {
		try {
			const headers = await this.getHeaders()
			const response = await fetch(`${this.endpoint}/user-indicator/api/v1/control`, {
				headers,
			})
			if (!response.ok) {
				this.logger.error(
					`[CostrictTelemetryClient#fetchTelemetryControl] Failed to fetch control: ${response.status}`,
				)
				return null
			}
			const data: TelemetryControlResponse = await response.json()
			this.applyTelemetryControl(data)
			return data
		} catch (error) {
			this.logger.error(
				`[CostrictTelemetryClient#fetchTelemetryControl] Error: ${error instanceof Error ? error.message : String(error)}`,
			)
			return null
		}
	}

	private applyTelemetryControl(control: TelemetryControlResponse): void {
		this.telemetryEnabled = control.enable
		if (control.reportIntervalMinutes) {
			this.reportIntervalMinutes = control.reportIntervalMinutes
		}

		if (control.enable) {
			this.startReportTimer()
		} else {
			this.stopReportTimer()
		}
	}

	private startReportTimer(): void {
		this.stopReportTimer()
		const intervalMs = this.reportIntervalMinutes * 60 * 1000
		this.reportTimer = setInterval(() => {
			this.reportMetrics()
		}, intervalMs)
	}

	private stopReportTimer(): void {
		if (this.reportTimer) {
			clearInterval(this.reportTimer)
			this.reportTimer = null
		}
	}

	private async reportMetrics(): Promise<void> {
		const metrics = this.metricsRecorder.getMetrics()
		if (metrics.length === 0) {
			return
		}
		this.logger.info(`[CostrictTelemetryClient#reportMetrics] Metrics: ${JSON.stringify(metrics)}`)
		try {
			const headers = await this.getHeaders()
			const response = await fetch(`${this.endpoint}/user-indicator/api/v1/indicators/batch-report`, {
				method: "POST",
				headers,
				body: JSON.stringify(metrics),
			})
			if (response.ok) {
				const json = await response.json()
				this.logger.info(
					`[CostrictTelemetryClient#reportMetrics] Successfully reported metrics: ${json.success}`,
				)
				this.metricsRecorder.resetValues()
			} else {
				this.logger.error(`[CostrictTelemetryClient#reportMetrics] Failed to report: ${response.status}`)
			}
		} catch (error) {
			this.logger.error(
				`[CostrictTelemetryClient#reportMetrics] Error: ${error instanceof Error ? error.message : String(error)}`,
			)
		}
	}
	private cleanupLegacyTelemetryDir(): void {
		try {
			const homeDir = os.homedir()
			const telemetryDir = path.join(homeDir, ".costrict", "telemetry")
			if (fs.existsSync(telemetryDir)) {
				fs.rmSync(telemetryDir, { recursive: true, force: true })
			}
		} catch (error) {
			this.logger.error(
				`[CostrictTelemetryClient#cleanupLegacyTelemetryDir] Error: ${error instanceof Error ? error.message : String(error)}`,
			)
		}
	}
	public override async shutdown(): Promise<void> {
		try {
			// 先推送一次数据，确保关闭前数据不丢失
			await this.reportMetrics()
		} finally {
			// 然后取消轮询定时器
			this.stopReportTimer()
		}
	}
}
