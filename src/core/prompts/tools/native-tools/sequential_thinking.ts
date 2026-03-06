import type OpenAI from "openai"

const SEQUENTIAL_THINKING_DESCRIPTION = `结构化思考工具，用于复杂问题的分步骤分析。

使用场景：
- 需要多步骤分析的复杂问题
- 需要修订的规划/设计
- 问题范围初始不明确
- 需要在步骤间保持上下文

功能特性：
- 动态调整总步骤数
- 随时修订之前的思考
- 创建替代方案分支
- 根据复杂度设置5-25个步骤

Example:
{\"branchFromThought\":1,\"branchId\":\"ui-optimization-analysis\",\"isRevision\":false,\"needsMoreThoughts\":true,
\"nextThoughtNeeded\":true,\"revisesThought\":0,
\"thought\":\"首先分析当前项目的 UI 结构。从文件树可以看到：\\n- index.html: 主页面结构\\n- css/ui-improvements.css: UI 样式文件\\n- js/ui.js: UI 核心逻辑\\n- js/ui-enhancements.js: UI 增强功能\\n- js/interaction-enhancements.js: 交互增强\\n\\n这是一个超级马里奥游戏项目，需要从多个维度思考 UI 优化：\\n1. 视觉设计层次感\\n2. 用户体验流畅度\\n3. 响应式布局\\n4. 性能优化\\n5. 可访问性\\n\\n接下来需要读取关键文件以了解当前实现状态。\",
\"thoughtNumber\":1,\"totalThoughts\":8}
`

export default {
	type: "function",
	function: {
		name: "sequential_thinking",
		description: SEQUENTIAL_THINKING_DESCRIPTION,
		strict: true,
		parameters: {
			type: "object",
			properties: {
				branchFromThought: {
					type: "integer",
					description: `从哪个思考创建分支(default: 1)`,
				},
				branchId: {
					type: "string",
					description: `此分支的标识符。`,
				},
				isRevision: {
					type: "boolean",
					description: `是否是对之前思考的修订`,
				},
				needsMoreThoughts: {
					type: "boolean",
					description: `如需超出总数的更多思考则为 true。`,
				},
				nextThoughtNeeded: {
					type: "boolean",
					description: `如需继续思考则为 true；完成时为 false。`,
				},
				revisesThought: {
					type: "integer",
					description: `要修订的思考编号(default: 1)`,
				},
				thought: {
					type: "string",
					description: `当前思考步骤的内容`,
				},
				thoughtNumber: {
					type: "integer",
					description: `当前步骤编号（从1开始，default: 1）`,
				},
				totalThoughts: {
					type: "integer",
					description: `预估总步骤数（≥1，可调整）。`,
				},
			},
			required: ["thought", "nextThoughtNeeded", "thoughtNumber", "totalThoughts"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
