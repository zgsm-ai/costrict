export function getDependencyImports(filePath: string, codeContent: string): string[] {
	// 校验参数
	if (!filePath || !codeContent) {
		return []
	}
	const imports: string[] = []
	const lines = codeContent.split("\n")
	const fileExtension = filePath.split(".").pop()?.toLowerCase()

	switch (fileExtension) {
		case "py":
			// Python uses `import` and `from ... import ...`
			for (const line of lines) {
				const trimmedLine = line.trim()
				if (trimmedLine === "" || trimmedLine.startsWith("#")) {
					continue
				}
				if (trimmedLine.startsWith("import ") || trimmedLine.startsWith("from ")) {
					imports.push(trimmedLine)
				} else {
					break
				}
			}
			break

		case "java":
			// Java uses `import ...;`
			for (const line of lines) {
				const trimmedLine = line.trim()
				if (trimmedLine === "" || trimmedLine.startsWith("//") || trimmedLine.startsWith("/*")) {
					continue
				}
				if (trimmedLine.startsWith("import ") && trimmedLine.endsWith(";")) {
					imports.push(trimmedLine)
				} else {
					break
				}
			}
			break

		case "go": {
			// Go uses `import "..."` or `import (...)`
			let inImportBlock = false
			for (const line of lines) {
				const trimmedLine = line.trim()
				if (trimmedLine === "" || trimmedLine.startsWith("//") || trimmedLine.startsWith("/*")) {
					continue
				}
				if (trimmedLine.startsWith("import ")) {
					if (trimmedLine.includes("(")) {
						inImportBlock = true
					} else {
						imports.push(trimmedLine)
					}
				} else if (inImportBlock) {
					if (trimmedLine.endsWith(")")) {
						inImportBlock = false
					}
					imports.push(trimmedLine)
				} else {
					break
				}
			}
			break
		}
		case "js":
		case "ts":
			// JavaScript and TypeScript use `import ... from ...` or `require(...)`
			for (const line of lines) {
				const trimmedLine = line.trim()
				if (trimmedLine === "" || trimmedLine.startsWith("//") || trimmedLine.startsWith("/*")) {
					continue
				}
				if (
					trimmedLine.startsWith("import ") ||
					(trimmedLine.startsWith("const ") && trimmedLine.includes(" = require("))
				) {
					imports.push(trimmedLine)
				} else {
					break
				}
			}
			break

		case "c":
		case "cpp":
			// C/C++ uses `#include <...>` or `#include "..."`
			for (const line of lines) {
				const trimmedLine = line.trim()
				if (trimmedLine === "" || trimmedLine.startsWith("//") || trimmedLine.startsWith("/*")) {
					continue
				}
				if (trimmedLine.startsWith("#include ")) {
					imports.push(trimmedLine)
				} else {
					break
				}
			}
			break

		case "rs":
			// Rust uses `use ...`
			for (const line of lines) {
				const trimmedLine = line.trim()
				if (trimmedLine === "" || trimmedLine.startsWith("//") || trimmedLine.startsWith("/*")) {
					continue
				}
				if (trimmedLine.startsWith("use ")) {
					imports.push(trimmedLine)
				} else {
					break
				}
			}
			break

		default:
			throw new Error(`Unsupported file extension: ${fileExtension}`)
	}

	return imports
}
