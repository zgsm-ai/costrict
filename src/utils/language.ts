import * as osLocale from "os-locale"
import * as vscode from "vscode"

/**
 * Language cache variable to store the obtained language result.
 * Type is Promise<string> | null, initially null indicates not fetched yet.
 */
let languageCache: Promise<string> | null = null;

/**
 * Reset the language cache. Used primarily for testing.
 */
export const resetLanguageCache = (): void => {
    languageCache = null;
};

/**
 * Get the default language for the application.
 * First checks VS Code's configured language, uses it if not English.
 * Otherwise falls back to the operating system's locale.
 * @returns Promise with the determined language string
 */
async function getDefaultLanguage(): Promise<string> {
    const vscodeLanguage = vscode.env.language;
    if (vscodeLanguage && !vscodeLanguage.toLowerCase().startsWith("en")) {
        console.log(`[language] Using VS Code language: ${vscodeLanguage}`);
        return vscodeLanguage;
    }

    const osLang = await osLocale.osLocale();
    console.log(`[language] VS Code language is English or not set, determined OS locale: ${osLang}`);
    return osLang;
}

/**
 * Cached function to get the default language.
 * If the language is not yet fetched, calls getDefaultLanguage() and caches the result.
 * Subsequent calls directly return the cached result.
 * @returns Promise with the determined language string
 */
export const defaultLang = (): Promise<string> => {
    if (!languageCache) {
        console.log("[language] Fetching default language...");
        languageCache = getDefaultLanguage();
    }

    return languageCache;
};