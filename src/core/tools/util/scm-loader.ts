/**
 * SCM查询文件加载器
 * 用于加载TreeSitter的查询文件
 * 使用 .ts 文件导出字符串常量（避免 Bun 打包时的路径问题）
 */

// 直接 import .ts 文件（导出字符串常量）
import pythonQuery from "../query/python-tags"
import javascriptQuery from "../query/javascript-tags"
import typescriptQuery from "../query/typescript-tags"
import goQuery from "../query/go-tags"
import javaQuery from "../query/java-tags"
import cQuery from "../query/c-tags"
import cppQuery from "../query/cpp-tags"

/**
 * 支持的语言列表
 */
export const SUPPORTED_LANGUAGES = ["python", "javascript", "typescript", "go", "java", "c", "cpp"] as const

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

/**
 * 加载SCM查询文件
 * @param language - 语言名称（如 'python', 'javascript'）
 * @returns SCM查询文本内容
 * @throws 如果语言不支持
 */
export function loadScmQuery(language: string): string {
	switch (language) {
		case "python":
			return pythonQuery
		case "javascript":
			return javascriptQuery
		case "typescript":
			return typescriptQuery
		case "go":
			return goQuery
		case "java":
			return javaQuery
		case "c":
			return cQuery
		case "cpp":
			return cppQuery
		default:
			throw new Error(`Unsupported language: ${language}`)
	}
}

/**
 * 检查是否支持指定语言
 * @param language - 语言名称
 * @returns 是否支持
 */
export function isSupportedLanguage(language: string): language is SupportedLanguage {
	return SUPPORTED_LANGUAGES.includes(language as SupportedLanguage)
}

/**
 * 从文件扩展名检测语言
 * @param filename - 文件名或文件路径
 * @returns 语言名称，如果无法识别则返回 null
 */
export function detectLanguageFromFilename(filename: string): SupportedLanguage | null {
	const ext = filename.split(".").pop()?.toLowerCase()

	switch (ext) {
		case "py":
			return "python"
		case "js":
		case "jsx":
		case "mjs":
		case "cjs":
			return "javascript"
		case "ts":
		case "tsx":
			return "typescript"
		case "go":
			return "go"
		case "java":
			return "java"
		case "c":
		case "h":
			return "c"
		case "cpp":
		case "cc":
		case "cxx":
		case "hpp":
		case "hh":
		case "hxx":
			return "cpp"
		default:
			return null
	}
}
