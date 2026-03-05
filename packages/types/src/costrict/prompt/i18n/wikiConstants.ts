import os from "os"
import path from "path"

export const PROJECT_WIKI_VERSION = "v2.0.1"
export const PROJECT_RULES_OUTPUT_FILE = "generated_rules.md"

// Safely get home directory
export function getHomeDir(): string {
	const homeDir = os.homedir()
	if (!homeDir) {
		throw new Error("Unable to determine home directory")
	}
	return homeDir
}

// Get global commands directory path
export function getGlobalCommandsDir(): string {
	return path.join(getHomeDir(), ".roo", "commands")
}

// Get subtask directory with language support
export function getSubtaskDir(language: string = "en"): string {
	return path.join(getGlobalCommandsDir(), "costrict-project-wiki-tasks", PROJECT_WIKI_VERSION, language) + path.sep
}

export const SUBTASK_FILENAMES = {
	PROJECT_CLASSIFICATION_AGENT: "01_project-classification-agent.md",
	THINK_CATALOGUE_AGENT: "02_catalogue-design-agent.md",
	DOCUMENT_GENERATION_AGENT: "03_document-generation-agent.md",
	INDEX_GENERATION_AGENT: "04_index-generation-agent.md",
} as const

export const AGENT_OUTPUT_FILENAMES = {
	PROJECT_CLASSIFICATION_AGENT: "project-classification.md",
	REPOSITORY_ANALYSIS_AGENT: "repository-analysis.md",
	THINK_CATALOGUE_AGENT: "think-catalogue.md",
	DOCUMENT_GENERATION_AGENT: "technical-documentation.md",
	INDEX_GENERATION_AGENT: "index.md",
} as const

export const MAIN_WIKI_FILENAME = "project-wiki.md"

export const WIKI_OUTPUT_FILE_PATHS = {
	STAGING_OUTPUT_DIR: ".cospec/wiki/.staging/",
	WIKI_OUTPUT_DIR: ".cospec/wiki/",
	GENERAL_RULES_OUTPUT_DIR: ".roo/rules-code/",
	PROJECT_BASIC_ANALYZE_JSON: ".cospec/wiki/.staging/basic_analyze.json",
	OUTPUT_CATALOGUE_JSON: ".cospec/wiki/.staging/catalogue.json",
	DOCUMENT_INDEX_MD: ".cospec/wiki/index.md",
} as const

export const MODE_THRESHOLDS = {
	SMALL_PROJECT: 50,
	MEDIUM_PROJECT: 200,
	LARGE_PROJECT: 201,
} as const

type LocalizedWikiPromptTexts = {
	NEW_SUBTASK: string
	COMMON_RULES: string
}

type SupportedWikiPromptLanguage = "en" | "zh-CN" | "zh-TW"

const NEW_SUBTASK_ZHCN = "创建如下 `subtask`子任务，执行，根据实际情况填充Input、Background信息："
const COMMON_RULES_ZHCN = `1. 使用\`todo_list\` 规划任务，逐个执行。
2. 严格遵循每个步骤的**输出要求**，不要遗漏任何细节。
3. 使用\`attempt_completion\`工具返回关键信息，供父任务使用。
`
const WIKI_PROMPT_TEXTS: Record<SupportedWikiPromptLanguage, LocalizedWikiPromptTexts> = {
	en: {
		NEW_SUBTASK:
			"Create the following `subtask` subtask, execute it, and populate the Input and Background information based on the actual situation:",
		COMMON_RULES: `1. Use \`todo_list\` to plan tasks, execute them one by one.
2. Strictly follow the **output requirements** of each step, do not miss any details.
3. Use the \`attempt_completion\` tool to return key information for the parent task to use.
`,
	},
	"zh-CN": {
		NEW_SUBTASK: NEW_SUBTASK_ZHCN,
		COMMON_RULES: COMMON_RULES_ZHCN,
	},
	"zh-TW": {
		NEW_SUBTASK: NEW_SUBTASK_ZHCN,
		COMMON_RULES: COMMON_RULES_ZHCN,
	},
}

const DEFAULT_WIKI_PROMPT_LANGUAGE = "en"

export type WikiPromptConstants = {
	PROJECT_WIKI_VERSION: typeof PROJECT_WIKI_VERSION
	SUBTASK_FILENAMES: typeof SUBTASK_FILENAMES
	AGENT_OUTPUT_FILENAMES: typeof AGENT_OUTPUT_FILENAMES
	MAIN_WIKI_FILENAME: typeof MAIN_WIKI_FILENAME
	WIKI_OUTPUT_FILE_PATHS: typeof WIKI_OUTPUT_FILE_PATHS
	MODE_THRESHOLDS: typeof MODE_THRESHOLDS
	NEW_SUBTASK: string
	COMMON_RULES: string
}

export function resolveI18nWikiPromptConstants(language: string = DEFAULT_WIKI_PROMPT_LANGUAGE): WikiPromptConstants {
	const resolvedLanguage: SupportedWikiPromptLanguage = (
		language in WIKI_PROMPT_TEXTS ? language : DEFAULT_WIKI_PROMPT_LANGUAGE
	) as SupportedWikiPromptLanguage
	const localizedTexts = WIKI_PROMPT_TEXTS[resolvedLanguage]

	return {
		PROJECT_WIKI_VERSION,
		SUBTASK_FILENAMES,
		AGENT_OUTPUT_FILENAMES,
		MAIN_WIKI_FILENAME,
		WIKI_OUTPUT_FILE_PATHS,
		MODE_THRESHOLDS,
		NEW_SUBTASK: localizedTexts.NEW_SUBTASK,
		COMMON_RULES: localizedTexts.COMMON_RULES,
	}
}
