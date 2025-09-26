import { promises as fs } from "fs"
import * as path from "path"
import * as os from "os"
import { PROJECT_WIKI_TEMPLATE } from "./wiki-prompts/project-wiki"
import { PROJECT_OVERVIEW_ANALYSIS_TEMPLATE } from "./wiki-prompts/subtasks/01_Project_Overview_Analysis"
import { OVERALL_ARCHITECTURE_ANALYSIS_TEMPLATE } from "./wiki-prompts/subtasks/02_Overall_Architecture_Analysis"
import { SERVICE_DEPENDENCIES_ANALYSIS_TEMPLATE } from "./wiki-prompts/subtasks/03_Service_Dependencies_Analysis"
import { DATA_FLOW_INTEGRATION_ANALYSIS_TEMPLATE } from "./wiki-prompts/subtasks/04_Data_Flow_Integration_Analysis"
import { SERVICE_ANALYSIS_TEMPLATE } from "./wiki-prompts/subtasks/05_Service_Analysis_Template"
import { DATABASE_SCHEMA_ANALYSIS_TEMPLATE } from "./wiki-prompts/subtasks/06_Database_Schema_Analysis"
import { API_INTERFACE_ANALYSIS_TEMPLATE } from "./wiki-prompts/subtasks/07_API_Interface_Analysis"
import { DEPLOY_ANALYSIS_TEMPLATE } from "./wiki-prompts/subtasks/08_Deploy_Analysis"
import { PROJECT_RULES_GENERATION_TEMPLATE } from "./wiki-prompts/subtasks/09_Project_Rules_Generation"
import { ILogger, createLogger } from "../../../utils/logger"

// Safely get home directory
function getHomeDir(): string {
	const homeDir = os.homedir()
	if (!homeDir) {
		throw new Error("Unable to determine home directory")
	}
	return homeDir
}

// Get global commands directory path
function getGlobalCommandsDir(): string {
	return path.join(getHomeDir(), ".roo", "commands")
}

export const projectWikiCommandName = "project-wiki"
export const projectWikiCommandDescription = `Analyze project deeply and generate a comprehensive project wiki.`

const logger: ILogger = createLogger()

// Unified error handling function, preserving stack information
function formatError(error: unknown): string {
	if (error instanceof Error) {
		return error.stack || error.message
	}
	return String(error)
}

const mainFileName: string = projectWikiCommandName + ".md"
// Template data mapping
const TEMPLATES = {
	[mainFileName]: PROJECT_WIKI_TEMPLATE,
	"01_Project_Overview_Analysis.md": PROJECT_OVERVIEW_ANALYSIS_TEMPLATE,
	"02_Overall_Architecture_Analysis.md": OVERALL_ARCHITECTURE_ANALYSIS_TEMPLATE,
	"03_Service_Dependencies_Analysis.md": SERVICE_DEPENDENCIES_ANALYSIS_TEMPLATE,
	"04_Data_Flow_Integration_Analysis.md": DATA_FLOW_INTEGRATION_ANALYSIS_TEMPLATE,
	"05_Service_Analysis_Template.md": SERVICE_ANALYSIS_TEMPLATE,
	"06_Database_Schema_Analysis.md": DATABASE_SCHEMA_ANALYSIS_TEMPLATE,
	"07_API_Interface_Analysis.md": API_INTERFACE_ANALYSIS_TEMPLATE,
	"08_Deploy_Analysis.md": DEPLOY_ANALYSIS_TEMPLATE,
	"09_Project_Rules_Generation.md": PROJECT_RULES_GENERATION_TEMPLATE,
}

export async function ensureProjectWikiCommandExists() {
	const startTime = Date.now()
	logger.info("[projectWikiHelpers] Starting ensureProjectWikiCommandExists...")

	try {
		const globalCommandsDir = getGlobalCommandsDir()
		await fs.mkdir(globalCommandsDir, { recursive: true })

		const projectWikiFile = path.join(globalCommandsDir, `${projectWikiCommandName}.md`)
		const subTaskDir = path.join(globalCommandsDir, "subtasks")

		// Check if setup is needed
		const needsSetup = await checkIfSetupNeeded(projectWikiFile, subTaskDir)
		if (!needsSetup) {
			logger.info("[projectWikiHelpers] project-wiki command already exists")
			return
		}

		logger.info("[projectWikiHelpers] Setting up project-wiki command...")

		// Clean up existing files
		await Promise.allSettled([
			fs.rm(projectWikiFile, { force: true }),
			fs.rm(subTaskDir, { recursive: true, force: true }),
		])

		// Generate Wiki files
		await generateWikiCommandFiles(projectWikiFile, subTaskDir)

		const duration = Date.now() - startTime
		logger.info(`[projectWikiHelpers] project-wiki command setup completed in ${duration}ms`)
	} catch (error) {
		const errorMsg = formatError(error)
		console.error("[commands] Failed to initialize project-wiki command:", errorMsg)
	}
}

// Optimized file checking logic, using Promise.allSettled to improve performance
async function checkIfSetupNeeded(projectWikiFile: string, subTaskDir: string): Promise<boolean> {
	try {
		const [mainFileResult, subDirResult] = await Promise.allSettled([
			fs.access(projectWikiFile, fs.constants.F_OK | fs.constants.R_OK | fs.constants.W_OK),
			fs.stat(subTaskDir),
		])

		// If main file doesn't exist, setup is needed
		if (mainFileResult.status === "rejected") {
			logger.info("[projectWikiHelpers] projectWikiFile not accessible:", formatError(mainFileResult.reason))
			return true
		}

		// If subtask directory doesn't exist or is not a directory, setup is needed
		if (subDirResult.status === "rejected") {
			logger.info("[projectWikiHelpers] subTaskDir not accessible:", formatError(subDirResult.reason))
			return true
		}

		if (!subDirResult.value.isDirectory()) {
			logger.info("[projectWikiHelpers] subTaskDir exists but is not a directory")
			return true
		}

		// Check if subtask directory has .md files
		const subTaskFiles = await fs.readdir(subTaskDir)
		const mdFiles = subTaskFiles.filter((file) => file.endsWith(".md"))
		return mdFiles.length === 0
	} catch (error) {
		logger.error("[projectWikiHelpers] Error checking setup status:", formatError(error))
		return true
	}
}

// Generate Wiki files
async function generateWikiCommandFiles(projectWikiFile: string, subTaskDir: string): Promise<void> {
	try {
		// Generate main file
		const mainTemplate = TEMPLATES[mainFileName]
		if (!mainTemplate) {
			throw new Error("Main template not found")
		}

		await fs.writeFile(projectWikiFile, mainTemplate, "utf-8")
		logger.info(`[projectWikiHelpers] Generated main wiki file: ${projectWikiFile}`)

		// Create subtask directory
		await fs.mkdir(subTaskDir, { recursive: true })

		// Generate subtask files
		const subTaskFiles = Object.keys(TEMPLATES).filter((file) => file !== mainFileName)
		const generateResults = await Promise.allSettled(
			subTaskFiles.map(async (file) => {
				const template = TEMPLATES[file as keyof typeof TEMPLATES]
				if (!template) {
					throw new Error(`Template not found for file: ${file}`)
				}

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
			failed.forEach((result, index) => {
				if (result.status === "rejected") {
					logger.warn(`  - ${subTaskFiles[generateResults.indexOf(result)]}: ${formatError(result.reason)}`)
				}
			})
		}
	} catch (error) {
		const errorMsg = formatError(error)
		throw new Error(`Failed to generate wiki files: ${errorMsg}`)
	}
}
