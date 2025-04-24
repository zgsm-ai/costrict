import i18next from "./setup"
import { changeZgsmLanguage } from "../../zgsm/src/i18n/setup"

/**
 * Initialize i18next with the specified language
 *
 * @param language The language code to use
 */
export function initializeI18n(language: string): void {
	i18next.changeLanguage(language)
	changeZgsmLanguage()
}

/**
 * Get the current language
 *
 * @returns The current language code
 */
export function getCurrentLanguage(): string {
	return i18next.language
}

/**
 * Change the current language
 *
 * @param language The language code to change to
 */
export function changeLanguage(language: string): void {
	i18next.changeLanguage(language)
	changeZgsmLanguage()
}

/**
 * Translate a string using i18next
 *
 * @param key The translation key, can use namespace with colon, e.g. "common:welcome"
 * @param options Options for interpolation or pluralization
 * @returns The translated string
 */
export function t(key: string, options?: Record<string, any>): string {
	return i18next.t(key, options)
}

export default i18next
