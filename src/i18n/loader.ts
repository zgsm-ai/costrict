import * as fs from "fs/promises"
import * as path from "path"

import i18next from "./setup"
import { ZGSM_LANGUAGES } from "../shared/language"
import { mergeLanguageResources, zgsmTranslations } from "./costrict-i18n/setup"

const loadedLanguages = new Set<string>()
const pendingLanguageLoads = new Map<string, Promise<void>>()

function isSupportedLanguage(language: string): boolean {
	return Object.keys(ZGSM_LANGUAGES).includes(language)
}

async function loadBaseLanguageResources(language: string): Promise<Record<string, any>> {
	if (process.env.NODE_ENV === "test") {
		return {}
	}

	if (!isSupportedLanguage(language)) {
		return {}
	}

	const localesDir = path.join(__dirname, "i18n", "locales")
	const langPath = path.join(localesDir, language)

	try {
		const entries = await fs.readdir(langPath, { withFileTypes: true })
		const jsonFiles = entries
			.filter((entry) => entry.isFile() && entry.name.endsWith(".json") && !entry.name.startsWith("."))
			.map((entry) => entry.name)

		const namespaces = await Promise.all(
			jsonFiles.map(async (file) => {
				const namespace = path.basename(file, ".json")
				const filePath = path.join(langPath, file)
				const content = await fs.readFile(filePath, "utf8")
				return [namespace, JSON.parse(content)] as const
			}),
		)

		return Object.fromEntries(namespaces)
	} catch (error) {
		console.error(`[i18n] Failed to load translation resources for ${language}:`, error)
		return {}
	}
}

async function ensureLanguageResources(language: string): Promise<void> {
	if (loadedLanguages.has(language)) {
		return
	}

	const existingLoad = pendingLanguageLoads.get(language)
	if (existingLoad) {
		await existingLoad
		return
	}

	const loadPromise = (async () => {
		const baseResources = await loadBaseLanguageResources(language)
		const mergedTranslations = mergeLanguageResources({ [language]: baseResources }, zgsmTranslations)
		const namespaces = mergedTranslations[language] ?? {}

		for (const [namespace, resource] of Object.entries(namespaces)) {
			i18next.addResourceBundle(language, namespace, resource, true, true)
		}

		loadedLanguages.add(language)
	})()

	pendingLanguageLoads.set(language, loadPromise)

	try {
		await loadPromise
	} finally {
		pendingLanguageLoads.delete(language)
	}
}

export async function preloadLanguages(languages: string[]): Promise<void> {
	const uniqueLanguages = Array.from(new Set(languages.filter(Boolean)))
	await Promise.all(uniqueLanguages.map((language) => ensureLanguageResources(language)))
}
