export const CONTEXT_FORMAT = (workspace: string) => `# 上下文格式定义

## 全局上下文结构

### 上下文对象
{
  "projectInfo": {
    "name": "项目名称",
    "classifyName": "项目分类（Applications/Frameworks/Libraries等）",
    "techStack": ["技术栈1", "技术栈2"],
    "projectScale": "项目规模（小型/中型/大型）",
    "complexityLevel": "复杂度等级（低/中/高）",
    "recommendedStrategy": "推荐分析策略（快速/标准/深度）",
    "architecturePattern": "架构模式",
    "keyComponents": "核心组件"
  },
  "analysisResults": {
    "classification": "项目分类结果",
    "repositoryAnalysis": "仓库分析结果",
    "documentGeneration": "文档生成结果",
    "indexGeneration": "索引生成结果",
    "mindmapGeneration": "思维导图生成结果",
    "dependencyMapping": "依赖关系映射",
    "gitChanges": "Git变更分析",
    "technicalInsights": "技术洞察"
  },
  "executionContext": {
    "strategy": "执行策略",
    "mode": "执行模式",
    "progress": "进度跟踪（0-100）",
    "errors": ["错误记录"],
    "retryCount": "重试次数",
    "currentAgent": "当前执行的Agent",
    "completedAgents": ["已完成的Agent列表"],
    "nextAgent": "下一个要执行的Agent",
    "taskStatus": "任务状态（initializing/running/completed/failed）"
  },
  "fileSystem": {
    "workspace": "工作区路径",
    "outputFiles": ["生成的输出文件列表"],
    "scannedFiles": ["已扫描的文件列表"],
    "analyzedFiles": ["已分析的文件列表"]
  }
}

## Agent间上下文传递规则

### 1. ProjectClassificationAgent输出格式
{
  "projectInfo": {
    "classifyName": "Applications/Frameworks/Libraries等",
    "techStack": ["技术栈1", "技术栈2"],
    "projectScale": "小型/中型/大型",
    "complexityLevel": "低/中/高",
    "recommendedStrategy": "快速/标准/深度"
  },
  "analysisResults": {
    "classification": "完整分类分析结果"
  }
}

### 2. RepositoryAnalysisAgent输出格式
{
  "projectInfo": {
    "architecturePattern": "架构模式",
    "keyComponents": "核心组件列表"
  },
  "analysisResults": {
    "repositoryAnalysis": "完整仓库分析结果",
    "dependencyMapping": "依赖关系映射",
    "gitChanges": "Git变更分析",
    "technicalInsights": "技术洞察"
  }
}

### 3. DocumentGenerationAgent输出格式
{
  "analysisResults": {
    "documentGeneration": "文档生成结果",
    "technicalInsights": "技术洞察"
  },
  "fileSystem": {
    "outputFiles": ["生成的文档路径列表"]
  }
}

### 4. IndexGenerationAgent输出格式
{
  "analysisResults": {
    "indexGeneration": "索引生成结果"
  },
  "fileSystem": {
    "outputFiles": ["索引文件路径"]
  }
}

## 上下文更新规则

### 更新原则
1. **增量更新**：只更新自己负责的字段，保留其他Agent的结果
2. **数据一致性**：相关字段必须同时更新，保持数据一致性
3. **错误隔离**：Agent执行错误不应破坏整个上下文结构
4. **可追溯性**：记录重要变更的来源Agent和时间

### 更新格式
<上下文更新>
{
  "更新字段名": "更新值",
  "analysisResults": {
    "新增分析结果": "具体内容"
  },
  "executionContext": {
    "currentAgent": "当前Agent名称",
    "completedAgents": ["已完成的Agent列表"],
    "progress": "进度百分比"
  }
}
</上下文更新>

## 上下文使用规范

### 读取规则
1. **优先级**：优先读取前面Agent的分析结果
2. **验证**：使用前验证数据的有效性和完整性
3. **避免重复**：不要重复分析其他Agent已经处理的内容
4. **依赖关系**：明确依赖关系，确保按正确顺序使用数据

### 错误处理
1. **错误记录**：所有错误信息记录在executionContext.errors中
2. **部分失败**：单个Agent失败不应影响整个流程
3. **恢复机制**：提供从错误状态恢复的策略
4. **错误信息**：提供足够的错误信息用于问题诊断

## 变量替换机制

### 支持的变量
- \`{{$project_classification}}\`：项目分类结果
- \`{{$repository_analysis}}\`：仓库分析结果
- \`{{$document_generation}}\`：文档生成结果
- \`{{$index_generation}}\`：索引生成结果
- \`{{$project_info}}\`：项目基本信息
- \`{{$analysis_context}}\`：分析上下文
- \`{{$execution_context}}\`：执行上下文

### 替换规则
1. **动态替换**：在Agent执行时动态替换变量
2. **空值处理**：变量不存在时使用空字符串
3. **转义支持**：支持变量转义，避免意外替换
4. **嵌套支持**：支持变量嵌套和组合使用

工作区：${workspace}
`;