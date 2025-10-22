import * as os from "os"
import * as path from "path"

export const PROJECT_WIKI_VERSION = "v2.0.0"
export const WIKI_OUTPUT_DIR = path.join(".cospec", "wiki") + path.sep
export const GENERAL_RULES_OUTPUT_DIR = path.join(".roo", "rules") + path.sep

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

export function formatError(error: unknown): string {
	if (error instanceof Error) {
		return error.stack || error.message
	}
	return String(error)
}

// v2 Agent文件名常量
export const AGENT_FILENAMES = {
	PROJECT_CLASSIFICATION_AGENT: "project-classification-agent.md",
	REPOSITORY_ANALYSIS_AGENT: "repository-analysis-agent.md",
	THINK_CATALOGUE_AGENT: "generate-think-catalogue-template.md",
	DOCUMENT_GENERATION_AGENT: "document-generation-agent.md",
	INDEX_GENERATION_AGENT: "index-generation-agent.md",
	MINDMAP_GENERATION_AGENT: "mindmap-generation-agent.md",
} as const

// v2 Agent输出文件名常量
export const AGENT_OUTPUT_FILENAMES = {
	PROJECT_CLASSIFICATION_AGENT: "project-classification.md",
	REPOSITORY_ANALYSIS_AGENT: "repository-analysis.md",
	THINK_CATALOGUE_AGENT: "think-catalogue.md",
	DOCUMENT_GENERATION_AGENT: "technical-documentation.md",
	INDEX_GENERATION_AGENT: "index.md",
	MINDMAP_GENERATION_AGENT: "mindmap.json",
} as const

// 主文件名
export const MAIN_WIKI_FILENAME = "project-wiki.md"

// v2 上下文管理常量
export const CONTEXT_VARIABLES = {
	WORKSPACE: "{{workspace}}",
	PROJECT_NAME: "{{project_name}}",
	PROJECT_TYPE: "{{project_type}}",
	CATALOGUE: "{{$catalogue}}",
	README: "{{$readme}}",
	FILE_CONTENT: "{{$file_content}}",
	ANALYSIS_RESULT: "{{$analysis_result}}",
	DOCUMENT_CONTENT: "{{$document_content}}",
	PROJECT_CLASSIFICATION: "{{$project_classification}}",
	REPOSITORY_ANALYSIS: "{{$repository_analysis}}",
	GIT_REPOSITORY: "{{$git_repository}}",
	GIT_BRANCH: "{{$branch}}",
	CODE_FILES: "{{$code_files}}",
	TITLE: "{{$title}}",
	PROMPT: "{{$prompt}}",
	ANALYSIS_CONTEXT: "{{$analysis_context}}",
	REPOSITORY_NAME: "{{$repository_name}}",
	GIT_CHANGES: "{{$git_changes}}",
	ANALYSIS_STRATEGY: "{{$analysis_strategy}}",
	PROJECT_INFO: "{{$project_info}}",
	FILE_STRUCTURE: "{{$file_structure}}",
	CONFIGURATION_FILES: "{{$configuration_files}}",
} as const

// v2 Agent执行顺序
export const AGENT_EXECUTION_ORDER = [
	"ProjectClassificationAgent",
	"RepositoryAnalysisAgent",
	"ThinkCatalogueAgent",
	"DocumentGenerationAgent",
	"IndexGenerationAgent",
	"MindmapGenerationAgent"
] as const

// v2 模式选择阈值
export const MODE_THRESHOLDS = {
	SMALL_PROJECT: 50,    // 小型项目文件数阈值
	MEDIUM_PROJECT: 200,  // 中型项目文件数阈值
	LARGE_PROJECT: 201,   // 大型项目文件数阈值
} as const

// v2 分析策略
export const ANALYSIS_STRATEGIES = {
	QUICK: "快速分析模式",
	STANDARD: "标准分析模式",
	DEEP: "深度分析模式"
} as const