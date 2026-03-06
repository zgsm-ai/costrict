/**
 * File Outline Tool - 提取代码文件的结构信息（类、函数、方法定义）
 */

import * as path from "path"

import { Task } from "../task/Task"
import { getReadablePath } from "../../utils/path"
import { isPathOutsideWorkspace } from "../../utils/pathUtils"
import type { ToolUse } from "../../shared/tools"

import { readFileSync } from "fs"
import { treeSitterService } from "./service/tree-sitter"
import { loadRequiredLanguageParsers } from "../../services/tree-sitter/languageParser"
import { loadScmQuery, detectLanguageFromFilename } from "./util/scm-loader"
import { Query } from "web-tree-sitter"

import { BaseTool, ToolCallbacks } from "./BaseTool"

interface FileOutlineParams {
	file_path: string
	include_docstrings?: boolean
}

/**
 * 定义信息
 */
interface Definition {
	line: number
	name: string
	kind: string
	detail?: string
	signature?: string
	docstring?: string
	children?: Definition[]
}

/**
 * 语言特定的文档字符串配置
 */
interface DocstringPattern {
	docstringTypes: Set<string>
	definitionTypes: Set<string>
	position: "first_child" | "preceding"
	docPrefix?: string
}

/**
 * 语言特定的文档字符串模式
 */
const DOCSTRING_PATTERNS: Record<string, DocstringPattern> = {
	python: {
		docstringTypes: new Set(["string", "string_content"]),
		definitionTypes: new Set(["function_definition", "class_definition"]),
		position: "first_child",
	},
	javascript: {
		docstringTypes: new Set(["comment"]),
		definitionTypes: new Set([
			"function_declaration",
			"class_declaration",
			"method_definition",
			"arrow_function",
			"function",
		]),
		position: "preceding",
	},
	typescript: {
		docstringTypes: new Set(["comment"]),
		definitionTypes: new Set([
			"function_declaration",
			"class_declaration",
			"method_definition",
			"arrow_function",
			"function",
		]),
		position: "preceding",
	},
	go: {
		docstringTypes: new Set(["comment"]),
		definitionTypes: new Set(["function_declaration", "method_declaration", "type_declaration"]),
		position: "preceding",
	},
	java: {
		docstringTypes: new Set(["block_comment", "line_comment"]),
		definitionTypes: new Set(["class_declaration", "method_declaration", "constructor_declaration"]),
		position: "preceding",
		docPrefix: "/**",
	},
	c: {
		docstringTypes: new Set(["comment"]),
		definitionTypes: new Set(["function_definition", "struct_specifier"]),
		position: "preceding",
	},
	cpp: {
		docstringTypes: new Set(["comment"]),
		definitionTypes: new Set(["function_definition", "class_specifier", "struct_specifier"]),
		position: "preceding",
	},
}

/**
 * 提取文档字符串
 */
function extractDocstring(node: any, sourceCode: string, pattern: DocstringPattern): string | undefined {
	if (pattern.position === "first_child") {
		// Python风格：文档字符串是函数/类体的第一个子节点
		const body = node.childForFieldName("body")
		if (!body) return undefined

		const firstChild = body.firstChild
		if (!firstChild) return undefined

		if (pattern.docstringTypes.has(firstChild.type)) {
			return sourceCode.substring(firstChild.startIndex, firstChild.endIndex)
		}
	} else if (pattern.position === "preceding") {
		// JavaScript/Go风格：文档注释在定义之前
		let prevSibling = node.previousSibling

		// 跳过空白节点
		while (prevSibling && prevSibling.type === "comment" && !prevSibling.text.trim()) {
			prevSibling = prevSibling.previousSibling
		}

		if (prevSibling && pattern.docstringTypes.has(prevSibling.type)) {
			const text = sourceCode.substring(prevSibling.startIndex, prevSibling.endIndex)

			// 如果指定了前缀，检查是否匹配
			if (pattern.docPrefix && !text.startsWith(pattern.docPrefix)) {
				return undefined
			}

			return text
		}
	}

	return undefined
}

/**
 * 格式化定义列表
 */
function formatDefinitions(definitions: Definition[], filePath: string): string {
	if (definitions.length === 0) {
		return `# ${filePath}\n\nNo definitions found.`
	}

	const lines: string[] = [`# ${filePath}\n`]

	for (const def of definitions) {
		lines.push(`## Line ${def.line}: ${def.name}`)
		lines.push(`\`\`\`\n${def.signature}\n\`\`\``)

		if (def.docstring) {
			lines.push(`\n${def.docstring}`)
		}

		lines.push("") // 空行分隔
	}

	return lines.join("\n")
}

export class FileOutlineTool extends BaseTool<"file_outline"> {
	readonly name = "file_outline" as const

	async execute(params: FileOutlineParams, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { file_path, include_docstrings = true } = params
		const { askApproval, handleError, pushToolResult } = callbacks

		try {
			if (!file_path) {
				task.consecutiveMistakeCount++
				task.recordToolError("file_outline")
				task.didToolFailInCurrentTurn = true
				pushToolResult(await task.sayAndCreateMissingParamError("file_outline", "file_path"))
				return
			}

			task.consecutiveMistakeCount = 0

			const absolutePath = path.resolve(task.cwd, file_path)
			const isOutsideWorkspace = isPathOutsideWorkspace(absolutePath)
			// 检测语言
			const language = detectLanguageFromFilename(absolutePath)
			if (!language) {
				const result = {
					title: "不支持的文件类型",
					metadata: {
						file_path,
						language: "unknown",
						definition_count: 0,
						error: "unsupported_file_type",
					},
					output: `Error: Unsupported file type for ${file_path}`,
				}

				pushToolResult(JSON.stringify(result, null, 2))
				return
			}

			// 读取文件内容
			// const sourceCode = readFileSync(absolutePath, 'utf-8');

			// 加载语言对象（用于创建查询）
			// const lang = await treeSitterService.loadLanguage(language)

			const parsers = await loadRequiredLanguageParsers([absolutePath])

			// 获取文件扩展名
			const ext = path.extname(absolutePath).toLowerCase().slice(1)

			// 获取对应的 parser 和 query
			const parserData = parsers[ext]
			if (!parserData) {
				const result = {
					title: "解析失败",
					metadata: {
						file_path,
						language: language || "unknown",
						definition_count: 0,
						error: "parser_not_found",
					},
					output: `Error: No parser found for extension .${ext}`,
				}
				pushToolResult(JSON.stringify(result, null, 2))
				return
			}

			const { parser, query } = parserData

			// 读取文件内容
			const sourceCode = readFileSync(absolutePath, "utf-8")

			// 解析代码
			const tree = parser.parse(sourceCode)

			if (!tree) {
				const result = {
					title: "解析失败",
					metadata: {
						file_path,
						language,
						definition_count: 0,
						error: "parse_failed",
					},
					output: `Error: Failed to parse ${file_path}`,
				}
				pushToolResult(JSON.stringify(result, null, 2))
				return
			}

			// 执行查询
			const captures = query.captures(tree.rootNode)

			// 提取定义
			const definitions: Definition[] = []
			const docstringPattern = DOCSTRING_PATTERNS[language]

			// 使用 Set 去重，避免重复定义
			const processedIds = new Set<string>()

			for (const capture of captures) {
				const node = capture.node
				const captureName = capture.name

				// 只处理定义类型的捕获
				if (
					captureName === "name.definition.class" ||
					captureName === "name.definition.function" ||
					captureName === "name.definition.method"
				) {
					const line = node.startPosition.row + 1
					const name = node.text

					// 使用节点位置作为唯一标识符去重
					const nodeId = `${line}-${name}-${captureName}`
					if (processedIds.has(nodeId)) {
						continue
					}
					processedIds.add(nodeId)

					// 获取完整签名（父节点）
					const defNode = node.parent
					const signature = defNode
						? sourceCode.substring(defNode.startIndex, defNode.endIndex).split("\n")[0]
						: name

					// 确定类型
					let kind: string
					if (captureName === "name.definition.class") {
						kind = "Class"
					} else if (captureName === "name.definition.method") {
						kind = "Method"
					} else {
						kind = "Function"
					}

					// 提取文档字符串
					let docstring: string | undefined
					if (include_docstrings && docstringPattern && defNode) {
						docstring = extractDocstring(defNode, sourceCode, docstringPattern)
					}

					definitions.push({
						line,
						name,
						kind,
						signature,
						docstring,
					})
				}
			}

			// 按行号排序
			definitions.sort((a, b) => a.line - b.line)

			// 格式化输出
			const output = formatDefinitions(definitions, file_path)

			const result = {
				title: `File Outline: ${file_path}`,
				metadata: {
					file_path,
					language,
					definition_count: definitions.length,
					error: "",
				},
				output,
			}
			pushToolResult(JSON.stringify(result, null, 2))
			return
		} catch (error) {
			const result = {
				title: "文件分析失败",
				metadata: {
					file_path,
					language: "unknown",
					definition_count: 0,
					error: error instanceof Error ? error.message : String(error),
				},
				output: `Error : ${error instanceof Error ? error.message : String(error)}`,
			}

			pushToolResult(JSON.stringify(result, null, 2))
			return
		}
	}

	override async handlePartial(task: Task, block: ToolUse<"file_outline">): Promise<void> {
		const filePath: string | undefined = block.params.file_path
		if (filePath) {
			const absolutePath = path.resolve(task.cwd, filePath)
			const isOutsideWorkspace = isPathOutsideWorkspace(absolutePath)
			const readablePath = getReadablePath(task.cwd, filePath)

			await task
				.ask(
					"tool",
					JSON.stringify({
						tool: "file_outline",
						path: readablePath,
						isOutsideWorkspace,
					}),
					block.partial,
				)
				.catch(() => {})
		}
	}
}

export const fileOutlineTool = new FileOutlineTool()
