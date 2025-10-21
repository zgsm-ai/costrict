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

export const subtaskDir =
	path.join(getGlobalCommandsDir(), "costrict-project-wiki-tasks", PROJECT_WIKI_VERSION) + path.sep

export const deepAnalyzeThreshold = 10

// 子任务文件名常量
export const SUBTASK_FILENAMES = {
	PROJECT_OVERVIEW_TASK_FILE: "01_Project_Overview_Analysis.md",
	OVERALL_ARCHITECTURE_TASK_FILE: "02_Overall_Architecture_Analysis.md",
	SERVICE_DEPENDENCIES_TASK_FILE: "03_Service_Dependencies_Analysis.md",
	DATA_FLOW_INTEGRATION_TASK_FILE: "04_Data_Flow_Integration_Analysis.md",
	SERVICE_ANALYSIS_TASK_FILE: "05_Service_Analysis_Template.md",
	DATABASE_SCHEMA_TASK_FILE: "06_Database_Schema_Analysis.md",
	API_INTERFACE_TASK_FILE: "07_API_Interface_Analysis.md",
	DEPLOY_ANALYSIS_TASK_FILE: "08_Deploy_Analysis.md",
	Develop_TEST_ANALYSIS_TASK_FILE: "09_Develop_Test_Analysis.md",
	INDEX_GENERATION_TASK_FILE: "10_Index_Generation.md",
	PROJECT_RULES_TASK_FILE: "11_Project_Rules_Generation.md",
} as const

// 子任务输出文件名常量
export const SUBTASK_OUTPUT_FILENAMES = {
	PROJECT_OVERVIEW_TASK_FILE: "01_Overview.md",
	OVERALL_ARCHITECTURE_TASK_FILE: "02_Architecture.md",
	SERVICE_DEPENDENCIES_TASK_FILE: "03_Service_Dependencies.md",
	DATA_FLOW_INTEGRATION_TASK_FILE: "04_Data_Flow_Integration.md",
	SERVICE_ANALYSIS_TASK_FILE: "05_Service.md",
	DATABASE_SCHEMA_TASK_FILE: "06_Database.md",
	API_INTERFACE_TASK_FILE: "07_API.md",
	DEPLOY_ANALYSIS_TASK_FILE: "08_Deploy.md",
	DEVELOPMENT_TEST_ANALYSIS_TASK_FILE: "09_Develop_Test.md",
	INDEX_GENERATION_TASK_FILE: "index.md",
	PROJECT_RULES_TASK_FILE: "generated_rules.md",
} as const

// 主文件名
export const MAIN_WIKI_FILENAME = "project-wiki.md"

// 所有子任务文件名数组（用于遍历）
export const ALL_SUBTASK_FILENAMES = Object.values(SUBTASK_OUTPUT_FILENAMES)

// 公共提示词片段

// 公共提示词片段
export const COMMON_CORE_PRINCIPLES = `## 核心指导原则（思维链）
1. **证据驱动**：每个结论必须基于具体的文件证据，使用精确行号引用机制标注来源
2. **优先级明确**：按照"80/20法则"，优先提取对代码生成影响最大的信息
3. **结构化输出**：使用标准化格式，便于AI理解和检索
4. **自我验证**：分析完成后验证所有来源文件的真实性
5. **技术准确性**：所有信息仅源自相关源文件，不得推断、编造或使用外部知识
6. **源文件数量验证**：确保每个文档引用至少5个不同的源文件
7. **引用格式规范**：使用\`[filename.ext:start_line-end_line](文件路径)\`格式进行精确引用`

export const COMMON_VERIFICATION_STEPS = `### 来源验证（关键步骤）
1. **文件验证**：对所有文件来源使用read_file工具读取第一行（line_range: "1-1"），确认文件存在
2. **目录验证**：对所有目录来源使用list_files工具列出目录内容，确认目录存在
3. **混合验证**：对于不确定是文件还是目录的来源，先尝试文件验证，失败后尝试目录验证
4. **思考**：如果来源不存在，是什么原因？
5. **处理**：移除无效来源或寻找替代证据
6. **确认**：确保所有引用的路径都是真实有效的
7. **数量验证**：确保每个文档引用至少5个不同的源文件`

export const COMMON_FILE_OUTPUT = `### 文档输出（关键步骤）
1. 严格按照 \`输出格式要求\`，严格参考示例格式生成文档
2. 严格按照 \`输出文件命名\` 指定的路径和文件名保存文档
`

export const COMMON_DOCUMENT_HEADER_FORMAT = `### 文档开头格式化（关键步骤）
1. **源文件列表生成**：基于分析过程中验证过的所有源文件，生成文档开头的\`<details>\`块
2. **源文件选择**：优先选择对分析最重要的文件，如配置文件、入口文件、核心模块等
3. **数量要求**：确保列出至少5个不同的源文件，不足时需主动查找其他相关文件
4. **格式规范**：使用标准markdown链接格式\`[文件名](文件路径)\`，换行分隔每个文件
5. **内容要求**：禁止标题、描述等其它信息，仅列出文件名和路径
`

export const COMMON_SELF_CHECK_BASE = `### 自我反思检查（质量保证）
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

export const COMMON_FILE_VERIFICATION = `**验证**：对所有相关文件和目录进行验证，确保来源真实性
   - **文件验证**：对所有文件来源使用read_file工具读取第一行（line_range: "1-1"），确认文件存在
   - **目录验证**：对所有目录来源使用list_files工具列出目录内容，确认目录存在
   - **混合验证**：对于不确定是文件还是目录的来源，先尝试文件验证，失败后尝试目录验证`

export const COMMON_REFERENCE_FORMAT = `使用精确行号引用格式记录所有信息来源，确保引用格式为\`[filename.ext:start_line-end_line](文件路径)\``

export const COMMON_DIVERSITY_REQUIREMENT = `**多样性要求**：确保引用文件类型多样化，避免单一类型文件集中`

export const COMMON_FORMAT_VERIFICATION = `**格式验证**：确保所有引用使用\`[filename.ext:start_line-end_line](文件路径)\`格式`

export const COMMON_SOURCE_COUNT_VERIFICATION = `**数量验证**：确保每个文档引用至少5个不同的源文件，避免清一色单个文件引用`

// 任务完成标准
export const COMMON_TASK_COMPLETION_STANDARD = `### 任务完成标准
完成以上所有检查项并通过验证后，将文档保存到指定路径即表示任务完成。必须确保：
1. 生成了完整的分析文档
2. 所有结论都有明确的来源文件/目录标注
3. 文档格式符合结构化模板要求`

// 输出文件命名模板
export const COMMON_OUTPUT_FILE_NAMING = (workspace: string, fileName: string) => 
`## 输出文件命名
\`${workspace}${WIKI_OUTPUT_DIR}${fileName}\`
注意：如果${workspace}${WIKI_OUTPUT_DIR}目录不存在，则创建。`

export const EXECUTE_REQUIREMENT = `**执行要求**：请创建并维护一个\`todo_list\`，跟踪以下所有步骤的执行状态，使用\`update_todo_list\`更新状态，确保不遗漏任何步骤。`