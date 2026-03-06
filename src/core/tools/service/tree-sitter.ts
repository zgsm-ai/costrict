/**
 * TreeSitter服务 - Bun适配版本
 * 提供统一的TreeSitter解析器接口，支持多种编程语言的AST解析
 * 使用lazy加载避免构建时解析WASM路径
 */

import { Parser, Language, Tree } from "web-tree-sitter"
import { fileURLToPath } from "url"
import * as path from "path"

export function lazy<T>(fn: () => T) {
	let value: T | undefined
	let loaded = false

	const result = (): T => {
		if (loaded) return value as T
		loaded = true
		value = fn()
		return value as T
	}

	result.reset = () => {
		loaded = false
		value = undefined
	}

	return result
}

// 导出类型定义
export type { Language, Tree, Parser } from "web-tree-sitter"

/**
 * 解析WASM资源路径（复用项目现有机制）
 */
const resolveWasm = (asset: string) => {
	if (asset.startsWith("file://")) return fileURLToPath(asset)
	if (asset.startsWith("/") || /^[a-z]:/i.test(asset)) return asset
	const url = new URL(asset, import.meta.url)
	return fileURLToPath(url)
}

/**
 * 语言到文件扩展名的映射
 */
export const LANGUAGE_EXTENSIONS: Record<string, string[]> = {
	python: [".py", ".pyw"],
	java: [".java"],
	javascript: [".js", ".jsx", ".mjs", ".cjs"],
	typescript: [".ts", ".tsx"],
	go: [".go"],
	cpp: [".cpp", ".cc", ".cxx", ".hpp", ".h", ".hh", ".hxx"],
	c: [".c", ".h"],
}

/**
 * 扩展名到语言的反向映射
 */
export const EXTENSION_TO_LANGUAGE: Record<string, string> = {}
for (const [lang, exts] of Object.entries(LANGUAGE_EXTENSIONS)) {
	for (const ext of exts) {
		EXTENSION_TO_LANGUAGE[ext] = lang
	}
}

/**
 * 延迟加载Python语言
 */
const loadPython = lazy(async () => {
	const wasmPath = path.join(__dirname, "tree-sitter-python.wasm")
	return await Language.load(wasmPath)
})

/**
 * 延迟加载Java语言
 */
const loadJava = lazy(async () => {
	const wasmPath = path.join(__dirname, "tree-sitter-java.wasm")
	return await Language.load(wasmPath)
})

/**
 * 延迟加载JavaScript语言
 */
const loadJavaScript = lazy(async () => {
	const wasmPath = path.join(__dirname, "tree-sitter-javascript.wasm")
	return await Language.load(wasmPath)
})

/**
 * 延迟加载TypeScript语言
 */
const loadTypeScript = lazy(async () => {
	const wasmPath = path.join(__dirname, "tree-sitter-typescript.wasm")
	return await Language.load(wasmPath)
})

/**
 * 延迟加载Go语言
 */
const loadGo = lazy(async () => {
	const wasmPath = path.join(__dirname, "tree-sitter-go.wasm")
	return await Language.load(wasmPath)
})

/**
 * 延迟加载C语言
 */
const loadC = lazy(async () => {
	const wasmPath = path.join(__dirname, "tree-sitter-c.wasm")
	return await Language.load(wasmPath)
})

/**
 * 延迟加载C++语言
 */
const loadCpp = lazy(async () => {
	const wasmPath = path.join(__dirname, "tree-sitter-cpp.wasm")
	return await Language.load(wasmPath)
})

/**
 * 延迟初始化Parser
 */
const initParser = lazy(async () => {
	const wasmPath = path.join(__dirname, "tree-sitter.wasm")

	await Parser.init({
		locateFile() {
			return wasmPath
		},
	})
})

/**
 * TreeSitter服务类
 * 提供解析器初始化、语言加载和代码解析功能
 */
export class TreeSitterService {
	/**
	 * 加载指定语言的WASM文件
	 * @param language - 语言标识符（如 'python', 'javascript'）
	 * @returns 语言对象
	 */
	async loadLanguage(language: string): Promise<Language> {
		// 确保Parser已初始化
		await initParser()

		// 根据语言类型加载对应的WASM
		// lazy() 返回的函数调用后返回 Promise，必须 await
		switch (language) {
			case "python":
				return await loadPython()
			case "java":
				return await loadJava()
			case "javascript":
				return await loadJavaScript()
			case "typescript":
				return await loadTypeScript()
			case "go":
				return await loadGo()
			case "c":
				return await loadC()
			case "cpp":
				return await loadCpp()
			default:
				throw new Error(`Unsupported language: ${language}`)
		}
	}

	/**
	 * 从文件路径获取语言标识符
	 * @param filePath - 文件路径
	 * @returns 语言标识符，如果不支持则返回 undefined
	 */
	getLanguageFromPath(filePath: string): string | undefined {
		const ext = filePath.substring(filePath.lastIndexOf(".")).toLowerCase()
		return EXTENSION_TO_LANGUAGE[ext]
	}

	/**
	 * 创建配置好的解析器
	 * @param language - 语言标识符
	 * @returns 配置好的Parser实例
	 */
	async createParser(language: string): Promise<Parser> {
		const lang = await this.loadLanguage(language)
		const parser = new Parser()
		parser.setLanguage(lang)
		return parser
	}

	/**
	 * 解析源代码并返回AST
	 * @param sourceCode - 源代码
	 * @param filePath - 文件路径（用于确定语言）
	 * @returns Tree对象，如果解析失败或语言不支持则返回 null
	 */
	async parseSourceCode(sourceCode: string, filePath: string): Promise<Tree | null> {
		const language = this.getLanguageFromPath(filePath)
		if (!language) {
			return null
		}

		try {
			const parser = await this.createParser(language)
			const tree = parser.parse(sourceCode)
			return tree
		} catch (error) {
			return null
		}
	}
}

/**
 * 全局单例实例
 */
export const treeSitterService = new TreeSitterService()
