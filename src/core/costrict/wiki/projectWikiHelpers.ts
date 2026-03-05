import { promises as fs } from "fs"
import * as path from "path"
import { formatError, getSubtaskDir } from "./wiki-prompts/common/constants"
import { ILogger, createLogger } from "../../../utils/logger"
import { resolveI18nSubtaskTemplates, SubtaskTemplates } from "@roo-code/types"

export const projectWikiCommandName = "project-wiki"
export const projectWikiCommandDescription = `Performs deep project analysis and creates comprehensive technical documentation (v2)`

// 创建 logger 实例，但允许在测试时被替换
let logger: ILogger = createLogger()

// 导出 logger setter 以便测试时可以替换
export function setLogger(testLogger: ILogger): void {
	logger = testLogger
}

export async function ensureProjectWikiSubtasksExists(language: string = "en") {
	const startTime = Date.now()
	logger.info(`[projectWikiHelpers] Starting ensureProjectWikiSubtasksExists for language: ${language}...`)

	const subtaskDir = getSubtaskDir(language)

	try {
		// Ensure subtask directory exists
		await fs.mkdir(subtaskDir, { recursive: true })

		// Get i18n subtask templates for the language
		const subtaskTemplates = resolveI18nSubtaskTemplates(language)

		// Check if subtask setup is needed
		const needsSetup = await checkIfSubtaskSetupNeeded(subtaskDir, subtaskTemplates)
		if (!needsSetup) {
			logger.info(`[projectWikiHelpers] project-wiki subtasks already exist for language: ${language}`)
			return
		}

		logger.info(`[projectWikiHelpers] Setting up project-wiki subtasks for language: ${language}...`)

		// Clean up existing subtask directory
		await fs.rm(subtaskDir, { recursive: true, force: true })

		// Generate subtask files
		await generateSubtaskFiles(subtaskDir, subtaskTemplates)

		const duration = Date.now() - startTime
		logger.info(
			`[projectWikiHelpers] project-wiki subtasks setup completed in ${duration}ms for language: ${language}`,
		)
	} catch (error) {
		const errorMsg = formatError(error)
		console.error(`[commands] Failed to initialize project-wiki subtasks for language ${language}:`, errorMsg)
	}
}

// Check if subtask directory is valid
async function checkSubtaskDirectory(subTaskDir: string, subtaskTemplates: SubtaskTemplates): Promise<boolean> {
	try {
		const subDirResult = await fs.stat(subTaskDir)

		if (!subDirResult.isDirectory()) {
			logger.info("[projectWikiHelpers] subTaskDir exists but is not a directory")
			return false
		}

		// Check if subtask directory has .md files
		const subTaskFiles = await fs.readdir(subTaskDir)
		const mdFiles = subTaskFiles.filter((file) => file.endsWith(".md"))

		// subtask file check.
		const subTaskFileNames = Object.keys(subtaskTemplates)
		const missingSubTaskFiles = subTaskFileNames.filter((fileName) => !mdFiles.includes(fileName))

		if (missingSubTaskFiles.length > 0) {
			logger.info(`[projectWikiHelpers] Missing subtask files: ${missingSubTaskFiles.join(", ")}`)
			return false
		}

		return mdFiles.length > 0
	} catch (error) {
		logger.info("[projectWikiHelpers] subTaskDir not accessible:", formatError(error))
		return false
	}
}

// Check if subtask setup is needed
async function checkIfSubtaskSetupNeeded(subTaskDir: string, subtaskTemplates: SubtaskTemplates): Promise<boolean> {
	try {
		const isSubtaskDirValid = await checkSubtaskDirectory(subTaskDir, subtaskTemplates)
		return !isSubtaskDirValid
	} catch (error) {
		logger.info("[projectWikiHelpers] subTaskDir not accessible:", formatError(error))
		return true
	}
}

// Generate subtask files
async function generateSubtaskFiles(subTaskDir: string, subtaskTemplates: SubtaskTemplates): Promise<void> {
	try {
		// Create subtask directory
		await fs.mkdir(subTaskDir, { recursive: true })

		// Generate subtask files
		const subTaskFiles = Object.keys(subtaskTemplates)
		const generateResults = await Promise.allSettled(
			subTaskFiles.map(async (file) => {
				const templateFactory = subtaskTemplates[file]
				if (!templateFactory) {
					throw new Error(`Template not found for file: ${file}`)
				}

				const template = templateFactory("${workspaceFolder}/")
				const targetFile = path.join(subTaskDir, file)
				await fs.writeFile(targetFile, template, "utf-8")
				return file
			}),
		)

		// Count generation results
		const successful = generateResults.filter((result) => result.status === "fulfilled")
		const failed = generateResults.filter((result) => result.status === "rejected")

		logger.info(`[projectWikiHelpers] Successfully generated ${successful.length} subtask files`)

		if (failed.length > 0) {
			logger.warn(`[projectWikiHelpers] Failed to generate ${failed.length} subtask files:`)
			failed.forEach((result) => {
				if (result.status === "rejected") {
					logger.warn(`  - ${subTaskFiles[generateResults.indexOf(result)]}: ${formatError(result.reason)}`)
				}
			})
		}
	} catch (error) {
		const errorMsg = formatError(error)
		throw new Error(`Failed to generate subtask files: ${errorMsg}`)
	}
}
