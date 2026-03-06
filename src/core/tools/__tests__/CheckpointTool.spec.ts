/**
 * Tests for CheckpointTool - Project state snapshot management
 *
 * These tests cover:
 * - Checkpoint service unavailable handling
 * - Parameter validation for each action
 * - Approval flow
 * - All checkpoint actions: commit, list, show_diff, restore, revert
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

import { checkpointTool, CheckpointParams } from "../CheckpointTool"
import { ToolCallbacks } from "../BaseTool"

describe("CheckpointTool", () => {
	describe("tool properties", () => {
		it("should have correct name", () => {
			expect(checkpointTool.name).toBe("costrict_checkpoint")
		})
	})

	describe("checkpoint service unavailable", () => {
		it("should return error message when checkpoint service is not available", async () => {
			const params: CheckpointParams = { action: "list" }
			const task = {
				enableCheckpoints: false,
				checkpointService: undefined,
			} as any

			const pushToolResult = vi.fn()
			const callbacks: ToolCallbacks = {
				askApproval: vi.fn().mockResolvedValue(true),
				handleError: vi.fn(),
				pushToolResult,
			}

			await checkpointTool.execute(params, task, callbacks)

			expect(pushToolResult).toHaveBeenCalledWith(expect.stringContaining("Checkpoint feature is unavailable"))
		})
	})

	describe("commit action", () => {
		it("should require message parameter", async () => {
			const params: CheckpointParams = { action: "commit" }
			const task = {
				enableCheckpoints: true,
				checkpointService: {},
				consecutiveMistakeCount: 0,
				recordToolError: vi.fn(),
				didToolFailInCurrentTurn: false,
			} as any

			const pushToolResult = vi.fn()
			const callbacks: ToolCallbacks = {
				askApproval: vi.fn().mockResolvedValue(true),
				handleError: vi.fn(),
				pushToolResult,
			}

			await checkpointTool.execute(params, task, callbacks)

			expect(pushToolResult).toHaveBeenCalledWith(expect.stringContaining("'message' parameter is required"))
			expect(task.consecutiveMistakeCount).toBe(1)
		})

		it("should create checkpoint successfully", async () => {
			const params: CheckpointParams = { action: "commit", message: "Test checkpoint" }
			const mockCheckpointService = {
				saveCheckpoint: vi.fn().mockResolvedValue({ commit: "abc123" }),
			}
			const task = {
				enableCheckpoints: true,
				checkpointService: mockCheckpointService,
				consecutiveMistakeCount: 0,
			} as any

			const pushToolResult = vi.fn()
			const callbacks: ToolCallbacks = {
				askApproval: vi.fn().mockResolvedValue(true),
				handleError: vi.fn(),
				pushToolResult,
			}

			await checkpointTool.execute(params, task, callbacks)

			expect(mockCheckpointService.saveCheckpoint).toHaveBeenCalledWith("Test checkpoint")
			expect(pushToolResult).toHaveBeenCalledWith(expect.stringContaining("abc123"))
		})

		it("should handle no changes to commit", async () => {
			const params: CheckpointParams = { action: "commit", message: "Test checkpoint" }
			const mockCheckpointService = {
				saveCheckpoint: vi.fn().mockResolvedValue(null),
			}
			const task = {
				enableCheckpoints: true,
				checkpointService: mockCheckpointService,
				consecutiveMistakeCount: 0,
			} as any

			const pushToolResult = vi.fn()
			const callbacks: ToolCallbacks = {
				askApproval: vi.fn().mockResolvedValue(true),
				handleError: vi.fn(),
				pushToolResult,
			}

			await checkpointTool.execute(params, task, callbacks)

			expect(pushToolResult).toHaveBeenCalledWith(expect.stringContaining("No changes to commit"))
		})
	})

	describe("list action", () => {
		it("should list checkpoints successfully", async () => {
			const params: CheckpointParams = { action: "list" }
			const mockCheckpointService = {
				getCheckpoints: vi.fn().mockReturnValue(["hash1", "hash2", "hash3"]),
			}
			const task = {
				enableCheckpoints: true,
				checkpointService: mockCheckpointService,
				consecutiveMistakeCount: 0,
			} as any

			const pushToolResult = vi.fn()
			const callbacks: ToolCallbacks = {
				askApproval: vi.fn().mockResolvedValue(true),
				handleError: vi.fn(),
				pushToolResult,
			}

			await checkpointTool.execute(params, task, callbacks)

			expect(pushToolResult).toHaveBeenCalledWith(expect.stringContaining("1. hash1"))
			expect(pushToolResult).toHaveBeenCalledWith(expect.stringContaining("2. hash2"))
			expect(pushToolResult).toHaveBeenCalledWith(expect.stringContaining("3. hash3"))
		})

		it("should handle empty checkpoints list", async () => {
			const params: CheckpointParams = { action: "list" }
			const mockCheckpointService = {
				getCheckpoints: vi.fn().mockReturnValue([]),
			}
			const task = {
				enableCheckpoints: true,
				checkpointService: mockCheckpointService,
				consecutiveMistakeCount: 0,
			} as any

			const pushToolResult = vi.fn()
			const callbacks: ToolCallbacks = {
				askApproval: vi.fn().mockResolvedValue(true),
				handleError: vi.fn(),
				pushToolResult,
			}

			await checkpointTool.execute(params, task, callbacks)

			expect(pushToolResult).toHaveBeenCalledWith(expect.stringContaining("No checkpoints found"))
		})
	})

	describe("show_diff action", () => {
		it("should require commit_hash parameter", async () => {
			const params: CheckpointParams = { action: "show_diff" }
			const task = {
				enableCheckpoints: true,
				checkpointService: {},
				consecutiveMistakeCount: 0,
				recordToolError: vi.fn(),
				didToolFailInCurrentTurn: false,
			} as any

			const pushToolResult = vi.fn()
			const callbacks: ToolCallbacks = {
				askApproval: vi.fn().mockResolvedValue(true),
				handleError: vi.fn(),
				pushToolResult,
			}

			await checkpointTool.execute(params, task, callbacks)

			expect(pushToolResult).toHaveBeenCalledWith(expect.stringContaining("'commit_hash' parameter is required"))
		})

		it("should show diff successfully", async () => {
			const params: CheckpointParams = { action: "show_diff", commit_hash: "abc123" }
			const mockCheckpointService = {
				getDiff: vi.fn().mockResolvedValue([
					{
						paths: { relative: "test.ts" },
						content: { before: "old content", after: "new content" },
					},
				]),
			}
			const task = {
				enableCheckpoints: true,
				checkpointService: mockCheckpointService,
				consecutiveMistakeCount: 0,
			} as any

			const pushToolResult = vi.fn()
			const callbacks: ToolCallbacks = {
				askApproval: vi.fn().mockResolvedValue(true),
				handleError: vi.fn(),
				pushToolResult,
			}

			await checkpointTool.execute(params, task, callbacks)

			expect(mockCheckpointService.getDiff).toHaveBeenCalledWith({ from: "abc123", to: undefined })
			expect(pushToolResult).toHaveBeenCalledWith(expect.stringContaining("test.ts"))
		})

		it("should handle no differences", async () => {
			const params: CheckpointParams = { action: "show_diff", commit_hash: "abc123" }
			const mockCheckpointService = {
				getDiff: vi.fn().mockResolvedValue([]),
			}
			const task = {
				enableCheckpoints: true,
				checkpointService: mockCheckpointService,
				consecutiveMistakeCount: 0,
			} as any

			const pushToolResult = vi.fn()
			const callbacks: ToolCallbacks = {
				askApproval: vi.fn().mockResolvedValue(true),
				handleError: vi.fn(),
				pushToolResult,
			}

			await checkpointTool.execute(params, task, callbacks)

			expect(pushToolResult).toHaveBeenCalledWith(expect.stringContaining("No differences found"))
		})
	})

	describe("restore action", () => {
		it("should require commit_hash parameter", async () => {
			const params: CheckpointParams = { action: "restore" }
			const task = {
				enableCheckpoints: true,
				checkpointService: {},
				consecutiveMistakeCount: 0,
				recordToolError: vi.fn(),
				didToolFailInCurrentTurn: false,
			} as any

			const pushToolResult = vi.fn()
			const callbacks: ToolCallbacks = {
				askApproval: vi.fn().mockResolvedValue(true),
				handleError: vi.fn(),
				pushToolResult,
			}

			await checkpointTool.execute(params, task, callbacks)

			expect(pushToolResult).toHaveBeenCalledWith(expect.stringContaining("'commit_hash' parameter is required"))
		})

		it("should restore checkpoint successfully", async () => {
			const params: CheckpointParams = { action: "restore", commit_hash: "abc123" }
			const mockCheckpointService = {
				restoreCheckpoint: vi.fn().mockResolvedValue(undefined),
			}
			const task = {
				enableCheckpoints: true,
				checkpointService: mockCheckpointService,
				consecutiveMistakeCount: 0,
			} as any

			const pushToolResult = vi.fn()
			const callbacks: ToolCallbacks = {
				askApproval: vi.fn().mockResolvedValue(true),
				handleError: vi.fn(),
				pushToolResult,
			}

			await checkpointTool.execute(params, task, callbacks)

			expect(mockCheckpointService.restoreCheckpoint).toHaveBeenCalledWith("abc123")
			expect(pushToolResult).toHaveBeenCalledWith(expect.stringContaining("Successfully restored"))
		})
	})

	describe("revert action", () => {
		it("should require commit_hash parameter", async () => {
			const params: CheckpointParams = { action: "revert" }
			const task = {
				enableCheckpoints: true,
				checkpointService: {},
				consecutiveMistakeCount: 0,
				recordToolError: vi.fn(),
				didToolFailInCurrentTurn: false,
			} as any

			const pushToolResult = vi.fn()
			const callbacks: ToolCallbacks = {
				askApproval: vi.fn().mockResolvedValue(true),
				handleError: vi.fn(),
				pushToolResult,
			}

			await checkpointTool.execute(params, task, callbacks)

			expect(pushToolResult).toHaveBeenCalledWith(expect.stringContaining("'commit_hash' parameter is required"))
		})

		it("should revert checkpoint successfully", async () => {
			const params: CheckpointParams = { action: "revert", commit_hash: "abc123" }
			const mockCheckpointService = {
				revertCheckpoint: vi.fn().mockResolvedValue("revert456"),
			}
			const task = {
				enableCheckpoints: true,
				checkpointService: mockCheckpointService,
				consecutiveMistakeCount: 0,
			} as any

			const pushToolResult = vi.fn()
			const callbacks: ToolCallbacks = {
				askApproval: vi.fn().mockResolvedValue(true),
				handleError: vi.fn(),
				pushToolResult,
			}

			await checkpointTool.execute(params, task, callbacks)

			expect(mockCheckpointService.revertCheckpoint).toHaveBeenCalledWith("abc123")
			expect(pushToolResult).toHaveBeenCalledWith(expect.stringContaining("revert456"))
		})
	})

	describe("approval flow", () => {
		it("should not execute action when approval is denied", async () => {
			const params: CheckpointParams = { action: "list" }
			const mockCheckpointService = {
				getCheckpoints: vi.fn().mockReturnValue(["hash1"]),
			}
			const task = {
				enableCheckpoints: true,
				checkpointService: mockCheckpointService,
				consecutiveMistakeCount: 0,
			} as any

			const pushToolResult = vi.fn()
			const callbacks: ToolCallbacks = {
				askApproval: vi.fn().mockResolvedValue(false),
				handleError: vi.fn(),
				pushToolResult,
			}

			await checkpointTool.execute(params, task, callbacks)

			expect(mockCheckpointService.getCheckpoints).not.toHaveBeenCalled()
			expect(pushToolResult).not.toHaveBeenCalled()
		})
	})

	describe("error handling", () => {
		it("should handle errors during execution", async () => {
			const params: CheckpointParams = { action: "list" }
			const mockCheckpointService = {
				getCheckpoints: vi.fn().mockImplementation(() => {
					throw new Error("Test error")
				}),
			}
			const task = {
				enableCheckpoints: true,
				checkpointService: mockCheckpointService,
				consecutiveMistakeCount: 0,
			} as any

			const handleError = vi.fn()
			const callbacks: ToolCallbacks = {
				askApproval: vi.fn().mockResolvedValue(true),
				handleError,
				pushToolResult: vi.fn(),
			}

			await checkpointTool.execute(params, task, callbacks)

			expect(handleError).toHaveBeenCalledWith(
				expect.stringContaining("checkpoint list operation"),
				expect.any(Error),
			)
		})
	})
})
