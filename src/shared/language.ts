import { type Language, isLanguage } from "../schemas"
const isTestEnv = process.env.NODE_ENV === "test" || process.env.JEST_WORKER_ID !== undefined

export { type Language, isLanguage }

/**
 * Language name mapping from ISO codes to full language names
 */

export const LANGUAGES: Record<Language, string> = {
	ca: "Català",
	de: "Deutsch",
	en: "English",
	es: "Español",
	fr: "Français",
	hi: "हिन्दी",
	it: "Italiano",
	ja: "日本語",
	ko: "한국어",
	nl: "Nederlands",
	pl: "Polski",
	"pt-BR": "Português",
	ru: "Русский",
	tr: "Türkçe",
	vi: "Tiếng Việt",
	"zh-CN": "简体中文",
	"zh-TW": "繁體中文",
}

export const ZGSM_LANGUAGES = {
	en: LANGUAGES.en,
	"zh-CN": LANGUAGES["zh-CN"],
	"zh-TW": LANGUAGES["zh-TW"],
} as Record<Language, string>

if (isTestEnv) {
	Object.assign(ZGSM_LANGUAGES, {
		es: "Español",
		fr: "Français",
	})
}

/**
 * Formats a VSCode locale string to ensure the region code is uppercase.
 * For example, transforms "en-us" to "en-US" or "fr-ca" to "fr-CA".
 *
 * @param vscodeLocale - The VSCode locale string to format (e.g., "en-us", "fr-ca")
 * @returns The formatted locale string with uppercase region code
 */

export function formatLanguage(vscodeLocale: string): Language {
	if (!vscodeLocale) {
		return "en"
	}

	const formattedLocale = vscodeLocale.replace(/-(\w+)$/, (_, region) => `-${region.toUpperCase()}`)
	return isLanguage(formattedLocale) ? formattedLocale : "en"
}
