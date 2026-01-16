import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { RepoScanner } from "../RepoScanner"
import { executeRipgrep } from "../../../services/search/file-search"

vi.mock("../../../services/search/file-search")

describe("RepoScanner", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	describe("scanRepos", () => {
		it("应该正确扫描单个仓库", async () => {
			const workspaceDir = "/workspace"
			vi.mocked(executeRipgrep).mockResolvedValue([
				{
					path: ".git/HEAD",
					type: "file",
				},
			])

			const repos = await RepoScanner.scanRepos(workspaceDir)

			expect(repos).toHaveLength(1)
			expect(repos[0]).toEqual({
				name: ".",
				path: "/workspace",
				isNested: false,
				parentRepo: undefined,
			})
		})

		it("应该正确扫描多个独立仓库", async () => {
			const workspaceDir = "/workspace"
			vi.mocked(executeRipgrep).mockResolvedValue([
				{
					path: "repo1/.git/HEAD",
					type: "file",
				},
				{
					path: "repo2/.git/HEAD",
					type: "file",
				},
				{
					path: "repo3/.git/HEAD",
					type: "file",
				},
			])

			const repos = await RepoScanner.scanRepos(workspaceDir)

			expect(repos).toHaveLength(3)
			expect(repos[0]).toEqual({
				name: "repo1",
				path: "/workspace/repo1",
				isNested: false,
				parentRepo: undefined,
			})
			expect(repos[1]).toEqual({
				name: "repo2",
				path: "/workspace/repo2",
				isNested: false,
				parentRepo: undefined,
			})
			expect(repos[2]).toEqual({
				name: "repo3",
				path: "/workspace/repo3",
				isNested: false,
				parentRepo: undefined,
			})
		})

		it("应该正确识别嵌套仓库（单仓库场景）", async () => {
			const workspaceDir = "/workspace"
			vi.mocked(executeRipgrep).mockResolvedValue([
				{
					path: ".git/HEAD",
					type: "file",
				},
				{
					path: "sub-repo/.git/HEAD",
					type: "file",
				},
			])

			const repos = await RepoScanner.scanRepos(workspaceDir)

			expect(repos).toHaveLength(2)
			expect(repos[0]).toEqual({
				name: ".",
				path: "/workspace",
				isNested: false,
				parentRepo: undefined,
			})
			expect(repos[1]).toEqual({
				name: "sub-repo",
				path: "/workspace/sub-repo",
				isNested: true,
				parentRepo: ".",
			})
		})

		it("应该正确处理混合场景", async () => {
			const workspaceDir = "/workspace"
			vi.mocked(executeRipgrep).mockResolvedValue([
				{
					path: "repo1/.git/HEAD",
					type: "file",
				},
				{
					path: "repo2/.git/HEAD",
					type: "file",
				},
				{
					path: "repo3/.git/HEAD",
					type: "file",
				},
				{
					path: "repo3/sub/.git/HEAD",
					type: "file",
				},
			])

			const repos = await RepoScanner.scanRepos(workspaceDir)

			expect(repos).toHaveLength(4)
			expect(repos[0]).toEqual({
				name: "repo1",
				path: "/workspace/repo1",
				isNested: false,
				parentRepo: undefined,
			})
			expect(repos[1]).toEqual({
				name: "repo2",
				path: "/workspace/repo2",
				isNested: false,
				parentRepo: undefined,
			})
			expect(repos[2]).toEqual({
				name: "repo3",
				path: "/workspace/repo3",
				isNested: false,
				parentRepo: undefined,
			})
			expect(repos[3]).toEqual({
				name: "repo3/sub",
				path: "/workspace/repo3/sub",
				isNested: true,
				parentRepo: "repo3",
			})
		})

		it("应该处理深层嵌套仓库", async () => {
			const workspaceDir = "/workspace"
			vi.mocked(executeRipgrep).mockResolvedValue([
				{
					path: "parent/.git/HEAD",
					type: "file",
				},
				{
					path: "parent/child/.git/HEAD",
					type: "file",
				},
				{
					path: "parent/child/grandchild/.git/HEAD",
					type: "file",
				},
			])

			const repos = await RepoScanner.scanRepos(workspaceDir)

			expect(repos).toHaveLength(3)
			expect(repos[0].isNested).toBe(false)
			expect(repos[1].isNested).toBe(true)
			expect(repos[1].parentRepo).toBe("parent")
			expect(repos[2].isNested).toBe(true)
			expect(repos[2].parentRepo).toBe("parent/child")
		})

		it("应该在搜索失败时返回空数组", async () => {
			const workspaceDir = "/workspace"
			vi.mocked(executeRipgrep).mockRejectedValue(new Error("Search failed"))

			const repos = await RepoScanner.scanRepos(workspaceDir)

			expect(repos).toEqual([])
		})

		it("应该避免重复处理相同的仓库", async () => {
			const workspaceDir = "/workspace"
			vi.mocked(executeRipgrep).mockResolvedValue([
				{
					path: "repo1/.git/HEAD",
					type: "file",
				},
				{
					path: "repo1/.git/config",
					type: "file",
				},
			])

			const repos = await RepoScanner.scanRepos(workspaceDir)

			expect(repos).toHaveLength(1)
			expect(repos[0].name).toBe("repo1")
		})

		it("应该正确处理 Windows 路径", async () => {
			const workspaceDir = "C:\\workspace"
			vi.mocked(executeRipgrep).mockResolvedValue([
				{
					path: "repo1\\subrepo/.git/HEAD",
					type: "file",
				},
			])

			const repos = await RepoScanner.scanRepos(workspaceDir)

			expect(repos).toHaveLength(1)
			expect(repos[0].name).toBe("repo1/subrepo")
			expect(repos[0].path).toContain("workspace")
		})
	})

	describe("filterStandaloneRepos", () => {
		it("应该正确过滤独立仓库", () => {
			const repos = [
				{ name: "repo1", path: "/workspace/repo1", isNested: false, parentRepo: undefined },
				{ name: "repo2", path: "/workspace/repo2", isNested: true, parentRepo: "repo1" },
				{ name: "repo3", path: "/workspace/repo3", isNested: false, parentRepo: undefined },
			]

			const standaloneRepos = RepoScanner.filterStandaloneRepos(repos)

			expect(standaloneRepos).toHaveLength(2)
			expect(standaloneRepos.map((r) => r.name)).toEqual(["repo1", "repo3"])
		})

		it("应该处理空数组", () => {
			const repos: any[] = []
			const standaloneRepos = RepoScanner.filterStandaloneRepos(repos)

			expect(standaloneRepos).toEqual([])
		})
	})

	describe("filterByRepoNames", () => {
		it("应该根据仓库名称正确过滤", () => {
			const repos = [
				{ name: "repo1", path: "/workspace/repo1", isNested: false, parentRepo: undefined },
				{ name: "repo2", path: "/workspace/repo2", isNested: false, parentRepo: undefined },
				{ name: "repo3", path: "/workspace/repo3", isNested: false, parentRepo: undefined },
			]

			const filtered = RepoScanner.filterByRepoNames(repos, ["repo1", "repo3"])

			expect(filtered).toHaveLength(2)
			expect(filtered.map((r) => r.name)).toEqual(["repo1", "repo3"])
		})

		it("应该处理不存在的仓库名称", () => {
			const repos = [{ name: "repo1", path: "/workspace/repo1", isNested: false, parentRepo: undefined }]

			const filtered = RepoScanner.filterByRepoNames(repos, ["repo2"])

			expect(filtered).toEqual([])
		})

		it("应该处理空仓库名称列表", () => {
			const repos = [{ name: "repo1", path: "/workspace/repo1", isNested: false, parentRepo: undefined }]

			const filtered = RepoScanner.filterByRepoNames(repos, [])

			expect(filtered).toEqual([])
		})

		it('应该处理根目录仓库（"."）', () => {
			const repos = [
				{ name: ".", path: "/workspace", isNested: false, parentRepo: undefined },
				{ name: "repo1", path: "/workspace/repo1", isNested: false, parentRepo: undefined },
			]

			const filtered = RepoScanner.filterByRepoNames(repos, ["."])

			expect(filtered).toHaveLength(1)
			expect(filtered[0].name).toBe(".")
		})
	})
})
