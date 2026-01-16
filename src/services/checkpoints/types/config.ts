import type { CheckpointDiff } from "../types"

/**
 * Checkpoint 配置文件结构
 * 对应 .costrict-checkpoint.json 文件
 */
export interface CheckpointConfig {
	checkpoints: {
		enabledRepos?: string[] // 明确启用 checkpoint 的仓库名称列表
		disabledRepos?: string[] // 明确禁用 checkpoint 的仓库名称列表
		defaultBehavior?: "enabled" | "disabled" // 默认行为
	}
}

/**
 * 解析后的标准化配置对象
 */
export interface ParsedCheckpointConfig {
	enabledRepos: Set<string>
	disabledRepos: Set<string>
	defaultBehavior: "enabled" | "disabled"
}

/**
 * Git 仓库信息
 */
export interface RepoInfo {
	name: string // 仓库名称（相对于 workspaceDir）
	path: string // 仓库绝对路径
	isNested: boolean // 是否为嵌套仓库
	parentRepo?: string // 如果是嵌套，父仓库的名称
}

/**
 * 多仓库 checkpoint 操作结果
 */
export interface MultiCheckpointResult {
	repoName: string
	success: boolean
	commitHash?: string
	error?: string
}

/**
 * 多仓库 diff 操作结果
 */
export interface MultiDiffResult {
	repoName: string
	changes?: CheckpointDiff[]
	error?: string
}
