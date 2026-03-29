// Build CoStrict translations object
export const costrictTranslations: Record<string, Record<string, any>> = {}

// Dynamically load CoStrict locale files
const costrictLocaleFiles = import.meta.glob("./locales/**/*.json", { eager: true })

// Process all CoStrict locale files
Object.entries(costrictLocaleFiles).forEach(([path, module]) => {
	// Extract language and namespace from path
	// Example path: './locales/en/common.json' -> language: 'en', namespace: 'common'
	const match = path.match(/\.\/locales\/([^/]+)\/([^/]+)\.json/)

	if (match) {
		const [, language, namespace] = match

		// Initialize language object if it doesn't exist
		if (!costrictTranslations[language]) {
			costrictTranslations[language] = {}
		}

		// Add namespace resources to language
		costrictTranslations[language][namespace] = (module as any).default || module
	}
})

// console.log("Dynamically loaded CoStrict translations:", Object.keys(costrictTranslations))

// Merge translations function
const mergeTranslations = (base: Record<string, any>, override: Record<string, any>): Record<string, any> => {
	const result = { ...base }
	for (const key in override) {
		if (typeof override[key] === "object" && override[key] !== null && !Array.isArray(override[key])) {
			result[key] = mergeTranslations(result[key] || {}, override[key])
		} else {
			result[key] = override[key]
		}
	}
	return result
}

export const mergeLanguageResources = (
	currentTranslations: Record<string, any>,
	costrictTranslations: Record<string, any>,
): Record<string, any> => {
	const mergedTranslations: Record<string, any> = {}

	// Merge CoStrict translations
	for (const language in costrictTranslations) {
		if (!mergedTranslations[language]) {
			mergedTranslations[language] = {}
		}

		for (const namespace in costrictTranslations[language]) {
			const currentContent = currentTranslations[language]?.[namespace] || {}
			const costrictContent = costrictTranslations[language][namespace]

			mergedTranslations[language][namespace] = mergeTranslations(currentContent, costrictContent)
		}
	}

	// Add current translations that don't exist in CoStrict
	for (const language in currentTranslations) {
		if (!mergedTranslations[language]) {
			mergedTranslations[language] = currentTranslations[language]
		} else {
			for (const namespace in currentTranslations[language]) {
				if (!mergedTranslations[language][namespace]) {
					mergedTranslations[language][namespace] = currentTranslations[language][namespace]
				}
			}
		}
	}

	return mergedTranslations
}
