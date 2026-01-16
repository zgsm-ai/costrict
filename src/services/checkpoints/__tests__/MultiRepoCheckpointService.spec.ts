// npx vitest run src/services/checkpoints/__tests__/MultiRepoCheckpointService.spec.ts

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { EventEmitter } from "events"
import { MultiRepoCheckpointService } from "../MultiRepoCheckpointService"
import { RepoScanner } from "../RepoScanner"
import { CheckpointConfigParser } from "../CheckpointConfigParser"
import { RepoPerTaskCheckpointService } from "../RepoPerTaskCheckpointService"

vi.mock("../RepoScanner")
vi.mock("../CheckpointConfigParser")
vi.mock("../RepoPerTaskCheckpointService")

describe("MultiRepoCheckpointService", () => {
	const taskId = "test-task"
	const workspaceDir = "/workspace"
	const globalStorageDir = "/storage"
	const mockLog = vi.fn()

	let multiRepoService: MultiRepoCheckpointService

	beforeEach(() => {
		vi.clearAllMocks()
		multiRepoService = new MultiRepoCheckpointService(taskId, workspaceDir, globalStorageDir, mockLog)
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	describe("constructor", () => {
		it("应该正确创建服务实例", () => {
			expect(multiRepoService).toBeInstanceOf(EventEmitter)
			expect(multiRepoService.isInitialized).toBe(false)
		})
	})

	describe("initialize", () => {
		it("应该成功初始化多个仓库", async () => {
			// Mock 扫描结果
			vi.mocked(RepoScanner.scanRepos).mockResolvedValue([
				{ name: "repo1", path: "/workspace/repo1", isNested: false, parentRepo: undefined },
				{ name: "repo2", path: "/workspace/repo2", isNested: false, parentRepo: undefined },
			])

			// Mock 过滤独立仓库
			vi.mocked(RepoScanner.filterStandaloneRepos).mockImplementation((repos: any) =>
				repos.filter((r: any) => !r.isNested),
			)

			// Mock 配置文件加载
			vi.mocked(CheckpointConfigParser.loadConfig).mockResolvedValue(null)

			// Mock RepoPerTaskCheckpointService 创建
			const mockService = {
				initShadowGit: vi.fn().mockResolvedValue({ created: true, duration: 100 }),
				on: vi.fn(),
				saveCheckpoint: vi.fn(),
				restoreCheckpoint: vi.fn(),
				getDiff: vi.fn(),
				getCheckpoints: vi.fn(),
			}

			vi.mocked(RepoPerTaskCheckpointService.create).mockReturnValue(mockService as any)

			await multiRepoService.initialize()

			expect(multiRepoService.isInitialized).toBe(true)
			expect(RepoScanner.scanRepos).toHaveBeenCalledWith(workspaceDir)
			expect(CheckpointConfigParser.loadConfig).toHaveBeenCalledWith(workspaceDir)
			expect(mockService.initShadowGit).toHaveBeenCalledTimes(2)
		})

		it("应该根据配置文件过滤仓库", async () => {
			vi.mocked(RepoScanner.scanRepos).mockResolvedValue([
				{ name: "repo1", path: "/workspace/repo1", isNested: false, parentRepo: undefined },
				{ name: "repo2", path: "/workspace/repo2", isNested: false, parentRepo: undefined },
				{ name: "repo3", path: "/workspace/repo3", isNested: false, parentRepo: undefined },
			])

			vi.mocked(CheckpointConfigParser.loadConfig).mockResolvedValue({
				checkpoints: {
					enabledRepos: ["repo1", "repo3"],
					disabledRepos: [],
					defaultBehavior: "disabled",
				},
			})

			vi.mocked(CheckpointConfigParser.parseConfig).mockReturnValue({
				enabledRepos: new Set(["repo1", "repo3"]),
				disabledRepos: new Set(),
				defaultBehavior: "disabled",
			})

			vi.mocked(CheckpointConfigParser.shouldEnableRepo).mockImplementation((repoName, config) => {
				return config.enabledRepos.has(repoName)
			})

			vi.mocked(RepoScanner.filterStandaloneRepos).mockImplementation((repos) =>
				repos.filter((r: any) => !r.isNested),
			)

			const mockService = {
				initShadowGit: vi.fn().mockResolvedValue({ created: true, duration: 100 }),
				on: vi.fn(),
			}

			vi.mocked(RepoPerTaskCheckpointService.create).mockReturnValue(mockService as any)

			await multiRepoService.initialize()

			// 应该只为 repo1 和 repo3 创建服务
			expect(RepoPerTaskCheckpointService.create).toHaveBeenCalledTimes(2)
		})

		it("应该处理单个仓库初始化失败的情况", async () => {
			vi.mocked(RepoScanner.scanRepos).mockResolvedValue([
				{ name: "repo1", path: "/workspace/repo1", isNested: false, parentRepo: undefined },
				{ name: "repo2", path: "/workspace/repo2", isNested: false, parentRepo: undefined },
			])

			// Mock 过滤独立仓库
			vi.mocked(RepoScanner.filterStandaloneRepos).mockImplementation((repos: any) =>
				repos.filter((r: any) => !r.isNested),
			)

			vi.mocked(CheckpointConfigParser.loadConfig).mockResolvedValue(null)

			const mockService1 = {
				initShadowGit: vi.fn().mockResolvedValue({ created: true, duration: 100 }),
				on: vi.fn(),
			}

			const mockService2 = {
				initShadowGit: vi.fn().mockRejectedValue(new Error("Init failed")),
				on: vi.fn(),
			}

			vi.mocked(RepoPerTaskCheckpointService.create)
				.mockReturnValueOnce(mockService1 as any)
				.mockReturnValueOnce(mockService2 as any)

			await multiRepoService.initialize()

			expect(multiRepoService.isInitialized).toBe(true)
			expect(mockLog).toHaveBeenCalledWith(expect.stringContaining("repo2 初始化失败"))
		})
	})

	describe("saveCheckpoint", () => {
		beforeEach(async () => {
			vi.mocked(RepoScanner.scanRepos).mockResolvedValue([
				{ name: "repo1", path: "/workspace/repo1", isNested: false, parentRepo: undefined },
				{ name: "repo2", path: "/workspace/repo2", isNested: false, parentRepo: undefined },
			])

			// Mock 过滤独立仓库
			vi.mocked(RepoScanner.filterStandaloneRepos).mockImplementation((repos: any) =>
				repos.filter((r: any) => !r.isNested),
			)

			vi.mocked(CheckpointConfigParser.loadConfig).mockResolvedValue(null)

			const mockService = {
				initShadowGit: vi.fn().mockResolvedValue({ created: true, duration: 100 }),
				on: vi.fn(),
				saveCheckpoint: vi.fn().mockResolvedValue({ commit: "abc123" }),
				restoreCheckpoint: vi.fn(),
				getDiff: vi.fn(),
				getCheckpoints: vi.fn(),
			}

			vi.mocked(RepoPerTaskCheckpointService.create).mockReturnValue(mockService as any)

			await multiRepoService.initialize()
		})

		it("应该为所有仓库保存 checkpoint", async () => {
			const results = await multiRepoService.saveCheckpoint("Test checkpoint")

			expect(results).toHaveLength(2)
			expect(results[0].success).toBe(true)
			expect(results[0].commitHash).toBe("abc123")
			expect(results[1].success).toBe(true)
		})

		it("应该返回所有仓库的操作结果", async () => {
			const mockService = {
				saveCheckpoint: vi.fn().mockRejectedValue(new Error("Save failed")),
			}

			// 直接修改内部的 service 来模拟失败
			const repos = multiRepoService.getReposStatus()
			if (repos[0]) {
				;(repos[0].service as any).saveCheckpoint = vi.fn().mockRejectedValue(new Error("Save failed"))
			}

			const results = await multiRepoService.saveCheckpoint("Test checkpoint")

			expect(results).toHaveLength(2)
			expect(results[0].success).toBe(false)
			expect(results[0].error).toContain("Save failed")
		})

		it("应该跳过未初始化的仓库", async () => {
			// 修改第一个仓库为未初始化状态
			const repos = multiRepoService.getReposStatus()
			if (repos[0]) {
				repos[0].isInitialized = false
			}

			const results = await multiRepoService.saveCheckpoint("Test checkpoint")

			expect(results).toHaveLength(2)
			expect(results[0].success).toBe(false)
			expect(results[0].error).toBe("未初始化")
			expect(results[1].success).toBe(true)
		})
	})

	describe("restoreCheckpoint", () => {
		beforeEach(async () => {
			vi.mocked(RepoScanner.scanRepos).mockResolvedValue([
				{ name: "repo1", path: "/workspace/repo1", isNested: false, parentRepo: undefined },
				{ name: "repo2", path: "/workspace/repo2", isNested: false, parentRepo: undefined },
			])

			// Mock 过滤独立仓库
			vi.mocked(RepoScanner.filterStandaloneRepos).mockImplementation((repos: any) =>
				repos.filter((r: any) => !r.isNested),
			)

			vi.mocked(CheckpointConfigParser.loadConfig).mockResolvedValue(null)

			const mockService = {
				initShadowGit: vi.fn().mockResolvedValue({ created: true, duration: 100 }),
				on: vi.fn(),
				saveCheckpoint: vi.fn(),
				restoreCheckpoint: vi.fn().mockResolvedValue(undefined),
				getDiff: vi.fn(),
				getCheckpoints: vi.fn(),
			}

			vi.mocked(RepoPerTaskCheckpointService.create).mockReturnValue(mockService as any)

			await multiRepoService.initialize()
		})

		it("应该为所有仓库恢复 checkpoint", async () => {
			const commitHash = "abc123"
			const results = await multiRepoService.restoreCheckpoint(commitHash)

			expect(results).toHaveLength(2)
			expect(results.every((r) => r.success)).toBe(true)
		})

		it("应该处理恢复失败的情况", async () => {
			const mockService = {
				restoreCheckpoint: vi.fn().mockRejectedValue(new Error("Restore failed")),
			}

			// 修改第一个仓库的 service 使其失败
			const repos = multiRepoService.getReposStatus()
			if (repos[0]) {
				;(repos[0].service as any).restoreCheckpoint.mockRejectedValueOnce(new Error("Restore failed"))
			}

			const results = await multiRepoService.restoreCheckpoint("abc123")

			expect(results).toHaveLength(2)
			expect(results[0].success).toBe(false)
			expect(results[0].error).toContain("Restore failed")
			expect(results[1].success).toBe(true)
		})
	})

	describe("getDiff", () => {
		beforeEach(async () => {
			vi.mocked(RepoScanner.scanRepos).mockResolvedValue([
				{ name: "repo1", path: "/workspace/repo1", isNested: false, parentRepo: undefined },
				{ name: "repo2", path: "/workspace/repo2", isNested: false, parentRepo: undefined },
			])

			// Mock 过滤独立仓库
			vi.mocked(RepoScanner.filterStandaloneRepos).mockImplementation((repos: any) =>
				repos.filter((r: any) => !r.isNested),
			)

			vi.mocked(CheckpointConfigParser.loadConfig).mockResolvedValue(null)

			const mockService = {
				initShadowGit: vi.fn().mockResolvedValue({ created: true, duration: 100 }),
				on: vi.fn(),
				saveCheckpoint: vi.fn(),
				restoreCheckpoint: vi.fn(),
				getDiff: vi.fn().mockResolvedValue([
					{
						paths: { relative: "test.txt", absolute: "/workspace/test.txt" },
						content: { before: "old", after: "new" },
					},
				]),
				getCheckpoints: vi.fn(),
			}

			vi.mocked(RepoPerTaskCheckpointService.create).mockReturnValue(mockService as any)

			await multiRepoService.initialize()
		})

		it("应该为所有仓库获取 diff", async () => {
			const results = await multiRepoService.getDiff({})

			expect(results).toHaveLength(2)
			expect(results[0].changes).toHaveLength(1)
			expect(results[1].changes).toHaveLength(1)
		})

		it("应该支持指定单个仓库获取 diff", async () => {
			const results = await multiRepoService.getDiff({ repoName: "repo1" })

			expect(results).toHaveLength(1)
			expect(results[0].repoName).toBe("repo1")
		})

		it("应该处理不存在的仓库", async () => {
			const results = await multiRepoService.getDiff({ repoName: "non-existent" })

			expect(results).toHaveLength(0)
		})
	})

	describe("getCheckpoints", () => {
		beforeEach(async () => {
			vi.mocked(RepoScanner.scanRepos).mockResolvedValue([
				{ name: "repo1", path: "/workspace/repo1", isNested: false, parentRepo: undefined },
				{ name: "repo2", path: "/workspace/repo2", isNested: false, parentRepo: undefined },
			])

			// Mock 过滤独立仓库
			vi.mocked(RepoScanner.filterStandaloneRepos).mockImplementation((repos: any) =>
				repos.filter((r: any) => !r.isNested),
			)

			vi.mocked(CheckpointConfigParser.loadConfig).mockResolvedValue(null)

			const mockService = {
				initShadowGit: vi.fn().mockResolvedValue({ created: true, duration: 100 }),
				on: vi.fn(),
				saveCheckpoint: vi.fn(),
				restoreCheckpoint: vi.fn(),
				getDiff: vi.fn(),
				getCheckpoints: vi.fn().mockReturnValue(["hash1", "hash2", "hash3"]),
			}

			vi.mocked(RepoPerTaskCheckpointService.create).mockReturnValue(mockService as any)

			await multiRepoService.initialize()
		})

		it("应该获取所有仓库的 checkpoint 列表", async () => {
			const checkpoints = await multiRepoService.getCheckpoints()

			expect(checkpoints).toBeInstanceOf(Map)
			expect(checkpoints.size).toBe(2)
			expect(checkpoints.get("repo1")).toEqual(["hash1", "hash2", "hash3"])
			expect(checkpoints.get("repo2")).toEqual(["hash1", "hash2", "hash3"])
		})

		it("应该处理获取失败的情况", async () => {
			// 修改第一个仓库的 service 使其失败
			const repos = multiRepoService.getReposStatus()
			if (repos[0]) {
				;(repos[0].service as any).getCheckpoints.mockImplementationOnce(() => {
					throw new Error("Get checkpoints failed")
				})
			}

			const checkpoints = await multiRepoService.getCheckpoints()

			expect(checkpoints.get("repo1")).toEqual([])
			expect(checkpoints.get("repo2")).toEqual(["hash1", "hash2", "hash3"])
		})
	})

	describe("getEnabledRepos", () => {
		it("应该返回启用的仓库名称列表", async () => {
			vi.mocked(RepoScanner.scanRepos).mockResolvedValue([
				{ name: "repo1", path: "/workspace/repo1", isNested: false, parentRepo: undefined },
				{ name: "repo2", path: "/workspace/repo2", isNested: false, parentRepo: undefined },
				{ name: "repo3", path: "/workspace/repo3", isNested: false, parentRepo: undefined },
			])

			// Mock 过滤独立仓库
			vi.mocked(RepoScanner.filterStandaloneRepos).mockImplementation((repos: any) =>
				repos.filter((r: any) => !r.isNested),
			)

			vi.mocked(CheckpointConfigParser.loadConfig).mockResolvedValue(null)

			const mockService = {
				initShadowGit: vi.fn().mockResolvedValue({ created: true, duration: 100 }),
				on: vi.fn(),
			}

			vi.mocked(RepoPerTaskCheckpointService.create).mockReturnValue(mockService as any)

			await multiRepoService.initialize()

			const enabledRepos = multiRepoService.getEnabledRepos()

			expect(enabledRepos).toEqual(["repo1", "repo2", "repo3"])
		})
	})

	describe("getReposStatus", () => {
		it("应该返回所有仓库的状态", async () => {
			vi.mocked(RepoScanner.scanRepos).mockResolvedValue([
				{ name: "repo1", path: "/workspace/repo1", isNested: false, parentRepo: undefined },
				{ name: "repo2", path: "/workspace/repo2", isNested: false, parentRepo: undefined },
			])

			// Mock 过滤独立仓库
			vi.mocked(RepoScanner.filterStandaloneRepos).mockImplementation((repos: any) =>
				repos.filter((r: any) => !r.isNested),
			)

			vi.mocked(CheckpointConfigParser.loadConfig).mockResolvedValue(null)

			const mockService = {
				initShadowGit: vi.fn().mockResolvedValue({ created: true, duration: 100 }),
				on: vi.fn(),
			}

			vi.mocked(RepoPerTaskCheckpointService.create).mockReturnValue(mockService as any)

			await multiRepoService.initialize()

			const status = multiRepoService.getReposStatus()

			expect(status).toHaveLength(2)
			expect(status[0].repoName).toBe("repo1")
			expect(status[0].isInitialized).toBe(true)
			expect(status[1].repoName).toBe("repo2")
			expect(status[1].isInitialized).toBe(true)
		})
	})

	describe("事件发射", () => {
		it("应该在初始化完成时发射 initialize 事件", async () => {
			const initializeListener = vi.fn()
			multiRepoService.on("initialize", initializeListener)

			vi.mocked(RepoScanner.scanRepos).mockResolvedValue([
				{ name: "repo1", path: "/workspace/repo1", isNested: false, parentRepo: undefined },
			])

			// Mock 过滤独立仓库
			vi.mocked(RepoScanner.filterStandaloneRepos).mockImplementation((repos: any) =>
				repos.filter((r: any) => !r.isNested),
			)

			vi.mocked(CheckpointConfigParser.loadConfig).mockResolvedValue(null)

			const mockService = {
				initShadowGit: vi.fn().mockResolvedValue({ created: true, duration: 100 }),
				on: vi.fn(),
			}

			vi.mocked(RepoPerTaskCheckpointService.create).mockReturnValue(mockService as any)

			await multiRepoService.initialize()

			expect(initializeListener).toHaveBeenCalledWith(
				expect.objectContaining({
					type: "initialize",
					workspaceDir,
					repoCount: 1,
					initializedRepos: 1,
				}),
			)
		})

		it("应该在所有仓库保存成功时发射 checkpoint 事件", async () => {
			const checkpointListener = vi.fn()
			multiRepoService.on("checkpoint", checkpointListener)

			vi.mocked(RepoScanner.scanRepos).mockResolvedValue([
				{ name: "repo1", path: "/workspace/repo1", isNested: false, parentRepo: undefined },
				{ name: "repo2", path: "/workspace/repo2", isNested: false, parentRepo: undefined },
			])

			// Mock 过滤独立仓库
			vi.mocked(RepoScanner.filterStandaloneRepos).mockImplementation((repos: any) =>
				repos.filter((r: any) => !r.isNested),
			)

			vi.mocked(CheckpointConfigParser.loadConfig).mockResolvedValue(null)

			const mockService = {
				initShadowGit: vi.fn().mockResolvedValue({ created: true, duration: 100 }),
				on: vi.fn(),
				saveCheckpoint: vi.fn().mockResolvedValue({ commit: "abc123" }),
				restoreCheckpoint: vi.fn(),
				getDiff: vi.fn(),
				getCheckpoints: vi.fn(),
			}

			vi.mocked(RepoPerTaskCheckpointService.create).mockReturnValue(mockService as any)

			await multiRepoService.initialize()
			await multiRepoService.saveCheckpoint("Test checkpoint")

			expect(checkpointListener).toHaveBeenCalled()
		})

		it("应该在所有仓库恢复成功时发射 restore 事件", async () => {
			const restoreListener = vi.fn()
			multiRepoService.on("restore", restoreListener)

			vi.mocked(RepoScanner.scanRepos).mockResolvedValue([
				{ name: "repo1", path: "/workspace/repo1", isNested: false, parentRepo: undefined },
			])

			// Mock 过滤独立仓库
			vi.mocked(RepoScanner.filterStandaloneRepos).mockImplementation((repos: any) =>
				repos.filter((r: any) => !r.isNested),
			)

			vi.mocked(CheckpointConfigParser.loadConfig).mockResolvedValue(null)

			const mockService = {
				initShadowGit: vi.fn().mockResolvedValue({ created: true, duration: 100 }),
				on: vi.fn(),
				saveCheckpoint: vi.fn(),
				restoreCheckpoint: vi.fn().mockResolvedValue(undefined),
				getDiff: vi.fn(),
				getCheckpoints: vi.fn(),
			}

			vi.mocked(RepoPerTaskCheckpointService.create).mockReturnValue(mockService as any)

			await multiRepoService.initialize()
			await multiRepoService.restoreCheckpoint("abc123")

			expect(restoreListener).toHaveBeenCalledWith(
				expect.objectContaining({
					type: "restore",
					commitHash: "abc123",
				}),
			)
		})
	})
})
