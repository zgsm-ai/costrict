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
 * Mistake source - helps distinguish whether the error is model-related or environmental
 */
export type MistakeSource = "model" | "environment" | "user" | "system"

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
	/** Error source - defaults to 'model' for backward compatibility */
	source?: MistakeSource
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
}

/**
 * Mistake type weight configuration
 */
const MISTAKE_WEIGHTS: Record<MistakeType, number> = {
	[MistakeType.NO_TOOL_USE]: 0.5,
	[MistakeType.TOOL_FAILURE]: 0.5,
	[MistakeType.REPEATED_ACTION]: 0.5,
	[MistakeType.INVALID_INPUT]: 1,
	[MistakeType.TIMEOUT]: 0.5,
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

	/** Default time window: 2 minutes */
	private static readonly DEFAULT_TIME_WINDOW_MS = 2 * 60 * 1000

	/**
	 * Constructor
	 *
	 * @param timeWindowMs - Time window (milliseconds), default 2 minutes
	 */
	constructor(timeWindowMs?: number) {
		this.timeWindowMs = timeWindowMs ?? SmartMistakeDetector.DEFAULT_TIME_WINDOW_MS
	}

	/**
	 * Add mistake record
	 *
	 * @param type - Mistake type
	 * @param context - Optional context information
	 * @param severity - Severity, default is "medium"
	 * @param source - Error source, default is "model"
	 */
	addMistake(
		type: MistakeType,
		context?: string,
		severity: MistakeSeverity = "medium",
		source: MistakeSource = "model",
	): void {
		const record: MistakeRecord = {
			type,
			timestamp: Date.now(),
			context,
			severity,
			source,
		}
		this.mistakes.push(record)
		this.cleanOldMistakes()
	}

	/**
	 * Check if limit is reached
	 *
	 * Use weighted score instead of simple count for more intelligent mistake detection.
	 * Progressive warning mechanism issues warnings when reaching 50%, 75%, 90% of the threshold.
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
		} else if (scoreRatio >= 0.5) {
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
			const typeWeight = MISTAKE_WEIGHTS[mistake.type] || 0.5
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
	 * Get mistakes within the specified time period
	 *
	 * @param minutes - Time period (minutes)
	 * @returns Array of mistake records within the time period
	 */
	getMistakesInLastMinutes(minutes: number): MistakeRecord[] {
		this.cleanOldMistakes()
		const now = Date.now()
		const timeThreshold = now - minutes * 60 * 1000
		return this.mistakes.filter((m) => m.timestamp >= timeThreshold)
	}

	/**
	 * Record successful operation
	 *
	 * Used to balance error records and avoid over-sensitivity.
	 * Removes the oldest high-severity mistake record (one at a time)
	 * to gradually reduce the weighted score rather than clearing all at once.
	 */
	recordSuccess(): void {
		// Find and remove the oldest high-severity mistake (gradual reduction)
		const highIndex = this.mistakes.findIndex((m) => m.severity === "high")
		if (highIndex !== -1) {
			this.mistakes.splice(highIndex, 1)
		}
	}
}
