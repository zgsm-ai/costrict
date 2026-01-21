import { t } from "../../i18n"

/**
 * Mistake type enumeration
 */
export enum MistakeType {
	/** No tool used */
	NO_TOOL_USE = "NO_TOOL_USE",
	/** Tool execution failed */
	TOOL_FAILURE = "TOOL_FAILURE",
	/** Repeated action */
	REPEATED_ACTION = "REPEATED_ACTION",
	/** Invalid input */
	INVALID_INPUT = "INVALID_INPUT",
	/** Timeout */
	TIMEOUT = "TIMEOUT",
}

/**
 * Mistake severity
 */
export type MistakeSeverity = "low" | "medium" | "high"

/**
 * Mistake record interface
 */
export interface MistakeRecord {
	/** Mistake type */
	type: MistakeType
	/** Timestamp */
	timestamp: number
	/** Optional context information */
	context?: string
	/** Severity */
	severity: MistakeSeverity
}

/**
 * Mistake check result interface
 */
export interface MistakeCheckResult {
	/** Whether to trigger the limit */
	shouldTrigger: boolean
	/** Warning message */
	warning?: string
	/** Whether can auto recover */
	canAutoRecover?: boolean
	/** Whether should auto switch model */
	shouldAutoSwitchModel?: boolean
}

/**
 * Mistake type weight configuration
 */
const MISTAKE_WEIGHTS: Record<MistakeType, number> = {
	[MistakeType.NO_TOOL_USE]: 1,
	[MistakeType.TOOL_FAILURE]: 2,
	[MistakeType.REPEATED_ACTION]: 1.5,
	[MistakeType.INVALID_INPUT]: 1,
	[MistakeType.TIMEOUT]: 2,
}

/**
 * Severity weight configuration
 */
const SEVERITY_WEIGHTS: Record<MistakeSeverity, number> = {
	low: 0.5,
	medium: 1,
	high: 2,
}

/**
 * Smart mistake detector
 *
 * Used to monitor and track mistakes during task execution, supporting intelligent
 * mistake detection based on time window and weights.
 */
export class SmartMistakeDetector {
	/** Mistake records list */
	private mistakes: MistakeRecord[] = []

	/** Time window (milliseconds) */
	private readonly timeWindowMs: number

	/** Default time window: 10 minutes */
	private static readonly DEFAULT_TIME_WINDOW_MS = 10 * 60 * 1000

	/** Auto switch model enabled flag */
	private readonly autoSwitchModelEnabled: boolean = false

	/** Auto switch model threshold */
	private readonly autoSwitchModelThreshold: number = 3

	/**
	 * Constructor
	 *
	 * @param timeWindowMs - Time window (milliseconds), default 10 minutes
	 * @param autoSwitchModelEnabled - Enable auto switch model feature, default false
	 * @param autoSwitchModelThreshold - Threshold for auto switch model, default 3
	 */
	constructor(timeWindowMs?: number, autoSwitchModelEnabled?: boolean, autoSwitchModelThreshold?: number) {
		this.timeWindowMs = timeWindowMs ?? SmartMistakeDetector.DEFAULT_TIME_WINDOW_MS
		this.autoSwitchModelEnabled = autoSwitchModelEnabled ?? false
		this.autoSwitchModelThreshold = autoSwitchModelThreshold ?? 3
	}

	/**
	 * Add mistake record
	 *
	 * @param type - Mistake type
	 * @param context - Optional context information
	 * @param severity - Severity, default is "medium"
	 */
	addMistake(type: MistakeType, context?: string, severity: MistakeSeverity = "medium"): void {
		const record: MistakeRecord = {
			type,
			timestamp: Date.now(),
			context,
			severity,
		}
		this.mistakes.push(record)
		this.cleanOldMistakes()
	}

	/**
	 * Check if limit is reached
	 *
	 * Use weighted score instead of simple count for more intelligent mistake detection.
	 * Progressive warning mechanism issues warnings when reaching 40%, 75%, 90% of the threshold.
	 *
	 * @param baseLimit - Base limit count
	 * @returns Check result, including whether to trigger, warning message, and whether auto recovery is possible
	 */
	checkLimit(baseLimit: number): MistakeCheckResult {
		this.cleanOldMistakes()

		const weightedScore = this.calculateWeightedScore()
		const currentCount = this.mistakes.length

		// Use weighted score as the basis for checking
		const scoreRatio = weightedScore / baseLimit

		// Progressive warnings
		if (scoreRatio >= 0.9) {
			return {
				shouldTrigger: true,
				warning: t("common:smartMistakeDetector.errorCountNearLimit", {
					count: currentCount,
					weightedScore: weightedScore.toFixed(1),
					baseLimit: baseLimit.toFixed(1),
				}),
				canAutoRecover: this.canAutoRecover(),
			}
		} else if (scoreRatio >= 0.75) {
			return {
				shouldTrigger: false,
				warning: t("common:smartMistakeDetector.warningHighErrorCount", {
					count: currentCount,
					weightedScore: weightedScore.toFixed(1),
					baseLimit: baseLimit.toFixed(1),
				}),
				canAutoRecover: this.canAutoRecover(),
			}
		} else if (scoreRatio >= 0.4) {
			return {
				shouldTrigger: false,
				warning: t("common:smartMistakeDetector.multipleErrorsDetected", {
					count: currentCount,
				}),
				canAutoRecover: this.canAutoRecover(),
			}
		}

		return {
			shouldTrigger: false,
			canAutoRecover: true,
		}
	}

	/**
	 * Clear mistake records
	 */
	clear(): void {
		this.mistakes = []
	}

	/**
	 * Get current mistake count
	 *
	 * @returns Current mistake count within the time window
	 */
	getCurrentCount(): number {
		this.cleanOldMistakes()
		return this.mistakes.length
	}

	/**
	 * Get mistake analysis text
	 *
	 * @returns Mistake analysis report
	 */
	getAnalysis(): string {
		this.cleanOldMistakes()

		if (this.mistakes.length === 0) {
			return t("common:smartMistakeDetector.noErrorRecords")
		}

		const now = Date.now()
		const timeRange = now - this.mistakes[0].timestamp
		const timeRangeMinutes = (timeRange / 60000).toFixed(1)

		// Count by type
		const typeCounts: Record<string, number> = {}
		const severityCounts: Record<string, number> = {}

		for (const mistake of this.mistakes) {
			typeCounts[mistake.type] = (typeCounts[mistake.type] || 0) + 1
			severityCounts[mistake.severity] = (severityCounts[mistake.severity] || 0) + 1
		}

		const weightedScore = this.calculateWeightedScore()

		let analysis = t("common:smartMistakeDetector.errorAnalysisReport", {
			minutes: timeRangeMinutes,
		})
		analysis += t("common:smartMistakeDetector.totalErrorCount", {
			count: this.mistakes.length,
		})
		analysis += t("common:smartMistakeDetector.weightedScore", {
			score: weightedScore.toFixed(1),
		})
		analysis += t("common:smartMistakeDetector.errorTypeDistribution")

		for (const [type, count] of Object.entries(typeCounts)) {
			analysis += t("common:smartMistakeDetector.errorTypeItem", {
				type,
				count,
			})
		}

		analysis += t("common:smartMistakeDetector.severityDistribution")
		for (const [severity, count] of Object.entries(severityCounts)) {
			analysis += t("common:smartMistakeDetector.severityItem", {
				severity,
				count,
			})
		}

		return analysis
	}

	/**
	 * Clean up expired mistake records
	 *
	 * Remove mistake records outside the time window
	 */
	private cleanOldMistakes(): void {
		const now = Date.now()
		this.mistakes = this.mistakes.filter((m) => now - m.timestamp <= this.timeWindowMs)
	}

	/**
	 * Calculate weighted score
	 *
	 * Calculate weighted score based on mistake type and severity
	 *
	 * @returns Weighted score
	 */
	private calculateWeightedScore(): number {
		return this.mistakes.reduce((score, mistake) => {
			const typeWeight = MISTAKE_WEIGHTS[mistake.type] || 1
			const severityWeight = SEVERITY_WEIGHTS[mistake.severity] || 1
			return score + typeWeight * severityWeight
		}, 0)
	}

	/**
	 * Check if auto recovery is possible
	 *
	 * Determine if auto recovery is possible based on mistake types and severity.
	 * If mistakes are mainly composed of low severity mistakes, auto recovery is considered possible.
	 *
	 * @returns Whether auto recovery is possible
	 */
	private canAutoRecover(): boolean {
		if (this.mistakes.length === 0) {
			return true
		}

		// Count the ratio of high severity mistakes
		const highSeverityCount = this.mistakes.filter((m) => m.severity === "high").length
		const highSeverityRatio = highSeverityCount / this.mistakes.length

		// If high severity mistakes exceed 50%, auto recovery is considered not possible
		return highSeverityRatio < 0.5
	}

	/**
	 * Get mistake count of specific type
	 *
	 * @param type - Mistake type
	 * @returns Mistake count of this type
	 */
	getMistakeCountByType(type: MistakeType): number {
		this.cleanOldMistakes()
		return this.mistakes.filter((m) => m.type === type).length
	}

	/**
	 * Get mistake count of specific severity
	 *
	 * @param severity - Severity
	 * @returns Mistake count of this severity
	 */
	getMistakeCountBySeverity(severity: MistakeSeverity): number {
		this.cleanOldMistakes()
		return this.mistakes.filter((m) => m.severity === severity).length
	}

	/**
	 * Check if should auto switch model
	 *
	 * Determine if model should be automatically switched based on consecutive mistake count.
	 * This method should be called when consecutiveMistakeCount exceeds the configured threshold.
	 *
	 * @param consecutiveMistakeCount - Current consecutive mistake count from task
	 * @returns Whether model should be switched
	 */
	shouldAutoSwitchModel(consecutiveMistakeCount: number): boolean {
		if (!this.autoSwitchModelEnabled) {
			return false
		}
		return consecutiveMistakeCount >= this.autoSwitchModelThreshold
	}
}
