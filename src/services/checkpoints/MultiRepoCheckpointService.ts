import { EventEmitter } from "events"
import { RepoPerTaskCheckpointService } from "./RepoPerTaskCheckpointService"
import { RepoScanner } from "./RepoScanner"
import { CheckpointConfigParser } from "./CheckpointConfigParser"
import type { CheckpointDiff } from "./types"
import type { MultiCheckpointResult, MultiDiffResult, RepoInfo, ParsedCheckpointConfig } from "./types/config"

/**
 * 单个仓库的 checkpoint 服务包装器
 */
export interface RepoCheckpointService {
	repoName: string
	repoPath: string
	service: RepoPerTaskCheckpointService
	isInitialized: boolean
	error?: string
}

/**
 * 多仓库 checkpoint 服务
 * 统一管理多个独立仓库的 checkpoint 功能
 */
export class MultiRepoCheckpointService extends EventEmitter {
	private readonly taskId: string
	private readonly workspaceDir: string
	private readonly globalStorageDir: string
	private readonly log: (message: string) => void

	private repos: Map<string, RepoCheckpointService> = new Map()
	private config?: ParsedCheckpointConfig
	private _isInitialized = false

	constructor(taskId: string, workspaceDir: string, globalStorageDir: string, log: (message: string) => void) {
		super()
		this.taskId = taskId
		this.workspaceDir = workspaceDir
		this.globalStorageDir = globalStorageDir
		this.log = log
	}

	public get isInitialized() {
		return this._isInitialized
	}

	/**
	 * 初始化所有仓库的 checkpoint 服务
	 */
	public async initialize(): Promise<void> {
		this.log(`[${this.constructor.name}#initialize] 开始初始化多仓库 checkpoint`)

		// 1. 扫描所有仓库
		const allRepos = await RepoScanner.scanRepos(this.workspaceDir)
		this.log(`[${this.constructor.name}#initialize] 发现 ${allRepos.length} 个仓库`)

		// 2. 加载配置文件
		const config = await CheckpointConfigParser.loadConfig(this.workspaceDir)
		if (config) {
			this.config = CheckpointConfigParser.parseConfig(config)
			this.log(`[${this.constructor.name}#initialize] 已加载配置文件`)
		} else {
			this.log(`[${this.constructor.name}#initialize] 未找到配置文件，使用默认配置`)
		}

		// 3. 过滤启用的仓库
		const enabledRepos = this.filterEnabledRepos(allRepos)
		this.log(`[${this.constructor.name}#initialize] 将为 ${enabledRepos.length} 个仓库启用 checkpoint`)

		// 4. 为每个仓库创建 checkpoint 服务
		for (const repo of enabledRepos) {
			try {
				const service = RepoPerTaskCheckpointService.create({
					taskId: `${this.taskId}-${repo.name}`,
					workspaceDir: repo.path,
					shadowDir: this.getShadowDirForRepo(repo.name),
					log: (msg) => this.log(`[${repo.name}] ${msg}`),
				})

				// 监听服务事件
				this.setupServiceListeners(service as unknown as RepoPerTaskCheckpointService, repo.name)

				this.repos.set(repo.name, {
					repoName: repo.name,
					repoPath: repo.path,
					service: service as unknown as RepoPerTaskCheckpointService,
					isInitialized: false,
				})

				// 初始化服务
				await service.initShadowGit()

				this.repos.get(repo.name)!.isInitialized = true
				this.log(`[${this.constructor.name}#initialize] 仓库 ${repo.name} 初始化成功`)
			} catch (error) {
				const errorMsg = error instanceof Error ? error.message : String(error)
				this.log(`[${this.constructor.name}#initialize] 仓库 ${repo.name} 初始化失败: ${errorMsg}`)

				if (this.repos.has(repo.name)) {
					this.repos.get(repo.name)!.error = errorMsg
				}
			}
		}

		this._isInitialized = true
		this.emit("initialize", {
			type: "initialize",
			workspaceDir: this.workspaceDir,
			repoCount: this.repos.size,
			initializedRepos: Array.from(this.repos.values()).filter((r) => r.isInitialized).length,
		})
	}

	/**
	 * 为所有启用的仓库保存 checkpoint
	 */
	public async saveCheckpoint(
		message: string,
		options?: { allowEmpty?: boolean; suppressMessage?: boolean },
	): Promise<MultiCheckpointResult[]> {
		const results: MultiCheckpointResult[] = []

		for (const [repoName, repo] of this.repos) {
			if (!repo.isInitialized || repo.error) {
				results.push({
					repoName,
					success: false,
					error: repo.error || "未初始化",
				})
				continue
			}

			try {
				const result = await repo.service.saveCheckpoint(message, options)
				results.push({
					repoName,
					success: true,
					commitHash: result?.commit,
				})
			} catch (error) {
				const errorMsg = error instanceof Error ? error.message : String(error)
				results.push({
					repoName,
					success: false,
					error: errorMsg,
				})
				this.log(`[${this.constructor.name}#saveCheckpoint] 仓库 ${repoName} 保存失败: ${errorMsg}`)
			}
		}

		// 只在所有仓库都成功时发射事件
		const allSuccess = results.every((r) => r.success)
		if (allSuccess && results.length > 0) {
			this.emit("checkpoint", {
				type: "checkpoint",
				fromHash: results[0].commitHash!, // 使用第一个仓库的 hash
				toHash: results[results.length - 1].commitHash!,
				duration: 0,
			})
		}

		return results
	}

	/**
	 * 恢复所有仓库到指定 checkpoint
	 */
	public async restoreCheckpoint(commitHash: string): Promise<MultiCheckpointResult[]> {
		const results: MultiCheckpointResult[] = []

		for (const [repoName, repo] of this.repos) {
			if (!repo.isInitialized || repo.error) {
				results.push({
					repoName,
					success: false,
					error: repo.error || "未初始化",
				})
				continue
			}

			try {
				await repo.service.restoreCheckpoint(commitHash)
				results.push({
					repoName,
					success: true,
				})
			} catch (error) {
				const errorMsg = error instanceof Error ? error.message : String(error)
				results.push({
					repoName,
					success: false,
					error: errorMsg,
				})
				this.log(`[${this.constructor.name}#restoreCheckpoint] 仓库 ${repoName} 恢复失败: ${errorMsg}`)
			}
		}

		const allSuccess = results.every((r) => r.success)
		if (allSuccess) {
			this.emit("restore", {
				type: "restore",
				commitHash,
				duration: 0,
			})
		}

		return results
	}

	/**
	 * 获取 diff（可选指定仓库）
	 */
	public async getDiff(options: { from?: string; to?: string; repoName?: string }): Promise<MultiDiffResult[]> {
		const results: MultiDiffResult[] = []

		const targetRepos = options.repoName
			? this.repos.has(options.repoName)
				? [this.repos.get(options.repoName)!]
				: []
			: Array.from(this.repos.values())

		for (const repo of targetRepos) {
			if (!repo.isInitialized || repo.error) {
				results.push({
					repoName: repo.repoName,
					error: repo.error || "未初始化",
				})
				continue
			}

			try {
				const changes = await repo.service.getDiff({ from: options.from, to: options.to })
				results.push({
					repoName: repo.repoName,
					changes,
				})
			} catch (error) {
				const errorMsg = error instanceof Error ? error.message : String(error)
				results.push({
					repoName: repo.repoName,
					error: errorMsg,
				})
			}
		}

		return results
	}

	/**
	 * 获取所有仓库的 checkpoint 列表
	 */
	public async getCheckpoints(): Promise<Map<string, string[]>> {
		const checkpoints = new Map<string, string[]>()

		for (const [repoName, repo] of this.repos) {
			if (!repo.isInitialized || repo.error) {
				checkpoints.set(repoName, [])
				continue
			}

			try {
				// 使用 getCheckpoints() 方法获取 checkpoint 列表
				const hashes = repo.service.getCheckpoints()
				checkpoints.set(repoName, hashes)
			} catch (error) {
				this.log(`[${this.constructor.name}#getCheckpoints] 仓库 ${repoName} 获取历史失败: ${error}`)
				checkpoints.set(repoName, [])
			}
		}

		return checkpoints
	}

	/**
	 * 获取启用的仓库列表
	 */
	public getEnabledRepos(): string[] {
		return Array.from(this.repos.keys())
	}

	/**
	 * 获取所有仓库的状态
	 */
	public getReposStatus(): RepoCheckpointService[] {
		return Array.from(this.repos.values())
	}

	/**
	 * 过滤启用的仓库
	 */
	private filterEnabledRepos(repos: RepoInfo[]): RepoInfo[] {
		// 过滤独立仓库
		const standaloneRepos = RepoScanner.filterStandaloneRepos(repos)

		// 如果没有配置，默认为所有独立仓库启用
		if (!this.config) {
			return standaloneRepos
		}

		// 根据配置过滤
		return standaloneRepos.filter((repo) => CheckpointConfigParser.shouldEnableRepo(repo.name, this.config!))
	}

	/**
	 * 获取仓库的 shadow 目录路径
	 */
	private getShadowDirForRepo(repoName: string): string {
		// 使用全局存储目录，为每个仓库创建独立的 shadow 目录
		return `${this.globalStorageDir}/tasks/${this.taskId}/repos/${repoName}/checkpoints`
	}

	/**
	 * 设置服务事件监听器
	 */
	private setupServiceListeners(service: RepoPerTaskCheckpointService, repoName: string) {
		// 使用 any 类型避免事件监听器的类型检查问题
		service.on("checkpoint", (data: any) => {
			this.log(`[${repoName}] checkpoint saved: ${data.toHash}`)
		})

		service.on("restore", (data: any) => {
			this.log(`[${repoName}] checkpoint restored: ${data.commitHash}`)
		})

		service.on("error", (data: any) => {
			this.emit("error", { type: "error", repoName, error: data.error })
		})
	}
}
