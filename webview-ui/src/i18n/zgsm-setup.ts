// Build zgsm translations object
export const zgsmTranslations: Record<string, Record<string, any>> = {}

// Dynamically load zgsm locale files
const zgsmLocaleFiles = import.meta.glob("./zgsm_locales/**/*.json", { eager: true })

// Process all zgsm locale files
Object.entries(zgsmLocaleFiles).forEach(([path, module]) => {
	// Extract language and namespace from path
	// Example path: './zgsm_locales/en/common.json' -> language: 'en', namespace: 'common'
	const match = path.match(/\.\/zgsm_locales\/([^/]+)\/([^/]+)\.json/)

	if (match) {
		const [, language, namespace] = match

		// Initialize language object if it doesn't exist
		if (!zgsmTranslations[language]) {
			zgsmTranslations[language] = {}
		}

		// Add namespace resources to language
		zgsmTranslations[language][namespace] = (module as any).default || module
	}
})

console.log("Dynamically loaded zgsm translations:", Object.keys(zgsmTranslations))

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
	zgsmTranslations: Record<string, any>,
): Record<string, any> => {
	const mergedTranslations: Record<string, any> = {}

	// Merge zgsm translations
	for (const language in zgsmTranslations) {
		if (!mergedTranslations[language]) {
			mergedTranslations[language] = {}
		}

		for (const namespace in zgsmTranslations[language]) {
			const currentContent = currentTranslations[language]?.[namespace] || {}
			const zgsmContent = zgsmTranslations[language][namespace]

			mergedTranslations[language][namespace] = mergeTranslations(currentContent, zgsmContent)
		}
	}

	// Add current translations that don't exist in zgsm
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