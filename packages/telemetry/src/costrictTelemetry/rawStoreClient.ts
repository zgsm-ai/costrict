import { type TelemetryEvent } from "@roo-code/types"

import { BaseCostrictApiClient } from "./baseCostrictApiClient"
import { RawStoreCommitPayload, RawStoreTaskConversationPayload, RawStoreTaskSummaryPayload } from "./rawStoreTypes"

export class CostrictRawStoreClient extends BaseCostrictApiClient {
	public override async capture(_event: TelemetryEvent): Promise<void> {
		// Raw-store reporting is driven by direct method calls, not generic telemetry events.
	}

	public override updateTelemetryState(_didUserOptIn: boolean): void {
		// Raw-store reporting currently follows Costrict auth availability rather than the generic telemetry opt-in.
	}

	public override async shutdown(): Promise<void> {
		// no-op for now
	}

	public async reportTaskConversation(payload: RawStoreTaskConversationPayload): Promise<void> {
		await this.postJson("/user-indicator/api/v1/raw-store/task-conversation", payload, "task-conversation")
	}

	public async reportTaskSummary(payload: RawStoreTaskSummaryPayload): Promise<void> {
		await this.postJson("/user-indicator/api/v1/raw-store/task-summary", payload, "task-summary")
	}

	public async reportCommit(payload: RawStoreCommitPayload): Promise<void> {
		await this.postJson("/user-indicator/api/v1/raw-store/commit", payload, "commit")
	}

	private async postJson(path: string, payload: object, label: string): Promise<void> {
		if (process.env.DISABLE_USER_INDICATOR === "1") {
			throw new Error("Telemetry is disabled")
		}
		try {
			const headers = await this.getHeaders()
			const response = await fetch(`${this.endpoint}${path}`, {
				method: "POST",
				headers,
				body: JSON.stringify(payload),
			})

			if (!response.ok) {
				const responseText = await response.text().catch(() => "")
				this.logger.error(
					`[CostrictRawStoreClient#${label}] Failed with status ${response.status}${responseText ? `: ${responseText}` : ""}`,
				)
			}
		} catch (error) {
			this.logger.error(
				`[CostrictRawStoreClient#${label}] Error: ${error instanceof Error ? error.message : String(error)}`,
			)
		}
	}
}
