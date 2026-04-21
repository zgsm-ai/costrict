import { ContextSyncService, getContextSyncService } from "../contextSync"

const mockDisposable = { dispose: vi.fn() }

vi.mock("vscode", () => ({
	window: {
		activeTextEditor: null,
		onDidChangeActiveTextEditor: vi.fn(() => mockDisposable),
		onDidChangeTextEditorSelection: vi.fn(() => mockDisposable),
		tabGroups: {
			all: [],
			onDidChangeTabs: vi.fn(() => mockDisposable),
		},
		showErrorMessage: vi.fn(),
		showWarningMessage: vi.fn(),
		showInformationMessage: vi.fn(),
		createOutputChannel: vi.fn(() => ({
			appendLine: vi.fn(),
			append: vi.fn(),
			clear: vi.fn(),
			show: vi.fn(),
			dispose: vi.fn(),
		})),
	},
	workspace: {
		workspaceFolders: [],
		getWorkspaceFolder: vi.fn(),
		asRelativePath: vi.fn((p) => p),
		getConfiguration: vi.fn(() => ({ get: vi.fn() })),
	},
	TabInputText: class {},
}))

vi.mock("../terminalManager", () => ({
	getTerminalManager: () => ({
		getPort: () => 12345,
		running: true,
	}),
}))

vi.mock("../editorContext", () => ({
	getActiveFileContext: vi.fn(() => ({
		relativePath: "src/foo.ts",
		fileRef: "@src/foo.ts",
	})),
	getOpenTabs: vi.fn(() => ["src/foo.ts", "src/bar.ts"]),
}))

describe("ContextSyncService", () => {
	let service: ContextSyncService

	beforeEach(() => {
		vi.useFakeTimers()
		mockDisposable.dispose.mockClear()
		// Reset singleton between tests
		const existing = ContextSyncService.getInstance()
		existing?.dispose()
		service = ContextSyncService.getInstance()!
	})

	afterEach(() => {
		service.dispose()
		vi.useRealTimers()
	})

	describe("pause()", () => {
		test("should prevent syncContext from proceeding", async () => {
			const { getActiveFileContext } = await import("../editorContext")

			service.start()
			// Clear calls from start()'s initial syncContext
			vi.mocked(getActiveFileContext).mockClear()

			service.pause()
			await service.syncContext("test-event")

			expect(getActiveFileContext).not.toHaveBeenCalled()
		})

		test("should clear pending debounceTimer", async () => {
			service.start()

			// Trigger syncContext to set a debounceTimer
			await service.syncContext("test-event")
			// Advance less than debounce delay — timer should still be pending
			vi.advanceTimersByTime(100)

			// Now pause — should clear the timer
			service.pause()

			// Advance past debounce delay — fetch should NOT be called
			const fetchSpy = vi.spyOn(globalThis, "fetch")
			vi.advanceTimersByTime(600)

			expect(fetchSpy).not.toHaveBeenCalled()
			fetchSpy.mockRestore()
		})
	})

	describe("syncContext() when paused", () => {
		test("should return early without calling getActiveFileContext", async () => {
			const { getActiveFileContext } = await import("../editorContext")

			service.start()
			vi.mocked(getActiveFileContext).mockClear()

			service.pause()
			await service.syncContext("editor-change")

			expect(getActiveFileContext).not.toHaveBeenCalled()
		})

		test("should return early without calling getOpenTabs", async () => {
			const { getOpenTabs } = await import("../editorContext")

			service.start()
			vi.mocked(getOpenTabs).mockClear()

			service.pause()
			await service.syncContext("tab-change")

			expect(getOpenTabs).not.toHaveBeenCalled()
		})
	})

	describe("resume()", () => {
		test("should allow syncContext to proceed again", async () => {
			const { getActiveFileContext } = await import("../editorContext")

			service.start()
			vi.mocked(getActiveFileContext).mockClear()

			service.pause()
			await service.syncContext("test-event")
			expect(getActiveFileContext).not.toHaveBeenCalled()

			service.resume()
			// resume() calls syncContext internally
			expect(getActiveFileContext).toHaveBeenCalled()
		})

		test("should immediately call syncContext", async () => {
			const { getActiveFileContext } = await import("../editorContext")

			service.start()
			vi.mocked(getActiveFileContext).mockClear()

			service.pause()
			service.resume()

			expect(getActiveFileContext).toHaveBeenCalledTimes(1)
		})
	})

	describe("stop()", () => {
		test("should reset paused state so subsequent syncContext works", async () => {
			const { getActiveFileContext } = await import("../editorContext")

			service.start()
			vi.mocked(getActiveFileContext).mockClear()

			service.pause()
			await service.syncContext("test-event")
			expect(getActiveFileContext).not.toHaveBeenCalled()

			// stop() resets _paused to false
			service.stop()

			// After stop, syncContext should proceed since _paused is now false
			// (port/running checks still pass via our mock)
			await service.syncContext("test-event")
			expect(getActiveFileContext).toHaveBeenCalled()
		})

		test("should clear debounceTimer", async () => {
			service.start()
			await service.syncContext("test-event")

			// debounceTimer should be set after syncContext
			service.stop()

			// After stop, advancing timers should not cause any fetch
			const fetchSpy = vi.spyOn(globalThis, "fetch")
			vi.advanceTimersByTime(1000)

			expect(fetchSpy).not.toHaveBeenCalled()
			fetchSpy.mockRestore()
		})

		test("should dispose all registered listeners", () => {
			service.start()

			// stop() should dispose all listeners
			service.stop()

			// Each of the 3 listeners (onDidChangeActiveTextEditor,
			// onDidChangeTextEditorSelection, onDidChangeTabs) should be disposed
			expect(mockDisposable.dispose).toHaveBeenCalled()
		})
	})
})
