import {
	tdd as enTdd,
	projectWiki as enProjectWiki,
	generateRules as enGenerateRules,
	projectBasicAnalyze as enProjectBasicAnalyze,
	catalogueDesign as enCatalogueDesign,
	documentGenerate as enDocumentGenerate,
	indexGeneration as enIndexGeneration,
} from "./en/index.js"
import {
	tdd as zhTdd,
	projectWiki as zhProjectWiki,
	generateRules as zhGenerateRules,
	projectBasicAnalyze as zhProjectBasicAnalyze,
	catalogueDesign as zhCatalogueDesign,
	documentGenerate as zhDocumentGenerate,
	indexGeneration as zhIndexGeneration,
} from "./zh-CN/index.js"
export * from "./wikiConstants.js"

export type CommandContentFactory = (params: { workspace: string; language?: string }) => string

export type SubtaskTemplateFactory = (workspace: string) => string

export type SubtaskTemplates = Record<string, SubtaskTemplateFactory>

// Command content registry by language
const commandRegistry: Record<string, Record<string, CommandContentFactory | string>> = {
	en: {
		tdd: enTdd,
		"project-wiki": enProjectWiki,
		"generate-rules": enGenerateRules,
	},
	"zh-CN": {
		tdd: zhTdd,
		"project-wiki": zhProjectWiki,
		"generate-rules": zhGenerateRules,
	},
	"zh-TW": {
		tdd: zhTdd,
		"project-wiki": zhProjectWiki,
		"generate-rules": zhGenerateRules,
	},
}

// Subtask templates registry by language
const subtaskRegistry: Record<string, SubtaskTemplates> = {
	en: {
		"01_project-classification-agent.md": enProjectBasicAnalyze,
		"02_catalogue-design-agent.md": enCatalogueDesign,
		"03_document-generation-agent.md": enDocumentGenerate,
		"04_index-generation-agent.md": enIndexGeneration,
	},
	"zh-CN": {
		"01_project-classification-agent.md": zhProjectBasicAnalyze,
		"02_catalogue-design-agent.md": zhCatalogueDesign,
		"03_document-generation-agent.md": zhDocumentGenerate,
		"04_index-generation-agent.md": zhIndexGeneration,
	},
	"zh-TW": {
		"01_project-classification-agent.md": zhProjectBasicAnalyze,
		"02_catalogue-design-agent.md": zhCatalogueDesign,
		"03_document-generation-agent.md": zhDocumentGenerate,
		"04_index-generation-agent.md": zhIndexGeneration,
	},
}

/**
 * Register a command content factory for a specific language
 * @param slug Command slug (e.g., 'tdd', 'project-wiki')
 * @param language Language code (e.g., 'en', 'zh-CN')
 * @param content Command content factory or static string
 */
export function registerI18nCommandContent(
	slug: string,
	language: string,
	content: CommandContentFactory | string,
): void {
	if (!commandRegistry[language]) {
		commandRegistry[language] = {}
	}
	commandRegistry[language][slug] = content
}

/**
 * Register subtask templates for a specific language
 * @param language Language code (e.g., 'en', 'zh-CN')
 * @param templates Subtask templates object
 */
export function registerI18nSubtaskTemplates(language: string, templates: SubtaskTemplates): void {
	subtaskRegistry[language] = templates
}

/**
 * Resolve i18n command content
 * @param slug Command slug
 * @param language Language code (defaults to 'en')
 * @param params Parameters for content factory
 * @returns Command content string or undefined if not found
 */
export function resolveI18nCommandContent(
	slug: string,
	language: string = "en",
	params: { workspace: string },
): string | undefined {
	const langRegistry = commandRegistry[language] || commandRegistry["en"]
	if (!langRegistry) return undefined

	const content = langRegistry[slug]
	if (!content) return undefined

	if (typeof content === "function") {
		return content(params)
	}
	return content
}

/**
 * Resolve i18n subtask templates
 * @param language Language code (defaults to 'en')
 * @returns Subtask templates object or empty object if not found
 */
export function resolveI18nSubtaskTemplates(language: string = "en"): SubtaskTemplates {
	return subtaskRegistry[language] || subtaskRegistry["en"] || {}
}

/**
 * Check if a command has i18n content for a language
 * @param slug Command slug
 * @param language Language code
 */
export function hasI18nCommandContent(slug: string, language: string): boolean {
	const langRegistry = commandRegistry[language]
	if (!langRegistry) return false
	return slug in langRegistry
}

/**
 * Check if subtask templates exist for a language
 * @param language Language code
 */
export function hasI18nSubtaskTemplates(language: string): boolean {
	return language in subtaskRegistry
}
