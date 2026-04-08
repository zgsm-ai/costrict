import { createLogger, ILogger } from "@roo-code/logger"
import { BaseTelemetryClient } from "../BaseTelemetryClient"
import { ClineProvider } from "../../../../src/core/webview/ClineProvider"
import { v7 as uuidv7 } from "uuid"

export abstract class BaseCostrictApiClient extends BaseTelemetryClient {
	protected logger: ILogger

	constructor(
		protected readonly endpoint: string,
		debug = false,
	) {
		super(undefined, debug)
		this.logger = createLogger()
	}

	protected getProvider(): ClineProvider | undefined {
		return this.providerRef?.deref() as ClineProvider | undefined
	}

	protected async getHeaders(): Promise<Record<string, string>> {
		const provider = this.getProvider()
		if (!provider) {
			throw new Error("Costrict provider is not available")
		}

		const { apiConfiguration } = await provider.getState()
		const { costrictAccessToken } = apiConfiguration
		if (!costrictAccessToken) {
			throw new Error("Missing costrict access token")
		}

		return {
			Authorization: `Bearer ${costrictAccessToken}`,
			"Content-Type": "application/json",
			"X-Request-ID": uuidv7(),
		}
	}

	public override async captureException(
		_error: Error,
		_additionalProperties?: Record<string, unknown>,
	): Promise<void> {
		// no-op by default
	}
}
