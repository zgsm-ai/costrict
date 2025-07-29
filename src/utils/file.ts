import path from "path"

// 文件扩展名到编程语言的映射表
const LANGUAGE_MAP: Record<string, string> = {
	// JavaScript/TypeScript
	".js": "JavaScript",
	".jsx": "JavaScript",
	".ts": "TypeScript",
	".tsx": "TypeScript",
	".mjs": "JavaScript",
	".cjs": "JavaScript",

	// Web 前端
	".html": "HTML",
	".htm": "HTML",
	".css": "CSS",
	".scss": "SCSS",
	".sass": "Sass",
	".less": "Less",
	".vue": "Vue",
	".svelte": "Svelte",

	// Python
	".py": "Python",
	".pyw": "Python",
	".pyi": "Python",
	".ipynb": "Jupyter Notebook",

	// Java 系列
	".java": "Java",
	".kt": "Kotlin",
	".kts": "Kotlin",
	".scala": "Scala",
	".groovy": "Groovy",

	// C/C++
	".c": "C",
	".h": "C",
	".cpp": "C++",
	".cxx": "C++",
	".cc": "C++",
	".hpp": "C++",
	".hxx": "C++",

	// C#
	".cs": "C#",
	".csx": "C#",

	// Go
	".go": "Go",

	// Rust
	".rs": "Rust",

	// PHP
	".php": "PHP",
	".phtml": "PHP",

	// Ruby
	".rb": "Ruby",
	".rbw": "Ruby",

	// Swift
	".swift": "Swift",

	// Objective-C
	".m": "Objective-C",
	".mm": "Objective-C",

	// Shell 脚本
	".sh": "Shell",
	".bash": "Shell",
	".zsh": "Shell",
	".fish": "Shell",
	".ps1": "PowerShell",
	".bat": "Batch",
	".cmd": "Batch",

	// 数据格式
	".json": "JSON",
	".xml": "XML",
	".yaml": "YAML",
	".yml": "YAML",
	".toml": "TOML",
	".ini": "Config",
	".cfg": "Config",
	".conf": "Config",

	// 标记语言
	".md": "Markdown",
	".mdx": "Markdown",
	".tex": "LaTeX",
	".rst": "Text",

	// SQL
	".sql": "SQL",

	// R
	".r": "R",
	".R": "R",

	// Dart
	".dart": "Dart",

	// Lua
	".lua": "Lua",

	// Perl
	".pl": "Perl",
	".pm": "Perl",

	// 其他
	".dockerfile": "Dockerfile",
	".Dockerfile": "Dockerfile",
	".makefile": "Makefile",
	".Makefile": "Makefile",
	".cmake": "CMake",
	".gradle": "Gradle",
	".gitignore": "Text",
	".env": "Config",
}

export async function getLanguage(filePath: string): Promise<string> {
	// 获取文件扩展名
	const ext = path.extname(filePath).toLowerCase()

	// 处理特殊文件名（没有扩展名但可以识别语言的文件）
	const fileName = path.basename(filePath).toLowerCase()

	// 特殊文件名映射
	const specialFiles: Record<string, string> = {
		dockerfile: "Dockerfile",
		makefile: "Makefile",
		"cmakelist.txt": "CMake",
		"package.json": "JSON",
		"tsconfig.json": "JSON",
		"webpack.config.js": "JavaScript",
		"vite.config.js": "JavaScript",
		"rollup.config.js": "JavaScript",
		".gitignore": "Text",
		".eslintrc": "JSON",
		".prettierrc": "JSON",
	}

	// 优先检查特殊文件名
	if (specialFiles[fileName]) {
		return specialFiles[fileName]
	}

	// 根据扩展名查找语言
	if (ext && LANGUAGE_MAP[ext]) {
		return LANGUAGE_MAP[ext]
	}

	// 如果找不到对应的语言，返回未知
	return "Unknown"
}
