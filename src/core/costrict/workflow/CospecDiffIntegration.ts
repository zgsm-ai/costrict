/**
 * .cospec 文档差异集成工具
 * 用于在 handleUpdateSection 中获取文件与 checkpoint 的差异
 */

import * as path from "path"
import * as vscode from "vscode"
import { CospecMetadataManager } from "./CospecMetadataManager"
import { simpleGit, SimpleGit } from "simple-git"


/**
 * .cospec 文档差异集成工具类
 */
export class CospecDiffIntegration {
	/**
	 * 从指定文件获取与 checkpoint 的差异
	 * 优先使用 .cometa.json 中的信息，如果没有则查找最近的任务
	 */
	static async getDiffForFile(
		uri: vscode.Uri,
		globalStorageDir: string
	): Promise<any | null> {
		try {
			const filePath = uri.fsPath
			const workspaceRoot = this.getWorkspaceRoot(uri)
			
			if (!workspaceRoot) {
				return {
					success: false,
					error: "无法确定工作区根目录"
				}
			}

			// 检查是否是 .cospec 文件
			if (!CospecMetadataManager.isCospecFile(filePath)) {
				return {
					success: false,
					error: "文件不在 .cospec 目录中"
				}
			}

			// 获取文件所在目录
			const directoryPath = path.dirname(filePath)
			const fileName = path.basename(filePath)
			
			// 尝试从 .cometa.json 获取元数据
			const metadata = await CospecMetadataManager.readMetadata(directoryPath)
			
			// 根据文件名获取对应的元数据
			const fileType = CospecDiffIntegration.getFileType(fileName)
			const fileMetadata = fileType && metadata?.[fileType]
			
			if (fileMetadata?.lastTaskId && fileMetadata?.lastCheckpointId) {
				// 使用元数据中的信息获取差异
				console.log(`[CospecDiffIntegration] 使用元数据获取差异`, {
					taskId: fileMetadata.lastTaskId,
					checkpointId: fileMetadata.lastCheckpointId,
					fileName,
					fileType
				})
				
				return await this.getDiffWithTaskInfo({
					fileName,
					lastTaskId: fileMetadata.lastTaskId,
					lastCheckpointId: fileMetadata.lastCheckpointId,
					workspaceRoot,
					globalStorageDir,
					filePath
			})
			} else {
				// 回退到查找最近任务
				console.log(`[CospecDiffIntegration] 元数据不完整，查找最近任务`, metadata)
				
				return null
			}
		} catch (error) {
			console.error(`[CospecDiffIntegration] 获取文件差异失败:`, error)
			return null
		}
	}

	/**
	 * 使用指定的任务信息获取差异 (核心)
	 */
	private static async getDiffWithTaskInfo({
		fileName,
		lastTaskId,
		lastCheckpointId,
		workspaceRoot,
		globalStorageDir,
		filePath,
	}: {
		fileName: string
		lastTaskId: string
		lastCheckpointId: string
		workspaceRoot: string
		globalStorageDir: string
		filePath: string
	}): Promise<any> {
		
		// 获取指定 checkpoint 的 影子仓库 git 信息存放路径
		const shadowGitDir = path.join(globalStorageDir, lastTaskId, lastCheckpointId)
		
		// 1.在 checkpoint 的 影子仓库中查找 fileName 文件 git diff 信息，和 diff 后的文件内容
		
	}

	/**
	 * 获取工作区根目录
	 */
	private static getWorkspaceRoot(uri: vscode.Uri): string | null {
		const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri)
		return workspaceFolder?.uri.fsPath || null
	}

	/**
	 * 格式化差异内容用于显示
	 */
	static formatDiffForDisplay(diffResult: any): string {
		if (!diffResult.success) {
			return `获取差异失败: ${diffResult.error}`
		}

		if (!diffResult.hasDifference) {
			return "文件与 checkpoint 版本相同，无差异"
		}

		if (!diffResult.diffContent) {
			return "文件有差异，但无法获取详细内容"
		}

		// 添加头部信息
		const header = [
			`文件: ${path.basename(diffResult.filePath || '')}`,
			`任务: ${diffResult.lastTaskId || 'unknown'}`,
			`差异内容:`,
			'---'
		].join('\n')

		return `${header}\n${diffResult.diffContent}`
	}

	/**
	 * 检查是否应该获取差异
	 * 基于文件类型和配置决定
	 */
	static shouldGetDiff(uri: vscode.Uri): boolean {
		const filePath = uri.fsPath
		const fileName = path.basename(filePath)
		
		// 只处理 .cospec 目录中的三个主要文件
		const supportedFiles = ['requirements.md', 'design.md', 'tasks.md']
		
		return CospecMetadataManager.isCospecFile(filePath) && 
			   supportedFiles.includes(fileName)
	}

	/**
	 * 更新文件的元数据（在文件修改后调用）
	 */
	static async updateFileMetadata(
		uri: vscode.Uri,
		taskId: string,
		checkpointId: string
	): Promise<void> {
		try {
			await CospecMetadataManager.updateMetadataFromUri(uri, taskId, checkpointId)
			console.log(`[CospecDiffIntegration] 更新文件元数据成功: ${uri.fsPath}`)
		} catch (error) {
			console.error(`[CospecDiffIntegration] 更新文件元数据失败: ${uri.fsPath}`, error)
			// 不抛出错误，避免影响主流程
		}
	}

	/**
	 * 根据文件名获取文件类型
	 */
	private static getFileType(fileName: string): 'design' | 'requirements' | 'tasks' | null {
		switch (fileName) {
			case 'design.md':
				return 'design'
			case 'requirements.md':
				return 'requirements'
			case 'tasks.md':
				return 'tasks'
			default:
				return null
		}
	}
}