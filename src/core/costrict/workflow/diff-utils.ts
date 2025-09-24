import fs from "fs/promises"
import * as path from "path"
import * as diff from "diff"
import type { ClineMessage } from "@roo-code/types"
import type { Task } from "../../task/Task"
import type { RepoPerTaskCheckpointService } from "../../../services/checkpoints/RepoPerTaskCheckpointService"

/**
 * Checkpoint 文件信息接口
 */
export interface CheckpointFileInfo {
	/** 文件路径 */
	filePath: string
	/** 文件内容 */
	content: string
	/** Checkpoint hash */
	checkpointHash: string
	/** 是否存在于 checkpoint 中 */
	exists: boolean
}

/**
 * 文件差异结果接口
 */
export interface FileDiffResult {
	/** 文件路径 */
	filePath: string
	/** Checkpoint 中的内容 */
	checkpointContent: string | null
	/** 本地文件内容 */
	localContent: string | null
	/** 差异字符串 */
	diffString: string | null
	/** 是否有差异 */
	hasDifference: boolean
	/** 错误信息 */
	error?: string
}

/**
 * 获取最近一次 checkpoint 的 hash
 *
 * @param task - Task 实例
 * @returns checkpoint hash 或 null（如果没有找到）
 *
 * @example
 * ```typescript
 * const latestCheckpoint = getLatestCheckpoint(task);
 * if (latestCheckpoint) {
 *   console.log('Latest checkpoint:', latestCheckpoint);
 * }
 * ```
 */
export function getLatestCheckpoint(task: Task): string | null {
	try {
		// 从 task.clineMessages 中筛选 checkpoint_saved 消息
		const checkpointMessages = task.clineMessages
			.filter(
				(message: ClineMessage) => message.type === "say" && message.say === "checkpoint_saved" && message.text,
			)
			.sort((a, b) => (b.ts || 0) - (a.ts || 0)) // 按时间戳降序排列

		if (checkpointMessages.length === 0) {
			return null
		}

		// 返回最新的 checkpoint hash
		return checkpointMessages[0].text || null
	} catch (error) {
		console.error("[getLatestCheckpoint] 获取最新 checkpoint 失败:", error)
		return null
	}
}

/**
 * 在指定 checkpoint 中查找文件内容
 *
 * @param checkpointService - Checkpoint 服务实例
 * @param checkpointHash - Checkpoint hash
 * @param filePath - 文件路径（相对于工作区根目录）
 * @returns 文件内容字符串或 null（如果文件不存在）
 *
 * @example
 * ```typescript
 * const content = await findFileInCheckpoint(
 *   checkpointService,
 *   'abc123',
 *   '.cospec/requirements.md'
 * );
 * if (content) {
 *   console.log('File content:', content);
 * }
 * ```
 */
export async function findFileInCheckpoint(
	checkpointService: RepoPerTaskCheckpointService,
	checkpointHash: string,
	filePath: string,
): Promise<string | null> {
	try {
		if (!checkpointService.isInitialized) {
			throw new Error("Checkpoint service 未初始化")
		}

		// 使用 checkpointService 的 Git 操作获取指定 commit 中的文件内容
		const git = (checkpointService as any).git
		if (!git) {
			throw new Error("Git 实例不可用")
		}

		// 使用 git show 命令获取文件内容
		const content = await git.show([`${checkpointHash}:${filePath}`])
		return content || null
	} catch (error) {
		// 如果文件不存在或其他错误，返回 null
		console.error(
			`[findFileInCheckpoint] 获取文件 ${filePath} 在 checkpoint ${checkpointHash} 中的内容失败:`,
			error,
		)
		return null
	}
}

/**
 * 获取 .cospec 目录下指定文件的差异
 *
 * @param task - Task 实例
 * @param filePath - 文件路径（相对于 .cospec 目录）
 * @param workspaceRoot - 工作区根目录路径
 * @returns 差异结果对象
 *
 * @example
 * ```typescript
 * const diffResult = await getCospecFileDiff(
 *   task,
 *   'requirements.md',
 *   '/path/to/workspace'
 * );
 * if (diffResult.hasDifference) {
 *   console.log('Diff:', diffResult.diffString);
 * }
 * ```
 */
export async function getCospecFileDiff(task: Task, filePath: string, workspaceRoot: string): Promise<FileDiffResult> {
	const result: FileDiffResult = {
		filePath,
		checkpointContent: null,
		localContent: null,
		diffString: null,
		hasDifference: false,
	}

	try {
		// 1. 调用 getLatestCheckpoint 获取最新 checkpoint
		const latestCheckpoint = getLatestCheckpoint(task)
		if (!latestCheckpoint) {
			result.error = "未找到可用的 checkpoint"
			return result
		}

		// 2. 构建完整的文件路径
		const fullFilePath = path.join(".cospec", filePath)
		const absoluteFilePath = path.join(workspaceRoot, fullFilePath)

		// 3. 调用 findFileInCheckpoint 获取 checkpoint 中的文件内容
		if (!task.checkpointService) {
			result.error = "Checkpoint service 不可用"
			return result
		}

		result.checkpointContent = await findFileInCheckpoint(task.checkpointService, latestCheckpoint, fullFilePath)

		// 4. 读取本地文件内容
		try {
			result.localContent = await fs.readFile(absoluteFilePath, "utf8")
		} catch (error) {
			// 本地文件可能不存在，这是正常情况
			result.localContent = null
		}

		// 5. 使用 diff 库生成差异
		if (result.checkpointContent !== null || result.localContent !== null) {
			const oldContent = result.checkpointContent || ""
			const newContent = result.localContent || ""

			// 检查是否有差异
			result.hasDifference = oldContent !== newContent

			if (result.hasDifference) {
				// 生成统一格式的差异
				const patches = diff.createPatch(filePath, oldContent, newContent, "checkpoint 版本", "本地版本")
				result.diffString = patches
			} else {
				result.diffString = "文件内容相同，无差异"
			}
		} else {
			result.error = "无法获取文件内容进行比较"
		}

		return result
	} catch (error) {
		result.error = `获取文件差异失败: ${error instanceof Error ? error.message : String(error)}`
		console.error("[getCospecFileDiff] 获取文件差异失败:", error)
		return result
	}
}

/**
 * 批量获取 .cospec 目录下多个文件的差异
 *
 * @param task - Task 实例
 * @param filePaths - 文件路径数组（相对于 .cospec 目录）
 * @param workspaceRoot - 工作区根目录路径
 * @returns 差异结果数组
 *
 * @example
 * ```typescript
 * const diffResults = await getMultipleCospecFilesDiff(
 *   task,
 *   ['requirements.md', 'design.md', 'tasks.md'],
 *   '/path/to/workspace'
 * );
 * diffResults.forEach(result => {
 *   if (result.hasDifference) {
 *     console.log(`${result.filePath} has changes`);
 *   }
 * });
 * ```
 */
export async function getMultipleCospecFilesDiff(
	task: Task,
	filePaths: string[],
	workspaceRoot: string,
): Promise<FileDiffResult[]> {
	const results: FileDiffResult[] = []

	for (const filePath of filePaths) {
		try {
			const result = await getCospecFileDiff(task, filePath, workspaceRoot)
			results.push(result)
		} catch (error) {
			// 为失败的文件创建错误结果
			results.push({
				filePath,
				checkpointContent: null,
				localContent: null,
				diffString: null,
				hasDifference: false,
				error: `处理文件 ${filePath} 时出错: ${error instanceof Error ? error.message : String(error)}`,
			})
		}
	}

	return results
}

/**
 * 检查 .cospec 目录下的文件是否在最新 checkpoint 中存在
 *
 * @param task - Task 实例
 * @param filePath - 文件路径（相对于 .cospec 目录）
 * @returns CheckpointFileInfo 对象，包含文件信息
 *
 * @example
 * ```typescript
 * const fileInfo = await checkFileInLatestCheckpoint(task, 'requirements.md');
 * if (fileInfo.exists) {
 *   console.log('File exists in checkpoint:', fileInfo.content);
 * }
 * ```
 */
export async function checkFileInLatestCheckpoint(task: Task, filePath: string): Promise<CheckpointFileInfo> {
	const result: CheckpointFileInfo = {
		filePath,
		content: "",
		checkpointHash: "",
		exists: false,
	}

	try {
		// 获取最新 checkpoint
		const latestCheckpoint = getLatestCheckpoint(task)
		if (!latestCheckpoint) {
			return result
		}

		result.checkpointHash = latestCheckpoint

		// 检查文件是否存在于 checkpoint 中
		if (!task.checkpointService) {
			return result
		}

		const fullFilePath = path.join(".cospec", filePath)
		const content = await findFileInCheckpoint(task.checkpointService, latestCheckpoint, fullFilePath)

		if (content !== null) {
			result.exists = true
			result.content = content
		}

		return result
	} catch (error) {
		console.error("[checkFileInLatestCheckpoint] 检查文件失败:", error)
		return result
	}
}
