export const VARIABLE_REPLACEMENT_RULES = (workspace: string) => `# 变量替换规则

## 变量语法
- \`{{variable}}\`：静态变量，预处理阶段替换
- \`{{$variable}}\`：动态变量，执行时替换

## 常用变量
- \`{{workspace}}\`：工作区路径
- \`{{project_name}}\`：项目名称
- \`{{project_type}}\`：项目类型
- \`{{$catalogue}}\`：目录结构
- \`{{$readme}}\`：README内容
- \`{{$file_content}}\`：文件内容
- \`{{$analysis_result}}\`：分析结果
- \`{{$document_content}}\`：文档内容

## 替换规则
1. 静态变量优先于动态变量替换
2. 变量不存在时使用空字符串
3. 支持转义：\`\\{{variable}}\` 输出原文本
4. 保持与OpenDeepWiki兼容性

## 使用示例
\`\`\`
项目：{{project_name}}
类型：{{project_type}}
目录：{{$catalogue}}
内容：{{$file_content}}
\`\`\`

工作区：${workspace}
`;