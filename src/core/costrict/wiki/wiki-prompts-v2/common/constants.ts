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
	PROJECT_CLASSIFICATION_AGENT: "01_project-classification-agent.md",
	REPOSITORY_ANALYSIS_AGENT: "02_repository-analysis-agent.md",
	THINK_CATALOGUE_AGENT: "03_generate-think-catalogue-template.md",
	DOCUMENT_GENERATION_AGENT: "04_document-generation-agent.md",
	INDEX_GENERATION_AGENT: "05_index-generation-agent.md",
	MINDMAP_GENERATION_AGENT: "06_mindmap-generation-agent.md",
	RULES_GENERATION_AGENT: "07_rules-generation-agent.md",
} as const

// v2 Agent输出文件名常量
export const AGENT_OUTPUT_FILENAMES = {
	PROJECT_CLASSIFICATION_AGENT: "project-classification.md",
	REPOSITORY_ANALYSIS_AGENT: "repository-analysis.md",
	THINK_CATALOGUE_AGENT: "think-catalogue.md",
	DOCUMENT_GENERATION_AGENT: "technical-documentation.md",
	INDEX_GENERATION_AGENT: "index.md",
	MINDMAP_GENERATION_AGENT: "mindmap.json",
	RULES_GENERATION_AGENT: "generated_rules.md",
} as const

// 主文件名
export const MAIN_WIKI_FILENAME = "project-wiki.md"

// v2 系统输入输出文件路径常量
export const SYSTEM_FILE_PATHS = {
	// 输出目录
	STAGING_OUTPUT_DIR: ".cospec/wiki/outputs/",
	WIKI_OUTPUT_DIR: ".cospec/wiki/",
	GENERAL_RULES_OUTPUT_DIR: ".roo/rules/",
	
	// 各阶段输出文件
	PROJECT_CLASSIFICATION_JSON: `.cospec/wiki/outputs/project-classification.json`,
	PROJECT_ANALYSIS_REPORT_MD: ".cospec/wiki/outputs/project-analysis-report.md",
	THINK_CATALOGUE_JSON: ".cospec/wiki/outputs/think-catalogue.json",
	EXECUTION_PLAN_MD: ".cospec/wiki/outputs/execution-plan.md",
	REPOSITORY_ANALYSIS_JSON: ".cospec/wiki/outputs/repository-analysis.json",
	DEPENDENCY_MAPPING_JSON: ".cospec/wiki/outputs/dependency-mapping.json",
	DOCUMENT_GENERATION_SUMMARY_JSON: ".cospec/wiki/outputs/document-generation-summary.json",
	
	// 最终输出文件
	README_MD: "README.md",
	DOCUMENT_INDEX_MD: "DOCUMENT_INDEX.md",
	ANALYSIS_REPORT_MD: "ANALYSIS_REPORT.md",
	MINDMAP_JSON: "MINDMAP.json",
	PROJECT_RULES_OUTPUT_FILE: "generated_rules.md",
	
	// 动态文档前缀
	DYNAMIC_DOC_PREFIX: "DOC_",
	
	// 通用输入文件
	PACKAGE_JSON: "package.json",
	REQUIREMENTS_TXT: "requirements.txt",
	POM_XML: "pom.xml",
	CARGO_TOML: "Cargo.toml",
	README_MD_INPUT: "README.md"
} as const

// v2 上下文数据结构定义
export const CONTEXT_DATA_STRUCTURE = {
	projectInfo: {
		name: "string",
		type: "string",
		scale: "string",
		complexity: "string",
		techStack: "array",
		architecturePattern: "string",
		keyComponents: "array"
	},
	analysisResults: {
		classification: "object",
		structureAnalysis: "object",
		repositoryAnalysis: "object",
		dependencyMapping: "object",
		thinkCatalogue: "object",
		documentationAnalysis: "object",
		technicalInsights: "array"
	},
	executionContext: {
		strategy: "string",
		agentCompleted: "array",
		nextAgent: "string",
		taskStatus: "string",
		errorHistory: "array"
	}
} as const

// v2 变量格式统一
export const VARIABLE_FORMATS = {
	TEMPLATE: "{{variable}}",
	CONTEXT: "{{$variable}}",
	INTERPOLATION: "${variable}",
	DESCRIPTION: {
		TEMPLATE: "用于模板中的变量替换",
		CONTEXT: "用于上下文中的变量替换",
		INTERPOLATION: "用于字符串插值"
	}
} as const

// v2 常用TODO列表提取为常量
export const TODO_TEMPLATES = {
	PROJECT_CLASSIFICATION: [
		"读取项目基本信息和结构",
		"执行项目分类分析",
		"生成分类结果数据",
		"生成项目分析报告"
	],
	THINK_CATALOGUE: [
		"读取项目分类结果",
		"分析项目特征",
		"生成思考目录结构",
		"生成执行计划"
	],
	REPOSITORY_ANALYSIS: [
		"读取思考目录结构",
		"分析代码架构",
		"映射依赖关系",
		"分析Git变更",
		"生成分析结果"
	],
	DOCUMENT_GENERATION: [
		"读取仓库分析结果",
		"执行战略规划（Phase 1）",
		"执行深度代码分析（Phase 2）",
		"执行综合文档创建（Phase 3）",
		"执行战略性增强（Phase 4）",
		"生成文档摘要"
	],
	INDEX_GENERATION: [
		"读取文档生成摘要",
		"分析文档结构",
		"创建主目录索引",
		"创建技术组件索引",
		"建立交叉引用",
		"生成索引文件"
	],
	MINDMAP_GENERATION: [
		"读取文档索引",
		"分析系统架构",
		"创建层次结构",
		"映射组件关系",
		"生成思维导图"
	],
	RULES_GENERATION: [
		"读取所有分析结果",
		"提取项目特有规则",
		"生成强制性规范",
		"验证规则质量"
	]
} as const

// v2 Agent文件输入输出映射
export const AGENT_FILE_IO = {
	// 父任务系统输入
	PROJECT_WIKI_V2: {
		inputs: [],
		outputs: [
			SYSTEM_FILE_PATHS.README_MD,
			SYSTEM_FILE_PATHS.DOCUMENT_INDEX_MD,
			SYSTEM_FILE_PATHS.ANALYSIS_REPORT_MD,
			SYSTEM_FILE_PATHS.MINDMAP_JSON,
			`${SYSTEM_FILE_PATHS.DYNAMIC_DOC_PREFIX}*.md`
		]
	},
	
	// 子任务输入输出映射
	PROJECT_CLASSIFICATION_AGENT: {
		inputs: [
			SYSTEM_FILE_PATHS.PACKAGE_JSON,
			SYSTEM_FILE_PATHS.REQUIREMENTS_TXT,
			SYSTEM_FILE_PATHS.POM_XML,
			SYSTEM_FILE_PATHS.CARGO_TOML,
			SYSTEM_FILE_PATHS.README_MD_INPUT
		],
		outputs: [
			SYSTEM_FILE_PATHS.PROJECT_CLASSIFICATION_JSON,
			SYSTEM_FILE_PATHS.PROJECT_ANALYSIS_REPORT_MD
		]
	},
	
	THINK_CATALOGUE_AGENT: {
		inputs: [
			SYSTEM_FILE_PATHS.PROJECT_CLASSIFICATION_JSON,
			SYSTEM_FILE_PATHS.PROJECT_ANALYSIS_REPORT_MD
		],
		outputs: [
			SYSTEM_FILE_PATHS.THINK_CATALOGUE_JSON,
			SYSTEM_FILE_PATHS.EXECUTION_PLAN_MD
		]
	},
	
	REPOSITORY_ANALYSIS_AGENT: {
		inputs: [
			SYSTEM_FILE_PATHS.THINK_CATALOGUE_JSON,
			SYSTEM_FILE_PATHS.EXECUTION_PLAN_MD,
			SYSTEM_FILE_PATHS.PROJECT_CLASSIFICATION_JSON
		],
		outputs: [
			SYSTEM_FILE_PATHS.REPOSITORY_ANALYSIS_JSON,
			SYSTEM_FILE_PATHS.DEPENDENCY_MAPPING_JSON
		]
	},
	
	DOCUMENT_GENERATION_AGENT: {
		inputs: [
			SYSTEM_FILE_PATHS.REPOSITORY_ANALYSIS_JSON,
			SYSTEM_FILE_PATHS.DEPENDENCY_MAPPING_JSON,
			SYSTEM_FILE_PATHS.PROJECT_CLASSIFICATION_JSON,
			SYSTEM_FILE_PATHS.THINK_CATALOGUE_JSON
		],
		outputs: [
			SYSTEM_FILE_PATHS.README_MD,
			`${SYSTEM_FILE_PATHS.DYNAMIC_DOC_PREFIX}*.md`,
			SYSTEM_FILE_PATHS.DOCUMENT_GENERATION_SUMMARY_JSON
		]
	},
	
	INDEX_GENERATION_AGENT: {
		inputs: [
			SYSTEM_FILE_PATHS.DOCUMENT_GENERATION_SUMMARY_JSON,
			SYSTEM_FILE_PATHS.README_MD,
			`${SYSTEM_FILE_PATHS.DYNAMIC_DOC_PREFIX}*.md`,
			SYSTEM_FILE_PATHS.PROJECT_CLASSIFICATION_JSON,
			SYSTEM_FILE_PATHS.REPOSITORY_ANALYSIS_JSON
		],
		outputs: [
			SYSTEM_FILE_PATHS.DOCUMENT_INDEX_MD
		]
	},
	
	MINDMAP_GENERATION_AGENT: {
		inputs: [
			SYSTEM_FILE_PATHS.DOCUMENT_INDEX_MD,
			SYSTEM_FILE_PATHS.README_MD,
			`${SYSTEM_FILE_PATHS.DYNAMIC_DOC_PREFIX}*.md`,
			SYSTEM_FILE_PATHS.PROJECT_CLASSIFICATION_JSON,
			SYSTEM_FILE_PATHS.REPOSITORY_ANALYSIS_JSON
		],
		outputs: [
			SYSTEM_FILE_PATHS.MINDMAP_JSON
		]
	},
	RULES_GENERATION_AGENT: {
		inputs: [
			SYSTEM_FILE_PATHS.PROJECT_CLASSIFICATION_JSON,
			SYSTEM_FILE_PATHS.REPOSITORY_ANALYSIS_JSON,
			SYSTEM_FILE_PATHS.DOCUMENT_GENERATION_SUMMARY_JSON,
			SYSTEM_FILE_PATHS.DOCUMENT_INDEX_MD
		],
		outputs: [
			`${SYSTEM_FILE_PATHS.GENERAL_RULES_OUTPUT_DIR}${SYSTEM_FILE_PATHS.PROJECT_RULES_OUTPUT_FILE}`
		],
		context_updates: {
			projectInfo: ["rulesGenerated", "ruleCategories"],
			analysisResults: ["ruleAnalysis", "complianceMetrics"],
			executionContext: ["generationCompleted", "taskStatus"]
		}
	}
} as const

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

// v2 Agent执行顺序 - 与主文件阶段顺序一致
export const AGENT_EXECUTION_ORDER = [
	"ProjectClassificationAgent",      // 阶段2：项目分类分析
	"ThinkCatalogueAgent",             // 阶段3：思考目录生成
	"RepositoryAnalysisAgent",         // 阶段4：仓库深度分析
	"DocumentGenerationAgent",         // 阶段5：多文档生成
	"IndexGenerationAgent",            // 阶段6：索引生成
	"MindmapGenerationAgent",           // 阶段7：思维导图生成
	"RulesGenerationAgent"              // 阶段8：规则生成
] as const

// v2 Agent依赖关系 - 基于文件输入输出关系和阶段顺序
export const AGENT_DEPENDENCIES = {
	ProjectClassificationAgent: [],    // 阶段2：无依赖，基于阶段1的项目特征分析
	ThinkCatalogueAgent: ["ProjectClassificationAgent"],  // 阶段3：依赖阶段2的分类结果
	RepositoryAnalysisAgent: ["ThinkCatalogueAgent", "ProjectClassificationAgent"],  // 阶段4：依赖阶段2和3
	DocumentGenerationAgent: ["RepositoryAnalysisAgent", "ThinkCatalogueAgent", "ProjectClassificationAgent"],  // 阶段5：依赖前面所有阶段
	IndexGenerationAgent: ["DocumentGenerationAgent"],  // 阶段6：依赖阶段5的文档生成结果
	MindmapGenerationAgent: ["IndexGenerationAgent"],    // 阶段7：依赖阶段6的索引结果
	RulesGenerationAgent: ["MindmapGenerationAgent", "IndexGenerationAgent", "DocumentGenerationAgent"]  // 阶段8：依赖前面所有阶段
} as const

// v2 阶段与Agent映射关系
export const STAGE_AGENT_MAPPING = {
	1: "ProjectFeatureAnalysis",       // 阶段1：项目特征分析（非Agent）
	2: "ProjectClassificationAgent",   // 阶段2：项目分类分析
	3: "ThinkCatalogueAgent",          // 阶段3：思考目录生成
	4: "RepositoryAnalysisAgent",      // 阶段4：仓库深度分析
	5: "DocumentGenerationAgent",      // 阶段5：多文档生成
	6: "IndexGenerationAgent",         // 阶段6：索引生成
	7: "MindmapGenerationAgent",        // 阶段7：思维导图生成
	8: "RulesGenerationAgent"          // 阶段8：规则生成
} as const

// v2 Agent输入输出变量映射 - 基于文件依赖关系
export const AGENT_IO_MAPPING = {
	ProjectClassificationAgent: {
		inputs: {
			project_info: CONTEXT_VARIABLES.PROJECT_INFO,
			file_structure: CONTEXT_VARIABLES.FILE_STRUCTURE,
			readme_content: CONTEXT_VARIABLES.README,
			configuration_files: CONTEXT_VARIABLES.CONFIGURATION_FILES
		},
		outputs: {
			classification_result: SYSTEM_FILE_PATHS.PROJECT_CLASSIFICATION_JSON,
			analysis_report: SYSTEM_FILE_PATHS.PROJECT_ANALYSIS_REPORT_MD
		},
		context_updates: {
			projectInfo: ["classifyName", "techStack", "projectScale", "complexityLevel", "recommendedStrategy"],
			analysisResults: ["classification", "structureAnalysis", "evidence"],
			executionContext: ["strategy", "agentCompleted"]
		}
	},
	ThinkCatalogueAgent: {
		inputs: {
			project_classification: CONTEXT_VARIABLES.PROJECT_CLASSIFICATION,
			project_info: CONTEXT_VARIABLES.PROJECT_INFO,
			analysis_strategy: CONTEXT_VARIABLES.ANALYSIS_STRATEGY
		},
		required_files: [
			SYSTEM_FILE_PATHS.PROJECT_CLASSIFICATION_JSON,
			SYSTEM_FILE_PATHS.PROJECT_ANALYSIS_REPORT_MD
		],
		outputs: {
			think_catalogue: SYSTEM_FILE_PATHS.THINK_CATALOGUE_JSON,
			execution_plan: SYSTEM_FILE_PATHS.EXECUTION_PLAN_MD
		},
		context_updates: {
			analysisResults: ["thinkCatalogue", "executionPlan", "adaptationRules"],
			executionContext: ["catalogueGenerated", "nextAgent", "strategy"]
		}
	},
	RepositoryAnalysisAgent: {
		inputs: {
			catalogue: CONTEXT_VARIABLES.CATALOGUE,
			repository_name: CONTEXT_VARIABLES.REPOSITORY_NAME,
			project_classification: CONTEXT_VARIABLES.PROJECT_CLASSIFICATION,
			git_changes: CONTEXT_VARIABLES.GIT_CHANGES,
			analysis_strategy: CONTEXT_VARIABLES.ANALYSIS_STRATEGY
		},
		required_files: [
			SYSTEM_FILE_PATHS.THINK_CATALOGUE_JSON,
			SYSTEM_FILE_PATHS.EXECUTION_PLAN_MD,
			SYSTEM_FILE_PATHS.PROJECT_CLASSIFICATION_JSON
		],
		outputs: {
			repository_analysis: SYSTEM_FILE_PATHS.REPOSITORY_ANALYSIS_JSON,
			dependency_mapping: SYSTEM_FILE_PATHS.DEPENDENCY_MAPPING_JSON
		},
		context_updates: {
			projectInfo: ["architecturePattern", "complexity", "keyComponents"],
			analysisResults: ["repositoryAnalysis", "dependencyMapping", "gitChanges", "technicalInsights"],
			executionContext: ["analysisCompleted", "nextAgent"]
		}
	},
	DocumentGenerationAgent: {
		inputs: {
			prompt: CONTEXT_VARIABLES.PROMPT,
			title: CONTEXT_VARIABLES.TITLE,
			git_repository: CONTEXT_VARIABLES.GIT_REPOSITORY,
			branch: CONTEXT_VARIABLES.GIT_BRANCH,
			projectType: CONTEXT_VARIABLES.PROJECT_TYPE,
			code_files: CONTEXT_VARIABLES.CODE_FILES,
			analysis_context: CONTEXT_VARIABLES.ANALYSIS_CONTEXT,
			project_classification: CONTEXT_VARIABLES.PROJECT_CLASSIFICATION,
			repository_analysis: CONTEXT_VARIABLES.REPOSITORY_ANALYSIS
		},
		required_files: [
			SYSTEM_FILE_PATHS.REPOSITORY_ANALYSIS_JSON,
			SYSTEM_FILE_PATHS.DEPENDENCY_MAPPING_JSON,
			SYSTEM_FILE_PATHS.PROJECT_CLASSIFICATION_JSON,
			SYSTEM_FILE_PATHS.THINK_CATALOGUE_JSON
		],
		outputs: {
			readme: SYSTEM_FILE_PATHS.README_MD,
			technical_docs: `${SYSTEM_FILE_PATHS.DYNAMIC_DOC_PREFIX}*.md`,
			generation_summary: SYSTEM_FILE_PATHS.DOCUMENT_GENERATION_SUMMARY_JSON
		},
		context_updates: {
			projectInfo: ["documentationGenerated", "documentPath", "documentQuality"],
			analysisResults: ["documentationAnalysis", "technicalInsights", "recommendations"],
			executionContext: ["generationCompleted", "nextAgent"]
		}
	},
	IndexGenerationAgent: {
		inputs: {
			generated_documents: CONTEXT_VARIABLES.DOCUMENT_CONTENT,
			project_classification: CONTEXT_VARIABLES.PROJECT_CLASSIFICATION,
			repository_analysis: CONTEXT_VARIABLES.REPOSITORY_ANALYSIS,
			document_structure: CONTEXT_VARIABLES.FILE_STRUCTURE,
			analysis_context: CONTEXT_VARIABLES.ANALYSIS_CONTEXT
		},
		required_files: [
			SYSTEM_FILE_PATHS.DOCUMENT_GENERATION_SUMMARY_JSON,
			SYSTEM_FILE_PATHS.README_MD,
			`${SYSTEM_FILE_PATHS.DYNAMIC_DOC_PREFIX}*.md`,
			SYSTEM_FILE_PATHS.PROJECT_CLASSIFICATION_JSON,
			SYSTEM_FILE_PATHS.REPOSITORY_ANALYSIS_JSON
		],
		outputs: {
			document_index: SYSTEM_FILE_PATHS.DOCUMENT_INDEX_MD
		},
		context_updates: {
			projectInfo: ["indexGenerated", "indexStructure", "navigationOptimized"],
			analysisResults: ["indexAnalysis", "crossReferences", "navigationMetrics"],
			executionContext: ["generationCompleted", "allAgentsCompleted", "taskStatus"]
		}
	},
	MindmapGenerationAgent: {
		inputs: {
			document_index: SYSTEM_FILE_PATHS.DOCUMENT_INDEX_MD,
			generated_documents: CONTEXT_VARIABLES.DOCUMENT_CONTENT,
			project_classification: CONTEXT_VARIABLES.PROJECT_CLASSIFICATION,
			repository_analysis: CONTEXT_VARIABLES.REPOSITORY_ANALYSIS
		},
		required_files: [
			SYSTEM_FILE_PATHS.DOCUMENT_INDEX_MD,
			SYSTEM_FILE_PATHS.README_MD,
			`${SYSTEM_FILE_PATHS.DYNAMIC_DOC_PREFIX}*.md`,
			SYSTEM_FILE_PATHS.PROJECT_CLASSIFICATION_JSON,
			SYSTEM_FILE_PATHS.REPOSITORY_ANALYSIS_JSON
		],
		outputs: {
			mindmap: SYSTEM_FILE_PATHS.MINDMAP_JSON
		},
		context_updates: {
			projectInfo: ["mindmapGenerated", "mindmapStructure"],
			analysisResults: ["mindmapAnalysis", "knowledgeMapping"],
			executionContext: ["generationCompleted", "taskStatus"]
		}
	}
} as const

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

// 公共提示词片段
export const AGENTS_COMMON_REQUIREMENTS = `## 核心指导原则（思维链）
1. **证据驱动**：每个结论必须基于具体的文件证据，使用精确行号引用机制标注来源
2. **优先级明确**：按照"80/20法则"，优先提取对代码生成影响最大的信息
3. **结构化输出**：使用标准化格式，便于AI理解和检索
4. **自我验证**：分析完成后验证所有来源文件的真实性
5. **技术准确性**：所有信息仅源自相关源文件，不得推断、编造或使用外部知识
6. **源文件数量验证**：确保每个文档引用至少5个不同的源文件
7. **引用格式规范**：使用\`[filename.ext:start_line-end_line](文件路径)\`格式进行精确引用`

export const AGENT_SELF_CHECK_BASE = `### 自我反思检查（质量保证）
使用 \`read_file\` 工具读取前面输出的文档，对文档内容严格执行以下检查（如果检查不通过，则进行修改，然后重新检查，直到完全符合要求为止）：
1. **信息准确性**：所有信息是否基于实际代码和配置文件？
2. **来源标注**：每个结论是否都有明确的文件路径作为支撑？
3. **来源格式**：来源是否使用\`来源：[filename.ext:start_line-end_line](文件路径)\`格式正确呈现？
4. **多源标注**：是否为关键信息提供了多个来源文件/目录？
5. **占位符清理**：是否已将所有占位符替换为实际分析内容？
6. **结构完整性**：是否按照模板格式完整输出？
7. **来源验证**：是否已正确验证所有来源文件/目录的存在性？
8. **源文件数量**：是否确保引用了至少5个不同的源文件？
9. **Mermaid规范**：流程图是否使用了\`graph TD\`而非\`graph LR\`？
10. **文档开头**：是否以\`<details>\`块开始列出相关源文件？`

export const AGENT_TASK_COMPLETION_STANDARD = `### 任务完成标准
完成以上所有检查项并通过验证后，将文档保存到指定路径即表示任务完成。必须确保：
1. 生成了完整的分析文档
2. 所有结论都有明确的来源文件/目录标注
3. 文档格式符合结构化模板要求`

// 子任务指令读取常量
export const SUBTASK_INSTRUCTION_READ = `## Instructions
使用read_file工具读取下面的指令文件，作为指令严格执行。`

// 子任务指令模板常量
export const SUBTASK_INSTRUCTION_TEMPLATE = (agentFile: string) => `
${SUBTASK_INSTRUCTION_READ}

\`\`\`
使用以下文件读取指令模板：
\`\`\`
read_file:
  path: "${agentFile}"
\`\`\`
`