import { promises as fs } from "fs"
import * as path from "path"
import { formatError } from "./wiki-prompts/common/constants"
import { PROJECT_WIKI_V2_REFACTORED_TEMPLATE } from "./wiki-prompts-v2/project_wiki_v2_refactored"
import { ILogger, createLogger } from "../../../utils/logger"

export const projectWikiCommandName = "project-wiki"
export const projectWikiCommandDescription = `执行项目深度分析并创建全面的项目技术文档（v2版本）`

// 创建 logger 实例，但允许在测试时被替换
let logger: ILogger = createLogger()

// 导出 logger setter 以便测试时可以替换
export function setLogger(testLogger: ILogger): void {
	logger = testLogger
}

// v2 版本不需要子任务文件，直接使用主模板
export async function ensureProjectWikiSubtasksExists() {
	const startTime = Date.now()
	logger.info("[projectWikiHelpers] Starting ensureProjectWikiSubtasksExists (v2)...")

	try {
		// v2 版本不需要子任务文件，直接返回
		logger.info("[projectWikiHelpers] v2 version does not require subtask files")
		
		const duration = Date.now() - startTime
		logger.info(`[projectWikiHelpers] v2 subtask check completed in ${duration}ms`)
	} catch (error) {
		const errorMsg = formatError(error)
		console.error("[commands] Failed to initialize project-wiki v2:", errorMsg)
	}
}

// 获取 v2 版本的主模板
export function getProjectWikiV2Template(workspace: string): string {
	return PROJECT_WIKI_V2_REFACTORED_TEMPLATE(workspace)
}

// v2 版本不需要生成子任务文件，但保留函数以保持兼容性
export async function generateSubtaskFiles(subTaskDir: string): Promise<void> {
	logger.info("[projectWikiHelpers] v2 version does not generate subtask files")
}

// v2 版本不需要检查子任务目录，但保留函数以保持兼容性
export async function checkSubtaskDirectory(subTaskDir: string): Promise<boolean> {
	logger.info("[projectWikiHelpers] v2 version does not check subtask directory")
	return true
}

// v2 版本不需要检查子任务设置，但保留函数以保持兼容性
export async function checkIfSubtaskSetupNeeded(subTaskDir: string): Promise<boolean> {
	logger.info("[projectWikiHelpers] v2 version does not need subtask setup")
	return false
}
