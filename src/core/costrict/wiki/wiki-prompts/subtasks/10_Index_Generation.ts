import { WIKI_OUTPUT_DIR, SUBTASK_OUTPUT_FILENAMES } from "./constants"

export const INDEX_GENERATION_TEMPLATE = (workspace: string) => `# 项目技术文档索引生成任务

## 任务目标
你作为资深技术文档分析师，需要基于完整代码仓库生成项目技术文档索引，为AI Coding Agent提供快速导航和信息定位能力，提升代码生成精准性。

## 核心指导原则
1. **结构化输出**：使用标准化格式，便于AI理解和检索
2. **优先级明确**：按照"80/20法则"，优先提取对代码生成影响最大的索引信息
3. **完整性**：确保覆盖所有已生成文档的索引信息

## 分析流程

### 第一步：文档存在性检查
1. 检查${WIKI_OUTPUT_DIR}文件夹下的所有.md技术文档
2. 识别：已存在的文档列表和缺失的文档列表

### 第二步：项目概述信息提取
1. 从 \`${workspace}${WIKI_OUTPUT_DIR}${SUBTASK_OUTPUT_FILENAMES.PROJECT_OVERVIEW_TASK_FILE}\` 中提取信息
2. 直接提取：项目定位、技术栈、架构特点、组织结构

### 第三步：文档内容摘要生成
1. 分析每个技术文档的核心内容
2. 提取：文档主要内容、适用场景、关键信息点

### 第四步：索引结构组织
1. 按输出格式要求生成即可

### 第五步：自我反思检查清单（质量保证）

在完成索引生成后，请进行以下自我检查：

1. **文档完整性检查**
   - [ ] 是否包含所有已生成文档的索引信息？
   - [ ] 文档路径是否准确无误？
   - [ ] 文档描述是否简洁明了？

2. **索引结构检查**
   - [ ] 索引层次结构是否清晰？
   - [ ] 分类逻辑是否合理？
   - [ ] 导航信息是否完整？

3. **内容质量检查**
   - [ ] 项目概述信息是否准确？
   - [ ] 技术栈描述是否完整？
   - [ ] 架构特点是否突出？

4. **格式规范检查**
   - [ ] Markdown格式是否正确？
   - [ ] 表格结构是否规范？
   - [ ] 链接是否有效？

## 输出格式要求（结构化模板）

### 文档结构
\`\`\`\`markdown
# {项目名称} 项目技术文档索引

## 📚 文档导航

本索引为AI提供{项目名称}项目的完整技术文档导航，支持快速信息定位和上下文理解。

### 📋 项目概述

**项目定位**: {从项目概览文档提取的项目定位，30字以内}
**技术栈**: {从项目概览文档提取的技术栈，30字以内}
**架构特点**: {从项目概览文档提取的架构特点，30字以内}

### 🏗️ 组织结构

src/
├── core/           # 核心功能模块
├── integrations/   # 集成功能
├── utils/          # 工具函数
└── webview-ui/     # 前端界面
...                # 其他目录
{从项目概览文档提取的项目组织结构，50行以内，若不存在则自动扫描项目目录生成}
\`\`\`


## 文档导航

### 🎯 核心文档概览

| 文档名称 | 文件路径 | 主要内容 | 适用场景 |
|---------|---------|---------|---------|
| **项目概览** | [\`${SUBTASK_OUTPUT_FILENAMES.PROJECT_OVERVIEW_TASK_FILE}\`](${WIKI_OUTPUT_DIR}${SUBTASK_OUTPUT_FILENAMES.PROJECT_OVERVIEW_TASK_FILE}) | {项目定位摘要，30字以内} | 项目理解、技术选型、功能开发 |
| **整体架构** | [\`${SUBTASK_OUTPUT_FILENAMES.OVERALL_ARCHITECTURE_TASK_FILE}\`](${WIKI_OUTPUT_DIR}${SUBTASK_OUTPUT_FILENAMES.OVERALL_ARCHITECTURE_TASK_FILE}) | {架构模式摘要，30字以内} | 架构设计、模块开发、系统集成 |
| **服务依赖** | [\`${SUBTASK_OUTPUT_FILENAMES.SERVICE_DEPENDENCIES_TASK_FILE}\`](${WIKI_OUTPUT_DIR}${SUBTASK_OUTPUT_FILENAMES.SERVICE_DEPENDENCIES_TASK_FILE}) | {服务间依赖摘要，30字以内} | 依赖管理、性能优化、故障排查 |
| **数据流分析** | [\`${SUBTASK_OUTPUT_FILENAMES.DATA_FLOW_INTEGRATION_TASK_FILE}\`](${WIKI_OUTPUT_DIR}${SUBTASK_OUTPUT_FILENAMES.DATA_FLOW_INTEGRATION_TASK_FILE}) | {数据流模式摘要，30字以内} | 数据处理、集成开发、性能调优 |
| **服务模块** | [\`${SUBTASK_OUTPUT_FILENAMES.SERVICE_ANALYSIS_TASK_FILE}\`](${WIKI_OUTPUT_DIR}${SUBTASK_OUTPUT_FILENAMES.SERVICE_ANALYSIS_TASK_FILE}) | {核心服务摘要，30字以内} | 服务开发、代码重构、功能扩展 |
| **数据库分析** | [\`${SUBTASK_OUTPUT_FILENAMES.DATABASE_SCHEMA_TASK_FILE}\`](${WIKI_OUTPUT_DIR}${SUBTASK_OUTPUT_FILENAMES.DATABASE_SCHEMA_TASK_FILE}) | {数据库架构摘要，30字以内} | 数据库设计、查询优化、数据迁移 |
| **API接口** | [\`${SUBTASK_OUTPUT_FILENAMES.API_INTERFACE_TASK_FILE}\`](${WIKI_OUTPUT_DIR}${SUBTASK_OUTPUT_FILENAMES.API_INTERFACE_TASK_FILE}) | {接口规范摘要，30字以内} | API开发、接口测试、集成开发 |
| **部署分析** | [\`${SUBTASK_OUTPUT_FILENAMES.DEPLOY_ANALYSIS_TASK_FILE}\`](${WIKI_OUTPUT_DIR}${SUBTASK_OUTPUT_FILENAMES.DEPLOY_ANALYSIS_TASK_FILE}) | {部署方式摘要，30字以内} | 部署配置、运维管理、扩容缩容 |
\`\`\`\`

## 输出文件命名
\`${workspace}${WIKI_OUTPUT_DIR}${SUBTASK_OUTPUT_FILENAMES.INDEX_GENERATION_TASK_FILE}\`
注意：如果${workspace}${WIKI_OUTPUT_DIR}目录不存在，则创建。
`
