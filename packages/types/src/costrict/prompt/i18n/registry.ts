import type { PromptComponent } from "../../../mode.js"

import {
	planApply as zhCNPlanApply,
	plan as zhCNPlan,
	quickExplore as zhCNQuickExplore,
	requirements as zhCNRequirements,
	spec as zhCNSpec,
	subcoding as zhCNSubcoding,
	taskCheck as zhCNTaskCheck,
	task as zhCNTask,
	design as zhCNDesign,
} from "./zh-CN/index.js"
import {
	planApply as enPlanApply,
	plan as enPlan,
	quickExplore as enQuickExplore,
	requirements as enRequirements,
	spec as enSpec,
	subcoding as enSubcoding,
	taskCheck as enTaskCheck,
	task as enTask,
	design as enDesign,
} from "./en/index.js"

type PromptRegistry = Record<string, Record<string, PromptComponent>>

const registry: PromptRegistry = {
	"zh-CN": {
		plan: zhCNPlan,
		subcoding: zhCNSubcoding,
		"plan-apply": zhCNPlanApply,
		"quick-explore": zhCNQuickExplore,
		requirements: zhCNRequirements,
		"task-check": zhCNTaskCheck,
		task: zhCNTask,
		strict: zhCNSpec,
		design: zhCNDesign,
	},
	"zh-TW": {
		plan: zhCNPlan,
		subcoding: zhCNSubcoding,
		"plan-apply": zhCNPlanApply,
		"quick-explore": zhCNQuickExplore,
		requirements: zhCNRequirements,
		"task-check": zhCNTaskCheck,
		task: zhCNTask,
		strict: zhCNSpec,
		design: zhCNDesign,
	},
	en: {
		plan: enPlan,
		subcoding: enSubcoding,
		"plan-apply": enPlanApply,
		"quick-explore": enQuickExplore,
		requirements: enRequirements,
		"task-check": enTaskCheck,
		task: enTask,
		strict: enSpec,
		design: enDesign,
	},
	// Future model dimension: simply append "zh-CN_claude": { ... }
}

// modelFamily parameter is undefined for now, interface is reserved for future use
export function resolveI18nPrompt(
	modeSlug: string,
	language?: string,
	modelFamily?: string, // Reserved: will work automatically when passed in future, no modification needed
): PromptComponent | undefined {
	// Priority: language_modelFamily → language → modelFamily
	if (language && modelFamily) {
		const hit = registry[`${language}_${modelFamily}`]?.[modeSlug]
		if (hit) return hit
	}
	if (language) {
		return registry[language]?.[modeSlug]
	}
	if (modelFamily) {
		return registry[modelFamily]?.[modeSlug]
	}
	return undefined
}
