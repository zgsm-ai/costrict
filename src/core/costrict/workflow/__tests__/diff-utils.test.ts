import { describe, it, expect, vi, beforeEach } from "vitest"
import type { ClineMessage } from "@roo-code/types"
import type { Task } from "../../../task/Task"
import type { RepoPerTaskCheckpointService } from "../../../../services/checkpoints/RepoPerTaskCheckpointService"
import {
	getLatestCheckpoint,
	findFileInCheckpoint,
	getCospecFileDiff,
	checkFileInLatestCheckpoint,
	getMultipleCospecFilesDiff,
} from "../diff-utils"

// Mock fs/promises
vi.mock("fs/promises", () => ({
	default: {
		readFile: vi.fn(),
	},
}))

// Mock diff library
vi.mock("diff", () => ({
	createPatch: vi.fn(),
}))

describe("diff-utils", () => {
	let mockTask: Partial<Task>
	let mockCheckpointService: Partial<RepoPerTaskCheckpointService>
	let mockGit: any

	beforeEach(() => {
		// 重置所有 mock
		vi.clearAllMocks()

		// 创建 mock Git 实例
		mockGit = {
			show: vi.fn(),
		}

		// 创建 mock CheckpointService
		mockCheckpointService = {
			isInitialized: true,
			git: mockGit,
		} as any

		// 创建 mock Task
		mockTask = {
			clineMessages: [],
			checkpointService: mockCheckpointService as RepoPerTaskCheckpointService,
		}
	})

	describe("getLatestCheckpoint", () => {
		it("应该返回最新的 checkpoint hash", () => {
			const mockMessages: ClineMessage[] = [
				{
					type: "say",
					say: "checkpoint_saved",
					text: "abc123",
					ts: 1000,
				},
				{
					type: "say",
					say: "checkpoint_saved",
					text: "def456",
					ts: 2000,
				},
				{
					type: "say",
					say: "text",
					text: "some user message",
					ts: 1500,
				},
			]

			mockTask.clineMessages = mockMessages

			const result = getLatestCheckpoint(mockTask as Task)
			expect(result).toBe("def456") // 应该返回时间戳最新的
		})

		it("当没有 checkpoint 消息时应该返回 null", () => {
			const mockMessages: ClineMessage[] = [
				{
					type: "say",
					say: "text",
					text: "some user message",
					ts: 1000,
				},
			]

			mockTask.clineMessages = mockMessages

			const result = getLatestCheckpoint(mockTask as Task)
			expect(result).toBeNull()
		})

		it("当 clineMessages 为空时应该返回 null", () => {
			mockTask.clineMessages = []

			const result = getLatestCheckpoint(mockTask as Task)
			expect(result).toBeNull()
		})

		it("应该忽略没有 text 的 checkpoint 消息", () => {
			const mockMessages: ClineMessage[] = [
				{
					type: "say",
					say: "checkpoint_saved",
					text: "",
					ts: 1000,
				},
				{
					type: "say",
					say: "checkpoint_saved",
					text: "valid123",
					ts: 2000,
				},
			]

			mockTask.clineMessages = mockMessages

			const result = getLatestCheckpoint(mockTask as Task)
			expect(result).toBe("valid123")
		})
	})

	describe("findFileInCheckpoint", () => {
		it("应该成功获取文件内容", async () => {
			const expectedContent = "# Requirements\n\nSome content"
			mockGit.show.mockResolvedValue(expectedContent)

			const result = await findFileInCheckpoint(
				mockCheckpointService as RepoPerTaskCheckpointService,
				"abc123",
				".cospec/requirements.md",
			)

			expect(result).toBe(expectedContent)
			expect(mockGit.show).toHaveBeenCalledWith(["abc123:.cospec/requirements.md"])
		})

		it("当文件不存在时应该返回 null", async () => {
			mockGit.show.mockRejectedValue(new Error("File not found"))

			const result = await findFileInCheckpoint(
				mockCheckpointService as RepoPerTaskCheckpointService,
				"abc123",
				".cospec/nonexistent.md",
			)

			expect(result).toBeNull()
		})

		it("当 checkpoint service 未初始化时应该返回 null", async () => {
			const uninitializedService = {
				...mockCheckpointService,
				isInitialized: false,
			}

			const result = await findFileInCheckpoint(
				uninitializedService as RepoPerTaskCheckpointService,
				"abc123",
				".cospec/requirements.md",
			)

			expect(result).toBeNull()
		})

		it("当 git 实例不可用时应该返回 null", async () => {
			;(mockCheckpointService as any).git = null

			const result = await findFileInCheckpoint(
				mockCheckpointService as RepoPerTaskCheckpointService,
				"abc123",
				".cospec/requirements.md",
			)

			expect(result).toBeNull()
		})
	})

	describe("getCospecFileDiff", () => {
		let mockFs: any
		let mockDiff: any

		beforeEach(async () => {
			// 动态导入 mock 模块
			mockFs = await import("fs/promises")
			mockDiff = await import("diff")

			// 设置 mock task 有 checkpoint
			mockTask.clineMessages = [
				{
					type: "say",
					say: "checkpoint_saved",
					text: "abc123",
					ts: 1000,
				},
			]
		})

		it("应该成功生成文件差异", async () => {
			const checkpointContent = "# Old Requirements"
			const localContent = "# New Requirements"
			const mockDiffContent = "diff content"

			mockGit.show.mockResolvedValue(checkpointContent)
			vi.mocked(mockFs.default.readFile).mockResolvedValue(localContent)
			vi.mocked(mockDiff.createPatch).mockReturnValue(mockDiffContent)

			const result = await getCospecFileDiff(mockTask as Task, "requirements.md", "/workspace")

			expect(result.filePath).toBe("requirements.md")
			expect(result.checkpointContent).toBe(checkpointContent)
			expect(result.localContent).toBe(localContent)
			expect(result.hasDifference).toBe(true)
			expect(result.diffString).toBe(mockDiffContent)
			expect(result.error).toBeUndefined()
		})

		it("当文件内容相同时应该返回无差异", async () => {
			const sameContent = "# Same Content"

			mockGit.show.mockResolvedValue(sameContent)
			vi.mocked(mockFs.default.readFile).mockResolvedValue(sameContent)

			const result = await getCospecFileDiff(mockTask as Task, "requirements.md", "/workspace")

			expect(result.hasDifference).toBe(false)
			expect(result.diffString).toBe("文件内容相同，无差异")
		})

		it("当没有 checkpoint 时应该返回错误", async () => {
			mockTask.clineMessages = [] // 没有 checkpoint

			const result = await getCospecFileDiff(mockTask as Task, "requirements.md", "/workspace")

			expect(result.error).toBe("未找到可用的 checkpoint")
			expect(result.hasDifference).toBe(false)
		})

		it("当 checkpoint service 不可用时应该返回错误", async () => {
			mockTask.checkpointService = undefined

			const result = await getCospecFileDiff(mockTask as Task, "requirements.md", "/workspace")

			expect(result.error).toBe("Checkpoint service 不可用")
		})
	})

	describe("checkFileInLatestCheckpoint", () => {
		it("应该正确检查文件是否存在", async () => {
			const fileContent = "# File Content"
			mockTask.clineMessages = [
				{
					type: "say",
					say: "checkpoint_saved",
					text: "abc123",
					ts: 1000,
				},
			]
			mockGit.show.mockResolvedValue(fileContent)

			const result = await checkFileInLatestCheckpoint(mockTask as Task, "requirements.md")

			expect(result.filePath).toBe("requirements.md")
			expect(result.checkpointHash).toBe("abc123")
			expect(result.exists).toBe(true)
			expect(result.content).toBe(fileContent)
		})

		it("当文件不存在时应该返回 exists: false", async () => {
			mockTask.clineMessages = [
				{
					type: "say",
					say: "checkpoint_saved",
					text: "abc123",
					ts: 1000,
				},
			]
			mockGit.show.mockRejectedValue(new Error("File not found"))

			const result = await checkFileInLatestCheckpoint(mockTask as Task, "nonexistent.md")

			expect(result.exists).toBe(false)
			expect(result.content).toBe("")
		})
	})

	describe("getMultipleCospecFilesDiff", () => {
		let mockFs: any

		beforeEach(async () => {
			mockFs = await import("fs/promises")

			mockTask.clineMessages = [
				{
					type: "say",
					say: "checkpoint_saved",
					text: "abc123",
					ts: 1000,
				},
			]
		})

		it("应该处理多个文件的差异", async () => {
			mockGit.show.mockResolvedValue("checkpoint content")
			vi.mocked(mockFs.default.readFile).mockResolvedValue("local content")

			const result = await getMultipleCospecFilesDiff(
				mockTask as Task,
				["requirements.md", "design.md"],
				"/workspace",
			)

			expect(result).toHaveLength(2)
			expect(result[0].filePath).toBe("requirements.md")
			expect(result[1].filePath).toBe("design.md")
		})

		it("应该处理单个文件失败的情况", async () => {
			mockGit.show.mockImplementation((args: string[]) => {
				if (args[0].includes("requirements.md")) {
					return Promise.resolve("content")
				}
				return Promise.reject(new Error("File error"))
			})
			vi.mocked(mockFs.default.readFile).mockResolvedValue("local content")

			const result = await getMultipleCospecFilesDiff(
				mockTask as Task,
				["requirements.md", "failing.md"],
				"/workspace",
			)

			expect(result).toHaveLength(2)
			expect(result[0].error).toBeUndefined()
			// 第二个文件应该有错误，但我们只检查它不会导致整个函数失败
			expect(result[1].filePath).toBe("failing.md")
		})
	})
})
