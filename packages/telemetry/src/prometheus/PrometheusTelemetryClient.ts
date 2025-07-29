import { Pushgateway, Registry } from "prom-client"
import delay from "delay"
import crypto from "crypto"
import retry from "async-retry"

import { type TelemetryEvent } from "@roo-code/types"

import { BaseTelemetryClient } from "../BaseTelemetryClient"
import MetricsRecorder from "./metrics"
import { createLogger, ILogger } from "../../../../src/utils/logger"
import { getWorkspacePath } from "../../../../src/utils/path"
import { Package } from "../../../../src/shared/package"
import { ClineProvider } from "../../../../src/core/webview/ClineProvider"

export class PrometheusTelemetryClient extends BaseTelemetryClient {
	private endpoint: string
	private registry: Registry
	private metricsRecorder: MetricsRecorder
	private logger: ILogger
	constructor(endpoint: string, debug = false) {
		super(undefined, debug)
		this.endpoint = endpoint
		this.logger = createLogger(Package.outputChannel)
		this.registry = new Registry()
		this.metricsRecorder = new MetricsRecorder(this.registry)
		this.setupPush()
		this.updateTelemetryState(true)
	}
	private hashWorkspaceDir() {
		return crypto.createHash("sha256").update(getWorkspacePath()).digest("hex").toString().slice(0, 8)
	}
	private async setupPush() {
		const times = 60 * 60 * 1000
		setInterval(async () => {
			try {
				if (this.debug) {
					this.logger.debug(`[PrometheusTelemetryClient#push] Pushing metrics`)
				}
				await delay(Math.random() * 1000)
				await this.pushAdd()
			} catch (error) {
				this.logger.error(`[PrometheusTelemetryClient#push] ${error}`)
			}
		}, times)
	}
	// 实现一个立即 push 的方法
	public async pushAdd() {
		const provider = this.providerRef?.deref() as unknown as ClineProvider
		const { apiConfiguration } = await provider.getState()
		const { zgsmAccessToken } = apiConfiguration
		const client = new Pushgateway(
			this.endpoint,
			{
				headers: {
					Authorization: `Bearer ${zgsmAccessToken}`,
				},
			},
			this.registry,
		)
		await retry(
			async () => {
				await client.pushAdd({
					jobName: "costrict",
					groupings: {
						instance: this.hashWorkspaceDir(),
					},
				})
			},
			{ retries: 3 },
		)
	}

	public override async capture(event: TelemetryEvent): Promise<void> {
		if (!this.isTelemetryEnabled() || !this.isEventCapturable(event.event)) {
			if (this.debug) {
				this.logger.debug(`[PrometheusTelemetryClient#capture] Skipping event: ${event.event}`)
			}
			return
		}
		try {
			const properties = await this.getEventProperties(event)
			this.metricsRecorder.record({
				event: event.event,
				properties,
			})
			if (this.debug) {
				this.logger.debug(`[PrometheusTelemetryClient#capture] ${event.event}`)
			}
		} catch (error) {
			if (this.debug) {
				this.logger.error(`[PrometheusTelemetryClient#capture] ${error}`)
			}
		}
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
		this.telemetryEnabled = true
	}
	public override shutdown(): Promise<void> {
		return new Promise((resolve, reject) => {
			this.pushAdd()
				.then(() => {
					resolve()
				})
				.catch((error) => {
					reject(error)
				})
		})
	}
}
