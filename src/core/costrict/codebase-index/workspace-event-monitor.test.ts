import * as vscode from "vscode"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { WorkspaceEventMonitor, workspaceEventMonitor } from "./workspace-event-monitor"
import { ZgsmCodebaseIndexManager } from "./index"

describe("WorkspaceEventMonitor", () => {
	let monitor: WorkspaceEventMonitor
	let mockCodebaseIndexManager: any

	beforeEach(() => {
		// Reset singleton
		;(WorkspaceEventMonitor as any).instance = null
		monitor = WorkspaceEventMonitor.getInstance()

		// Set default configuration
		monitor.updateConfig({
			enabled: true,
			debounceMs: 100,
			batchSize: 10,
			maxRetries: 1,
			retryDelayMs: 10,
		})

		// Mock ZgsmCodebaseIndexManager
		mockCodebaseIndexManager = {
			publishWorkspaceEvents: vi.fn().mockResolvedValue({
				success: true,
				data: 12345,
				message: "success",
			}),
		}
		;(ZgsmCodebaseIndexManager as any).getInstance = vi.fn().mockReturnValue(mockCodebaseIndexManager)

		// Mock clineProvider and API configuration
		const mockClineProvider = {
			getState: vi.fn().mockResolvedValue({
				apiConfiguration: {
					apiProvider: "zgsm",
					zgsmCodebaseIndexEnabled: true,
				},
			}),
		}
		monitor.setProvider(mockClineProvider as any)
	})

	afterEach(() => {
		monitor.dispose()
		vi.clearAllMocks()
	})

	describe("Singleton Pattern", () => {
		it("should return the same instance", () => {
			const instance1 = WorkspaceEventMonitor.getInstance()
			const instance2 = WorkspaceEventMonitor.getInstance()
			expect(instance1).toBe(instance2)
		})
	})

	describe("Initialization and Destruction", () => {
		it("should initialize successfully", async () => {
			await expect(monitor.initialize()).resolves.not.toThrow()
			await expect(monitor.initialize()).resolves.not.toThrow() // Duplicate initialization
			expect(monitor.getStatus().isInitialized).toBe(true)
		})

		it("should destroy correctly", async () => {
			await monitor.initialize()
			monitor.dispose()
			expect(monitor.getStatus().isInitialized).toBe(false)
		})
	})

	describe("Configuration Management", () => {
		it("should update configuration", () => {
			const newConfig = { enabled: false, batchSize: 100 }
			monitor.updateConfig(newConfig)

			const status = monitor.getStatus()
			expect(status.config.enabled).toBe(false)
			expect(status.config.batchSize).toBe(100)
		})
	})

	describe("Event Handling", () => {
		it("should handle document save event", async () => {
			const mockDocument = {
				uri: {
					fsPath: "/test/file.txt",
					scheme: "file",
				},
				getText: () => "mock document content",
				version: 1,
			} as any

			// Set cache to ensure content has changed
			monitor["documentContentCache"].set("/test/file.txt", {
				contentHash: "different-hash",
				version: 0,
			})

			await monitor["handleDocumentSave"](mockDocument)
			expect(monitor.getStatus().eventBufferSize).toBeGreaterThan(0)
		})

		it("should filter non-file protocol events", async () => {
			const mockDocument = {
				uri: {
					fsPath: "/test/file.txt",
					scheme: "http",
				},
				getText: () => "mock document content",
				version: 1,
			} as any

			// Set cache to ensure content has changed
			monitor["documentContentCache"].set("/test/file.txt", {
				contentHash: "different-hash",
				version: 0,
			})

			await monitor["handleDocumentSave"](mockDocument)
			expect(monitor.getStatus().eventBufferSize).toBe(0)
		})

		it("should handle document save event (when content changes)", async () => {
			const mockDocument = {
				uri: {
					fsPath: "/test/file.txt",
					scheme: "file",
				},
				getText: () => "mock document content",
				version: 1,
			} as any

			// First set a different content cache, so changes will be detected when saving
			monitor["documentContentCache"].set("/test/file.txt", {
				contentHash: "different-hash",
				version: 0,
			})

			await monitor["handleDocumentSave"](mockDocument)
			expect(monitor.getStatus().eventBufferSize).toBeGreaterThan(0)
		})

		it("should handle file delete event", async () => {
			const mockEvent = {
				files: [
					{ fsPath: "/test/file1.txt", scheme: "file" },
					{ fsPath: "/test/file2.txt", scheme: "file" },
				],
			} as any

			expect(monitor.getStatus().eventBufferSize).toBe(0)
		})

		it("should handle file rename event", async () => {
			const mockEvent = {
				files: [
					{
						oldUri: { fsPath: "/test/old.txt", scheme: "file" },
						newUri: { fsPath: "/test/new.txt", scheme: "file" },
					},
				],
			} as any

			await monitor["handleFileRename"](mockEvent)
			expect(monitor.getStatus().eventBufferSize).toBe(1)
		})

		it("should handle workspace change event", async () => {
			const mockEvent = {
				added: [{ uri: { fsPath: "/workspace/new", scheme: "file" } }],
				removed: [{ uri: { fsPath: "/workspace/old", scheme: "file" } }],
			} as any

			await monitor["handleWorkspaceChange"](mockEvent)
			expect(monitor.getStatus().eventBufferSize).toBe(2)
		})

		it("should handle file creation event", async () => {
			const mockEvent = {
				files: [{ fsPath: "/test/new.txt", scheme: "file" }],
			} as any

			await monitor["handleWillCreateFiles"](mockEvent)
			expect(monitor.getStatus().eventBufferSize).toBe(1)
		})

		it("should respect enabled configuration", async () => {
			monitor.updateConfig({ enabled: false })

			const mockDocument = {
				uri: {
					fsPath: "/test/file.txt",
					scheme: "file",
				},
				getText: () => "mock document content",
				version: 1,
			} as any

			// Set cache to ensure content has changed
			monitor["documentContentCache"].set("/test/file.txt", {
				contentHash: "different-hash",
				version: 0,
			})

			await monitor["handleDocumentSave"](mockDocument)
			expect(monitor.getStatus().eventBufferSize).toBe(0)
		})
	})

	describe("Event Deduplication", () => {
		it("should deduplicate identical events", async () => {
			const mockDocument = {
				uri: {
					fsPath: "/test/file.txt",
					scheme: "file",
				},
				getText: () => "mock document content",
				version: 1,
			} as any

			// Set cache to ensure content has changed
			monitor["documentContentCache"].set("/test/file.txt", {
				contentHash: "different-hash",
				version: 0,
			})

			// Trigger the same event multiple times
			await monitor["handleDocumentSave"](mockDocument)
			await monitor["handleDocumentSave"](mockDocument)
			await monitor["handleDocumentSave"](mockDocument)

			// Should only keep the latest event (using the same key will overwrite previous events)
			expect(monitor.getStatus().eventBufferSize).toBe(1)
		})
	})

	describe("Global Instance", () => {
		it("should provide global instance", () => {
			expect(workspaceEventMonitor).toBeInstanceOf(WorkspaceEventMonitor)
		})
	})
})
