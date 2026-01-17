import { z } from "zod"

import type { Keys, Equals, AssertEqual } from "./type-fu.js"

/**
 * ExperimentId
 */

export const experimentIds = [
	"chatSearch",
	"commitReview",
	"alwaysIncludeFileDetails",
	"powerSteering",
	"multiFileApplyDiff",
	"preventFocusDisruption",
	"imageGeneration",
	"runSlashCommand",
	"multipleNativeToolCalls",
	"customTools",
	"smartMistakeDetection",
] as const

export const experimentIdsSchema = z.enum(experimentIds)

export type ExperimentId = z.infer<typeof experimentIdsSchema>

/**
 * Experiments
 */

/**
 * Smart mistake detection configuration
 */
export const smartMistakeDetectionConfigSchema = z.object({
	autoSwitchModel: z.boolean().optional(),
	autoSwitchModelThreshold: z.number().default(3),
})

export type SmartMistakeDetectionConfig = z.infer<typeof smartMistakeDetectionConfigSchema>

export const experimentsSchema = z.object({
	chatSearch: z.boolean().optional(),
	alwaysIncludeFileDetails: z.boolean().optional(),
	commitReview: z.boolean().optional(),
	powerSteering: z.boolean().optional(),
	multiFileApplyDiff: z.boolean().optional(),
	preventFocusDisruption: z.boolean().optional(),
	imageGeneration: z.boolean().optional(),
	runSlashCommand: z.boolean().optional(),
	multipleNativeToolCalls: z.boolean().optional(),
	customTools: z.boolean().optional(),
	smartMistakeDetection: z.boolean().optional(),
})

export type Experiments = z.infer<typeof experimentsSchema>

type _AssertExperiments = AssertEqual<Equals<ExperimentId, Keys<Experiments>>>

/**
 * Experiment Settings
 *
 * Separate configuration objects for experiments that need detailed settings
 */
export const experimentSettingsSchema = z.object({
	smartMistakeDetectionConfig: smartMistakeDetectionConfigSchema.optional(),
})

export type ExperimentSettings = z.infer<typeof experimentSettingsSchema>
