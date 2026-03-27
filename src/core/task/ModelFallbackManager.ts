import { getModelsFromCache } from "../../api/providers/fetchers/modelCache"
import { zgsmModelsConfig, getModelId, type ProviderSettings } from "@roo-code/types"
import { buildApiHandler, type ApiHandler } from "../../api"

/**
 * Failure record for a model
 */
interface ModelFailureRecord {
	/** Number of consecutive failures */
	consecutiveFailures: number
	/** Timestamp of the last failure */
	lastFailureTime: number
	/** Timestamp when the model entered cooldown */
	cooldownUntil?: number
}

/**
 * Fallback event for logging/notification
 */
export interface FallbackEvent {
	fromModel: string
	toModel: string
	reason: string
	timestamp: number
}

/**
 * ModelFallbackManager - Manages temporary model switching for resilience.
 *
 * Key design principles:
 * 1. NEVER modifies the user's persistent ProviderProfile/apiConfiguration.
 * 2. Only provides a temporary ApiHandler override for the current request.
 * 3. Automatically attempts to restore the primary model after successful fallback requests.
 * 4. Maintains per-model failure tracking with cooldown periods.
 */
export class ModelFallbackManager {
	/** The user's originally selected model ID (never modified) */
	private primaryModelId: string

	/** The model currently being used for requests (may differ from primary during fallback) */
	private activeModelId: string

	/** Per-model failure tracking */
	private failureRecords: Map<string, ModelFailureRecord> = new Map()

	/** Number of consecutive successful requests on the fallback model */
	private fallbackSuccessCount: number = 0

	/** How many successful fallback requests before attempting to probe the primary model */
	private readonly probeAfterSuccessCount: number = 3

	/** Cooldown duration for a failed model (ms) - default 5 minutes */
	private readonly modelCooldownMs: number = 5 * 60 * 1000

	/** Minimum consecutive failures before triggering fallback */
	private readonly failureThreshold: number = 3

	/** Whether fallback is currently active */
	private _isFallbackActive: boolean = false

	/** History of fallback events for debugging */
	private fallbackHistory: FallbackEvent[] = []

	/** Maximum fallback history entries to keep */
	private readonly maxHistoryEntries: number = 20

	/** The base apiConfiguration from the user */
	private baseApiConfiguration: ProviderSettings

	constructor(apiConfiguration: ProviderSettings) {
		this.baseApiConfiguration = apiConfiguration
		this.primaryModelId = getModelId(apiConfiguration) || ""
		this.activeModelId = this.primaryModelId
	}

	/**
	 * Update the base API configuration when user switches provider profiles.
	 * This ensures buildFallbackApiHandler() uses the latest configuration.
	 *
	 * @param newApiConfiguration - The updated API configuration
	 */
	updateConfiguration(newApiConfiguration: ProviderSettings): void {
		this.baseApiConfiguration = newApiConfiguration
		this.primaryModelId = getModelId(newApiConfiguration) || ""
		this.activeModelId = this.primaryModelId
		// Note: primaryModelId is readonly and should not change during profile switches
		// If the user wants to change the primary model, they should create a new manager
	}

	/**
	 * Whether fallback mode is currently active (using a non-primary model).
	 */
	get isFallbackActive(): boolean {
		return this._isFallbackActive
	}

	/**
	 * Get the model ID currently being used for requests.
	 */
	get currentModelId(): string {
		return this.activeModelId
	}

	/**
	 * Get the user's originally selected model ID.
	 */
	get userSelectedModelId(): string {
		return this.primaryModelId
	}

	/**
	 * Record a failed request for the current active model.
	 * If failures exceed the threshold, triggers fallback.
	 *
	 * @param error - The error that occurred
	 * @param errorCategory - Category of the error for smarter decisions
	 * @returns Whether a fallback switch was performed
	 */
	recordFailure(
		error?: any,
		errorCategory?: "network" | "rate_limit" | "server_error" | "tool_error" | "other",
	): boolean {
		const modelId = this.activeModelId
		const record = this.getOrCreateRecord(modelId)
		record.consecutiveFailures++
		record.lastFailureTime = Date.now()

		// Check if we should trigger fallback
		if (record.consecutiveFailures >= this.failureThreshold) {
			return this.tryFallback(
				`${record.consecutiveFailures} consecutive failures (${errorCategory || "unknown"})`,
			)
		}

		return false
	}

	/**
	 * Record a successful request for the current active model.
	 * Resets failure counters and potentially restores the primary model.
	 *
	 * @returns Whether the primary model was restored
	 */
	recordSuccess(): boolean {
		const modelId = this.activeModelId

		// Reset failure counter for the current model
		const record = this.failureRecords.get(modelId)
		if (record) {
			record.consecutiveFailures = 0
		}

		if (!this._isFallbackActive) {
			return false
		}

		// We're on a fallback model — track success and probe primary periodically
		this.fallbackSuccessCount++

		if (this.fallbackSuccessCount >= this.probeAfterSuccessCount) {
			// Check if primary model's cooldown has expired
			const primaryRecord = this.failureRecords.get(this.primaryModelId)
			if (!primaryRecord?.cooldownUntil || Date.now() >= primaryRecord.cooldownUntil) {
				this.restorePrimary("Fallback stable, probing primary model")
				return true
			}
			// Reset counter to try again later
			this.fallbackSuccessCount = 0
		}

		return false
	}

	/**
	 * Build a temporary ApiHandler that uses the current active (possibly fallback) model.
	 * If no fallback is active, returns undefined (caller should use the default handler).
	 *
	 * This is the KEY method — it creates a transient handler without modifying
	 * the user's persistent configuration.
	 */
	buildFallbackApiHandler(): (ApiHandler & Record<string, any>) | undefined {
		if (!this._isFallbackActive) {
			return undefined
		}

		// Create a shallow copy of the config with the fallback model ID
		const fallbackConfig: ProviderSettings = {
			...this.baseApiConfiguration,
			zgsmModelId: this.activeModelId,
		}

		return buildApiHandler(fallbackConfig) as ApiHandler & Record<string, any>
	}

	/**
	 * Get a display string describing the current fallback state.
	 */
	getFallbackStatusMessage(): string | undefined {
		if (!this._isFallbackActive) {
			return undefined
		}
		return `${this.primaryModelId} --> ${this.activeModelId}`
	}

	/**
	 * Force restore the primary model immediately (e.g., user manually intervenes).
	 */
	forceRestorePrimary(): void {
		if (this._isFallbackActive) {
			this.restorePrimary("Force restored by user/system")
		}
	}

	/**
	 * Reset all state. Called when a new task conversation starts or user changes model.
	 */
	reset(): void {
		this.activeModelId = this.primaryModelId
		this._isFallbackActive = false
		this.fallbackSuccessCount = 0
		this.failureRecords.clear()
		this.fallbackHistory = []
	}

	/**
	 * Get the fallback event history for debugging.
	 */
	getHistory(): readonly FallbackEvent[] {
		return this.fallbackHistory
	}

	// ─── Private Methods ────────────────────────────────────────────────

	/**
	 * Attempt to switch to a fallback model.
	 * @returns true if switch succeeded, false if no suitable fallback found
	 */
	private tryFallback(reason: string): boolean {
		const fallbackModelId = this.selectFallbackModel()
		if (!fallbackModelId) {
			return false
		}

		// Put the current model on cooldown
		const currentRecord = this.getOrCreateRecord(this.activeModelId)
		currentRecord.cooldownUntil = Date.now() + this.modelCooldownMs

		const fromModel = this.activeModelId
		this.activeModelId = fallbackModelId
		this._isFallbackActive = true
		this.fallbackSuccessCount = 0

		// Log the event
		this.addHistoryEvent({
			fromModel,
			toModel: fallbackModelId,
			reason,
			timestamp: Date.now(),
		})

		return true
	}

	/**
	 * Select the best fallback model from the available model cache.
	 *
	 * Strategy (in order of priority):
	 * 1. Exclude the current active model
	 * 2. Exclude models currently on cooldown
	 * 3. Prefer models with context window >= current model's
	 * 4. Sort by creditConsumption (cheapest first), then contextWindow (largest first)
	 * 5. Pick the first candidate (deterministic, not random)
	 */
	private selectFallbackModel(): string | undefined {
		const models = getModelsFromCache("zgsm") || {}
		const now = Date.now()

		const currentModelInfo = models[this.activeModelId]
		const currentContextWindow = currentModelInfo?.contextWindow ?? zgsmModelsConfig.default.contextWindow

		const candidates = Object.entries(models)
			.filter(([modelId]) => {
				// Exclude current model
				if (modelId === this.activeModelId) {
					return false
				}
				// Exclude models on cooldown
				const record = this.failureRecords.get(modelId)
				if (record?.cooldownUntil && now < record.cooldownUntil) {
					return false
				}
				return true
			})
			.filter(([, info]) => {
				// Prefer models with adequate context window
				return (info.contextWindow ?? 0) >= currentContextWindow
			})
			.sort(([, a], [, b]) => {
				// Sort by creditConsumption ascending, then contextWindow descending
				const costA = a.creditConsumption ?? Infinity
				const costB = b.creditConsumption ?? Infinity
				if (costA !== costB) {
					return costA - costB
				}
				return (b.contextWindow ?? 0) - (a.contextWindow ?? 0)
			})

		// If no candidates with adequate context window, relax the constraint
		if (candidates.length === 0) {
			const relaxedCandidates = Object.entries(models)
				.filter(([modelId]) => {
					if (modelId === this.activeModelId) {
						return false
					}
					const record = this.failureRecords.get(modelId)
					if (record?.cooldownUntil && now < record.cooldownUntil) {
						return false
					}
					return true
				})
				.sort(([, a], [, b]) => {
					const costA = a.creditConsumption ?? Infinity
					const costB = b.creditConsumption ?? Infinity
					if (costA !== costB) {
						return costA - costB
					}
					return (b.contextWindow ?? 0) - (a.contextWindow ?? 0)
				})

			return relaxedCandidates[0]?.[0]
		}

		return candidates[0]?.[0]
	}

	/**
	 * Restore the primary model as the active model.
	 */
	private restorePrimary(reason: string): void {
		const fromModel = this.activeModelId
		this.activeModelId = this.primaryModelId
		this._isFallbackActive = false
		this.fallbackSuccessCount = 0

		// Clear primary model's failure record so it starts fresh
		this.failureRecords.delete(this.primaryModelId)

		this.addHistoryEvent({
			fromModel,
			toModel: this.primaryModelId,
			reason,
			timestamp: Date.now(),
		})
	}

	private getOrCreateRecord(modelId: string): ModelFailureRecord {
		let record = this.failureRecords.get(modelId)
		if (!record) {
			record = { consecutiveFailures: 0, lastFailureTime: 0 }
			this.failureRecords.set(modelId, record)
		}
		return record
	}

	private addHistoryEvent(event: FallbackEvent): void {
		this.fallbackHistory.push(event)
		if (this.fallbackHistory.length > this.maxHistoryEntries) {
			this.fallbackHistory.shift()
		}
	}
}
