import type { PromptComponent } from "../../../mode.js"

import {
	planApply as zhCNPlanApply,
	plan as zhCNPlan,
	quickExplore as zhCNQuickExplore,
	subcoding as zhCNSubcoding,
	taskCheck as zhCNTaskCheck,
} from "./zh-CN/index.js"
import {
	planApply as enPlanApply,
	plan as enPlan,
	quickExplore as enQuickExplore,
	subcoding as enSubcoding,
	taskCheck as enTaskCheck,
} from "./en/index.js"

type PromptRegistry = Record<string, Record<string, PromptComponent>>

const registry: PromptRegistry = {
	"zh-CN": {
		plan: zhCNPlan,
		subcoding: zhCNSubcoding,
		"plan-apply": zhCNPlanApply,
		"quick-explore": zhCNQuickExplore,

		"task-check": zhCNTaskCheck,
	},
	en: {
		plan: enPlan,
		subcoding: enSubcoding,
		"plan-apply": enPlanApply,
		"quick-explore": enQuickExplore,
		"task-check": enTaskCheck,
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
