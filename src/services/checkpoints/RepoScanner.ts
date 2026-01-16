import * as path from "path"
import { executeRipgrep } from "../../services/search/file-search"
import type { RepoInfo } from "./types/config"

export type { RepoInfo } from "./types/config"

export class RepoScanner {
	/**
	 * 扫描工作区，识别所有 Git 仓库
	 * @param workspaceDir 工作区根目录
	 * @returns 所有发现的仓库列表
	 */
	static async scanRepos(workspaceDir: string): Promise<RepoInfo[]> {
		try {
			const gitPaths = await executeRipgrep({
				args: ["--files", "--hidden", "--follow", "-g", "**/.git/HEAD", workspaceDir],
				workspacePath: workspaceDir,
				limit: 10000,
			})

			const repos: RepoInfo[] = []
			const processedRepos = new Set<string>()

			for (const gitPath of gitPaths) {
				// 从 .git/HEAD 路径提取仓库根目录
				const relativeGitDir = path.dirname(gitPath.path)
				const repoDir = path.dirname(relativeGitDir)

				// 标准化路径
				const normalizedRepoDir = path.normalize(repoDir).replace(/\\/g, "/")
				const absoluteRepoPath = path.normalize(path.join(workspaceDir, repoDir))

				// 使用相对路径作为名称（标准化为使用正斜杠）
				const name = normalizedRepoDir === "." ? "." : normalizedRepoDir

				// 避免重复处理相同的仓库
				if (processedRepos.has(name)) {
					continue
				}
				processedRepos.add(name)

				repos.push({
					name,
					path: absoluteRepoPath,
					isNested: false, // 稍后计算
					parentRepo: undefined, // 稍后计算
				})
			}

			// 计算嵌套关系
			for (const repo of repos) {
				const isNested = this.isNestedRepo(repo.path, repos)
				repo.isNested = isNested
				repo.parentRepo = this.getParentRepo(repo.path, repos)
			}

			return repos
		} catch (error) {
			console.error("Error scanning repos:", error)
			return []
		}
	}

	/**
	 * 过滤出独立仓库（非嵌套仓库）
	 * @param repos 所有仓库列表
	 * @returns 独立仓库列表
	 */
	static filterStandaloneRepos(repos: RepoInfo[]): RepoInfo[] {
		return repos.filter((repo) => !repo.isNested)
	}

	/**
	 * 根据仓库名称过滤仓库
	 * @param repos 仓库列表
	 * @param repoNames 仓库名称列表
	 * @returns 匹配的仓库列表
	 */
	static filterByRepoNames(repos: RepoInfo[], repoNames: string[]): RepoInfo[] {
		const nameSet = new Set(repoNames)
		return repos.filter((repo) => nameSet.has(repo.name))
	}

	/**
	 * 判断仓库是否为嵌套仓库
	 * @param repoPath 仓库路径
	 * @param allRepos 所有仓库列表
	 * @returns 是否为嵌套仓库
	 */
	private static isNestedRepo(repoPath: string, allRepos: RepoInfo[]): boolean {
		const normalizedRepoPath = path.normalize(repoPath)

		for (const otherRepo of allRepos) {
			if (otherRepo.path === repoPath) {
				continue
			}

			const normalizedOtherPath = path.normalize(otherRepo.path)

			// 检查 repoPath 是否在 otherRepo 的子目录中
			const relative = path.relative(normalizedOtherPath, normalizedRepoPath)

			// 如果相对路径不以 '..' 开头且不是绝对路径，说明 repoPath 是 otherRepo 的子目录
			if (!relative.startsWith("..") && !path.isAbsolute(relative)) {
				return true
			}
		}

		return false
	}

	/**
	 * 获取仓库的父仓库
	 * @param repoPath 仓库路径
	 * @param allRepos 所有仓库列表
	 * @returns 父仓库名称，如果没有则返回 undefined
	 */
	private static getParentRepo(repoPath: string, allRepos: RepoInfo[]): string | undefined {
		const normalizedRepoPath = path.normalize(repoPath)
		let parentRepo: RepoInfo | undefined
		let maxDepth = -1

		for (const otherRepo of allRepos) {
			if (otherRepo.path === repoPath) {
				continue
			}

			const normalizedOtherPath = path.normalize(otherRepo.path)

			// 检查 otherRepo 是否是 repoPath 的父目录
			const relative = path.relative(normalizedOtherPath, normalizedRepoPath)

			// 如果相对路径不以 '..' 开头且不是绝对路径，说明 otherRepo 是 repoPath 的父目录
			if (!relative.startsWith("..") && !path.isAbsolute(relative)) {
				// 计算路径深度（用路径分隔符的数量）
				const depth = relative.split(path.sep).length

				// 找到最直接的父仓库（深度最小的）
				if (parentRepo === undefined || depth < maxDepth) {
					parentRepo = otherRepo
					maxDepth = depth
				}
			}
		}

		return parentRepo?.name
	}
}
