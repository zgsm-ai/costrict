import * as vscode from "vscode"
import { CommentService } from "../index"
import { CommentThreadInfo } from "../types"

// Mock VS Code API
const mockCommentController = {
	createCommentThread: jest.fn(),
	dispose: jest.fn(),
	commentingRangeProvider: null,
}

const mockCommentThread = {
	dispose: jest.fn(),
	contextValue: "",
	collapsibleState: 0,
	canReply: true,
	label: "",
	uri: vscode.Uri.file("/test/file.ts"),
	range: new vscode.Range(0, 0, 5, 0),
}

// Configure mock to return mockCommentThread
mockCommentController.createCommentThread.mockReturnValue(mockCommentThread)

const mockDocument = { lineCount: 100 }
const mockEditor = {
	revealRange: jest.fn(),
	selection: null,
}

jest.mock("vscode", () => ({
	comments: {
		createCommentController: jest.fn(() => mockCommentController),
	},
	CommentThreadCollapsibleState: {
		Expanded: 1,
		Collapsed: 0,
	},
	Range: jest.fn().mockImplementation((startLine, startChar, endLine, endChar) => ({
		start: { line: startLine, character: startChar },
		end: { line: endLine, character: endChar },
	})),
	Uri: {
		file: jest.fn().mockImplementation((path) => ({ fsPath: path })),
	},
	workspace: {
		openTextDocument: jest.fn(() => Promise.resolve(mockDocument)),
	},
	window: {
		showTextDocument: jest.fn(() => Promise.resolve(mockEditor)),
	},
	TextEditorRevealType: {
		InCenter: 1,
	},
	Selection: jest.fn(),
}))

describe("CommentService - Step 5.1: Basic Architecture", () => {
	let commentService: CommentService

	beforeEach(() => {
		// Reset singleton instance
		;(CommentService as any).instance = null
		commentService = CommentService.getInstance()
	})

	afterEach(() => {
		// Cleanup
		;(CommentService as any).instance = null
	})

	describe("Singleton Pattern Tests", () => {
		it("should return same instance when calling getInstance multiple times", () => {
			const instance1 = CommentService.getInstance()
			const instance2 = CommentService.getInstance()
			const instance3 = CommentService.getInstance()

			expect(instance1).toBe(instance2)
			expect(instance2).toBe(instance3)
			expect(instance1).toBe(commentService)
		})

		it("should create new instance after reset", () => {
			const instance1 = CommentService.getInstance()

			// Reset singleton
			;(CommentService as any).instance = null

			const instance2 = CommentService.getInstance()

			expect(instance1).not.toBe(instance2)
		})
	})

	describe("Basic Data Structure Tests", () => {
		it("should have correct initial state", () => {
			expect(commentService).toBeDefined()
			expect(commentService.getCommentThread("test")).toBeNull()
		})

		it("should have threadMap as Map with WeakRef storage", () => {
			// Verify threadMap is Map type
			const threadMap = (commentService as any).threadMap
			expect(threadMap).toBeInstanceOf(Map)
			expect(threadMap.size).toBe(0)
		})

		it("should have commentController initially null", () => {
			const commentController = (commentService as any).commentController
			expect(commentController).toBeNull()
		})
	})

	describe("Method Signature Verification", () => {
		it("should have all required methods with correct signatures", () => {
			expect(typeof commentService.initialize).toBe("function")
			expect(typeof commentService.dispose).toBe("function")
			expect(typeof commentService.focusOrCreateCommentThread).toBe("function")
			expect(typeof commentService.disposeCommentThread).toBe("function")
			expect(typeof commentService.clearAllCommentThreads).toBe("function")
			expect(typeof commentService.getCommentThread).toBe("function")
		})

		it("should return correct types from methods", async () => {
			// Test return types
			const initResult = commentService.initialize()
			expect(initResult).toBeInstanceOf(Promise)

			const disposeResult = commentService.dispose()
			expect(disposeResult).toBeInstanceOf(Promise)

			const mockCommentThreadInfo: CommentThreadInfo = {
				issueId: "test",
				fileUri: vscode.Uri.file("/test/file.ts"),
				range: new vscode.Range(0, 0, 5, 0),
				comment: { body: "Test", mode: 1, author: { name: "Test" } },
			}
			const focusResult = commentService.focusOrCreateCommentThread(mockCommentThreadInfo)
			expect(focusResult).toBeInstanceOf(Promise)

			const disposeThreadResult = commentService.disposeCommentThread("test")
			expect(disposeThreadResult).toBeInstanceOf(Promise)

			const clearResult = commentService.clearAllCommentThreads()
			expect(clearResult).toBeInstanceOf(Promise)

			const getResult = commentService.getCommentThread("test")
			expect(getResult).toBeNull()
		})
	})

	describe("CommentThreadInfo Interface Verification", () => {
		it("should accept valid CommentThreadInfo object", () => {
			const mockComment: vscode.Comment = {
				body: "Test comment",
				mode: 1,
				author: { name: "Test User" },
			}

			const commentThreadInfo: CommentThreadInfo = {
				issueId: "test-issue-1",
				fileUri: vscode.Uri.file("/test/file.ts"),
				range: new vscode.Range(0, 0, 5, 0),
				comment: mockComment,
			}

			// Verify interface structure is correct
			expect(commentThreadInfo.issueId).toBe("test-issue-1")
			expect(commentThreadInfo.fileUri).toBeDefined()
			expect(commentThreadInfo.range).toBeDefined()
			expect(commentThreadInfo.comment).toBe(mockComment)
		})
	})

	describe("Service Lifecycle Tests", () => {
		it("should handle initialize method call", async () => {
			await expect(commentService.initialize()).resolves.toBeUndefined()
		})

		it("should handle dispose method call", async () => {
			await expect(commentService.dispose()).resolves.toBeUndefined()
		})

		it("should handle multiple initialize calls", async () => {
			await expect(commentService.initialize()).resolves.toBeUndefined()
			await expect(commentService.initialize()).resolves.toBeUndefined()
			await expect(commentService.initialize()).resolves.toBeUndefined()
		})
	})
})

describe("CommentService - Step 5.2: CommentController and Basic Comment Features", () => {
	let commentService: CommentService

	beforeEach(() => {
		// Reset singleton instance
		;(CommentService as any).instance = null
		commentService = CommentService.getInstance()

		// Reset mocks
		jest.clearAllMocks()
		mockCommentController.createCommentThread.mockReturnValue(mockCommentThread)
	})

	afterEach(() => {
		// Cleanup
		;(CommentService as any).instance = null
	})

	describe("CommentController Creation Tests", () => {
		it("should create CommentController with correct ID and title", async () => {
			await commentService.initialize()

			expect(vscode.comments.createCommentController).toHaveBeenCalledWith(
				"shenma-code-review",
				"Shenma Code Review",
			)
		})

		it("should not create duplicate CommentController on multiple initialize calls", async () => {
			await commentService.initialize()
			await commentService.initialize()
			await commentService.initialize()

			expect(vscode.comments.createCommentController).toHaveBeenCalledTimes(1)
		})

		it("should configure commentingRangeProvider correctly", async () => {
			await commentService.initialize()

			const commentController = (commentService as any).commentController
			expect(commentController.commentingRangeProvider).toBeDefined()

			// Test commentingRangeProvider function
			const ranges = commentController.commentingRangeProvider.provideCommentingRanges(mockDocument)
			expect(ranges).toHaveLength(1)
			expect(ranges[0].start.line).toBe(0)
			expect(ranges[0].start.character).toBe(0)
			expect(ranges[0].end.line).toBe(99) // document.lineCount - 1
			expect(ranges[0].end.character).toBe(0)
		})
	})

	describe("Comment Thread Creation Tests", () => {
		it("should create new comment thread with correct properties", async () => {
			const mockComment: vscode.Comment = {
				body: "Test comment",
				mode: 1,
				author: { name: "Test User" },
			}

			const commentThreadInfo: CommentThreadInfo = {
				issueId: "test-issue-1",
				fileUri: vscode.Uri.file("/test/file.ts"),
				range: new vscode.Range(0, 0, 5, 0),
				comment: mockComment,
			}

			await commentService.focusOrCreateCommentThread(commentThreadInfo)

			expect(mockCommentController.createCommentThread).toHaveBeenCalledWith(
				commentThreadInfo.fileUri,
				commentThreadInfo.range,
				[commentThreadInfo.comment],
			)
		})

		it("should configure thread properties correctly", async () => {
			const mockComment: vscode.Comment = {
				body: "Test comment",
				mode: 1,
				author: { name: "Test User" },
			}

			const commentThreadInfo: CommentThreadInfo = {
				issueId: "test-issue-123",
				fileUri: vscode.Uri.file("/test/file.ts"),
				range: new vscode.Range(0, 0, 5, 0),
				comment: mockComment,
			}

			await commentService.focusOrCreateCommentThread(commentThreadInfo)

			expect(mockCommentThread.contextValue).toBe("ShenmaCodeReview")
			expect(mockCommentThread.collapsibleState).toBe(1) // Expanded
			expect(mockCommentThread.canReply).toBe(false)
		})

		it("should store thread in threadMap with WeakRef", async () => {
			const mockComment: vscode.Comment = {
				body: "Test comment",
				mode: 1,
				author: { name: "Test User" },
			}

			const commentThreadInfo: CommentThreadInfo = {
				issueId: "test-issue-1",
				fileUri: vscode.Uri.file("/test/file.ts"),
				range: new vscode.Range(0, 0, 5, 0),
				comment: mockComment,
			}

			await commentService.focusOrCreateCommentThread(commentThreadInfo)

			const threadMap = (commentService as any).threadMap
			expect(threadMap.has("test-issue-1")).toBe(true)

			const threadRef = threadMap.get("test-issue-1")
			expect(threadRef).toBeInstanceOf(WeakRef)
		})
	})

	describe("File Operations Tests", () => {
		it("should open file and focus on range", async () => {
			const mockComment: vscode.Comment = {
				body: "Test comment",
				mode: 1,
				author: { name: "Test User" },
			}

			const commentThreadInfo: CommentThreadInfo = {
				issueId: "test-issue-1",
				fileUri: vscode.Uri.file("/test/file.ts"),
				range: new vscode.Range(10, 5, 15, 10),
				comment: mockComment,
			}

			await commentService.focusOrCreateCommentThread(commentThreadInfo)

			expect(vscode.workspace.openTextDocument).toHaveBeenCalledWith(commentThreadInfo.fileUri)
			expect(vscode.window.showTextDocument).toHaveBeenCalledWith(mockDocument)
			expect(mockEditor.revealRange).toHaveBeenCalledWith(
				commentThreadInfo.range,
				vscode.TextEditorRevealType.InCenter,
			)
		})

		it("should set editor selection correctly", async () => {
			const mockComment: vscode.Comment = {
				body: "Test comment",
				mode: 1,
				author: { name: "Test User" },
			}

			const commentThreadInfo: CommentThreadInfo = {
				issueId: "test-issue-1",
				fileUri: vscode.Uri.file("/test/file.ts"),
				range: new vscode.Range(10, 5, 15, 10),
				comment: mockComment,
			}

			await commentService.focusOrCreateCommentThread(commentThreadInfo)

			expect(vscode.Selection).toHaveBeenCalledWith(commentThreadInfo.range.start, commentThreadInfo.range.end)
		})
	})

	describe("Error Handling Tests", () => {
		const vscode = require("vscode")
		it("should handle CommentController creation failure", async () => {
			const error = new Error("Failed to create controller")
			vscode.comments.createCommentController.mockImplementationOnce(() => {
				throw error
			})

			await expect(commentService.initialize()).rejects.toThrow("Failed to create controller")
		})

		it("should handle file opening failure", async () => {
			const vscode = require("vscode")
			const error = new Error("File not found")
			vscode.workspace.openTextDocument.mockRejectedValueOnce(error)

			const mockComment: vscode.Comment = {
				body: "Test comment",
				mode: 1,
				author: { name: "Test User" },
			}

			const commentThreadInfo: CommentThreadInfo = {
				issueId: "test-issue-1",
				fileUri: vscode.Uri.file("/nonexistent/file.ts"),
				range: new vscode.Range(0, 0, 5, 0),
				comment: mockComment,
			}

			await expect(commentService.focusOrCreateCommentThread(commentThreadInfo)).rejects.toThrow("File not found")
		})
	})
})

describe("CommentService - Step 5.3: Comment Thread Management System", () => {
	let commentService: CommentService

	beforeEach(() => {
		// Reset singleton instance
		;(CommentService as any).instance = null
		commentService = CommentService.getInstance()

		// Reset mocks
		jest.clearAllMocks()
		mockCommentController.createCommentThread.mockReturnValue(mockCommentThread)
	})

	afterEach(() => {
		// Cleanup
		;(CommentService as any).instance = null
	})

	describe("Thread Lookup Tests", () => {
		it("should return null for non-existent thread", () => {
			const result = commentService.getCommentThread("non-existent")
			expect(result).toBeNull()
		})

		it("should return existing thread correctly", async () => {
			const mockComment: vscode.Comment = {
				body: "Test comment",
				mode: 1,
				author: { name: "Test User" },
			}

			const commentThreadInfo: CommentThreadInfo = {
				issueId: "test-issue-1",
				fileUri: vscode.Uri.file("/test/file.ts"),
				range: new vscode.Range(0, 0, 5, 0),
				comment: mockComment,
			}

			// Create a thread first
			await commentService.focusOrCreateCommentThread(commentThreadInfo)

			// Now try to get it
			const result = commentService.getCommentThread("test-issue-1")
			expect(result).toBe(mockCommentThread)
		})

		it("should handle WeakRef deref returning null", () => {
			// Manually add a WeakRef that will return null
			const threadMap = (commentService as any).threadMap
			const mockWeakRef = {
				deref: jest.fn().mockReturnValue(null),
			}
			threadMap.set("test-issue", mockWeakRef)

			const result = commentService.getCommentThread("test-issue")
			expect(result).toBeNull()
			expect(threadMap.has("test-issue")).toBe(false) // Should be cleaned up
		})

		it("should handle disposed thread and clean up map", () => {
			// Create a mock thread that appears disposed
			const disposedThread = {
				uri: null,
				range: null,
				dispose: jest.fn(),
			}

			const threadMap = (commentService as any).threadMap
			const mockWeakRef = {
				deref: jest.fn().mockReturnValue(disposedThread),
			}
			threadMap.set("disposed-issue", mockWeakRef)

			const result = commentService.getCommentThread("disposed-issue")
			expect(result).toBeNull()
			expect(threadMap.has("disposed-issue")).toBe(false) // Should be cleaned up
		})
	})

	describe("Thread Disposal Tests", () => {
		it("should dispose existing thread correctly", async () => {
			const mockComment: vscode.Comment = {
				body: "Test comment",
				mode: 1,
				author: { name: "Test User" },
			}

			const commentThreadInfo: CommentThreadInfo = {
				issueId: "test-issue-1",
				fileUri: vscode.Uri.file("/test/file.ts"),
				range: new vscode.Range(0, 0, 5, 0),
				comment: mockComment,
			}

			// Create a thread first
			await commentService.focusOrCreateCommentThread(commentThreadInfo)

			// Dispose it
			await commentService.disposeCommentThread("test-issue-1")

			expect(mockCommentThread.dispose).toHaveBeenCalled()

			// Should be removed from map
			const threadMap = (commentService as any).threadMap
			expect(threadMap.has("test-issue-1")).toBe(false)
		})

		it("should handle disposing non-existent thread gracefully", async () => {
			await expect(commentService.disposeCommentThread("non-existent")).resolves.toBeUndefined()
		})

		it("should handle thread dispose error gracefully", async () => {
			const mockComment: vscode.Comment = {
				body: "Test comment",
				mode: 1,
				author: { name: "Test User" },
			}

			const commentThreadInfo: CommentThreadInfo = {
				issueId: "test-issue-1",
				fileUri: vscode.Uri.file("/test/file.ts"),
				range: new vscode.Range(0, 0, 5, 0),
				comment: mockComment,
			}

			// Create a thread first
			await commentService.focusOrCreateCommentThread(commentThreadInfo)

			// Make dispose throw an error
			mockCommentThread.dispose.mockImplementationOnce(() => {
				throw new Error("Dispose failed")
			})

			// Should not throw, but handle gracefully
			await expect(commentService.disposeCommentThread("test-issue-1")).resolves.toBeUndefined()

			// Should still be removed from map
			const threadMap = (commentService as any).threadMap
			expect(threadMap.has("test-issue-1")).toBe(false)
		})
	})

	describe("Bulk Thread Management Tests", () => {
		it("should clear all threads correctly", async () => {
			const mockComment: vscode.Comment = {
				body: "Test comment",
				mode: 1,
				author: { name: "Test User" },
			}

			// Create multiple threads
			for (let i = 1; i <= 3; i++) {
				const commentThreadInfo: CommentThreadInfo = {
					issueId: `test-issue-${i}`,
					fileUri: vscode.Uri.file(`/test/file${i}.ts`),
					range: new vscode.Range(0, 0, 5, 0),
					comment: mockComment,
				}
				await commentService.focusOrCreateCommentThread(commentThreadInfo)
			}

			// Clear all threads
			await commentService.clearAllCommentThreads()

			// All threads should be disposed
			expect(mockCommentThread.dispose).toHaveBeenCalledTimes(3)

			// Map should be empty
			const threadMap = (commentService as any).threadMap
			expect(threadMap.size).toBe(0)
		})

		it("should handle empty thread map gracefully", async () => {
			await expect(commentService.clearAllCommentThreads()).resolves.toBeUndefined()
		})

		it("should continue clearing even if some disposals fail", async () => {
			const mockComment: vscode.Comment = {
				body: "Test comment",
				mode: 1,
				author: { name: "Test User" },
			}

			// Create multiple threads
			for (let i = 1; i <= 3; i++) {
				const commentThreadInfo: CommentThreadInfo = {
					issueId: `test-issue-${i}`,
					fileUri: vscode.Uri.file(`/test/file${i}.ts`),
					range: new vscode.Range(0, 0, 5, 0),
					comment: mockComment,
				}
				await commentService.focusOrCreateCommentThread(commentThreadInfo)
			}

			// Make some dispose calls fail
			let callCount = 0
			mockCommentThread.dispose.mockImplementation(() => {
				callCount++
				if (callCount === 2) {
					throw new Error("Dispose failed")
				}
			})

			// Should not throw, but handle gracefully
			await expect(commentService.clearAllCommentThreads()).resolves.toBeUndefined()

			// Map should still be cleared
			const threadMap = (commentService as any).threadMap
			expect(threadMap.size).toBe(0)
		})
	})

	describe("Service Disposal Tests", () => {
		it("should dispose service completely", async () => {
			const mockComment: vscode.Comment = {
				body: "Test comment",
				mode: 1,
				author: { name: "Test User" },
			}

			const commentThreadInfo: CommentThreadInfo = {
				issueId: "test-issue-1",
				fileUri: vscode.Uri.file("/test/file.ts"),
				range: new vscode.Range(0, 0, 5, 0),
				comment: mockComment,
			}

			// Create a thread and initialize controller
			await commentService.focusOrCreateCommentThread(commentThreadInfo)

			// Dispose the service
			await commentService.dispose()

			// Comment controller should be disposed
			expect(mockCommentController.dispose).toHaveBeenCalled()

			// Thread should be disposed
			expect(mockCommentThread.dispose).toHaveBeenCalled()

			// Singleton instance should be reset
			expect((CommentService as any).instance).toBeNull()

			// Internal state should be reset
			expect((commentService as any).commentController).toBeNull()
			expect((commentService as any).threadMap.size).toBe(0)
		})

		it("should handle disposal errors gracefully", async () => {
			// Initialize the service
			await commentService.initialize()

			// Make controller dispose throw an error
			mockCommentController.dispose.mockImplementationOnce(() => {
				throw new Error("Controller dispose failed")
			})

			// Should not throw, but handle gracefully
			await expect(commentService.dispose()).resolves.toBeUndefined()

			// State should still be reset
			expect((CommentService as any).instance).toBeNull()
			expect((commentService as any).commentController).toBeNull()
		})
	})

	describe("Duplicate Thread Prevention Tests", () => {
		it("should not create duplicate threads for same issueId", async () => {
			const mockComment: vscode.Comment = {
				body: "Test comment",
				mode: 1,
				author: { name: "Test User" },
			}

			const commentThreadInfo: CommentThreadInfo = {
				issueId: "test-issue-1",
				fileUri: vscode.Uri.file("/test/file.ts"),
				range: new vscode.Range(0, 0, 5, 0),
				comment: mockComment,
			}

			// Create thread first time
			await commentService.focusOrCreateCommentThread(commentThreadInfo)

			// Try to create again with same issueId
			await commentService.focusOrCreateCommentThread(commentThreadInfo)

			// Should only create one thread
			expect(mockCommentController.createCommentThread).toHaveBeenCalledTimes(1)

			// Should focus existing thread instead
			expect(vscode.workspace.openTextDocument).toHaveBeenCalledTimes(2) // Once for create, once for focus
		})
	})

	describe("Memory Management Tests", () => {
		it("should handle WeakRef cleanup correctly", () => {
			const threadMap = (commentService as any).threadMap

			// Simulate a WeakRef that has been garbage collected
			const mockWeakRef = {
				deref: jest.fn().mockReturnValue(null),
			}
			threadMap.set("gc-test", mockWeakRef)

			// Try to get the thread
			const result = commentService.getCommentThread("gc-test")

			expect(result).toBeNull()
			expect(threadMap.has("gc-test")).toBe(false) // Should be cleaned up
			expect(mockWeakRef.deref).toHaveBeenCalled()
		})
	})
})
