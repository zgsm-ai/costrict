import type OpenAI from "openai"

const FILE_OUTLINE_DESCRIPTION = `提取代码文件的结构信息，包括类、函数、方法定义和文档字符串。

支持的语言：
- Python (.py)
- JavaScript (.js, .jsx)
- TypeScript (.ts, .tsx)
- Go (.go)
- Java (.java)
- C (.c, .h)
- C++ (.cpp, .hpp)

输出包含：
- 定义的行号
- 函数/类签名
- 文档字符串（如果存在）`

export default {
	type: "function",
	function: {
		name: "file_outline",
		description: FILE_OUTLINE_DESCRIPTION,
		strict: true,
		parameters: {
			type: "object",
			properties: {
				file_path: {
					type: "string",
					description: "要分析的文件路径",
				},
				include_docstrings: {
					type: "boolean",
					description: "是否包含文档字符串",
				},
			},
			required: ["file_path"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
