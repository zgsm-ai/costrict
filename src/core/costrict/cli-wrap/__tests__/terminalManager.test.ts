import { execSync } from "child_process"
import { TerminalManager } from "../terminalManager"

// Mock node-pty
const mockOnExitListeners: Array<(e: { exitCode: number }) => void> = []
const mockOnDataListeners: Array<(data: string) => void> = []
const mockPtyProcess = {
	write: vi.fn(),
	resize: vi.fn(),
	kill: vi.fn(),
	onData: vi.fn((listener: (data: string) => void) => {
		mockOnDataListeners.push(listener)
	}),
	onExit: vi.fn((listener: (e: { exitCode: number }) => void) => {
		mockOnExitListeners.push(listener)
	}),
}

vi.mock("node-pty", () => ({
	spawn: vi.fn(() => mockPtyProcess),
}))

// Mock contextSync
const mockContextSyncStop = vi.fn()
const mockContextSyncStart = vi.fn()
const mockContextSyncSyncContext = vi.fn()
vi.mock("../contextSync", () => ({
	getContextSyncService: () => ({
		start: mockContextSyncStart,
		stop: mockContextSyncStop,
		syncContext: mockContextSyncSyncContext,
	}),
}))

// Mock child_process
vi.mock("child_process", () => ({
	execSync: vi.fn((cmd: string) => {
		if (typeof cmd === "string" && cmd.includes("which cs")) {
			return "/usr/local/bin/cs"
		}
		return ""
	}),
}))

// Mock utils
vi.mock("../../../utils/path", () => ({
	getWorkspacePath: () => "/test/workspace",
}))
vi.mock("../../../utils/platform", () => ({
	isJetbrainsPlatform: () => false,
}))
vi.mock("../../../utils/shell", () => ({
	getShell: () => "/bin/bash",
}))
vi.mock("../../../utils/ideaShellEnvLoader", () => ({
	getIdeaShellEnvWithUpdatePath: (env: any) => env,
}))

describe("TerminalManager", () => {
	let manager: TerminalManager

	beforeEach(() => {
		vi.clearAllMocks()
		mockOnExitListeners.length = 0
		mockOnDataListeners.length = 0

		// Reset singleton
		const existing = TerminalManager.getInstance()
		existing.dispose()
		manager = TerminalManager.getInstance()

		// Set a message sender to capture webview messages
		manager.setMessageSender(vi.fn())
	})

	afterEach(() => {
		manager.dispose()
	})

	describe("onExit callback", () => {
		test("should call getContextSyncService().stop() when PTY process exits", async () => {
			await manager.start({ cols: 80, rows: 24 })

			// Simulate PTY exit
			expect(mockOnExitListeners.length).toBe(1)
			mockOnExitListeners[0]({ exitCode: 0 })

			expect(mockContextSyncStop).toHaveBeenCalled()
		})

		test("should send CostrictCliExit message on exit", async () => {
			const messageSender = vi.fn()
			manager.setMessageSender(messageSender)

			await manager.start({ cols: 80, rows: 24 })

			mockOnExitListeners[0]({ exitCode: 42 })

			expect(messageSender).toHaveBeenCalledWith({
				type: "CostrictCliExit",
				exitCode: 42,
			})
		})

		test("should reset running state and port on exit", async () => {
			await manager.start({ cols: 80, rows: 24 })

			expect(manager.running).toBe(true)

			mockOnExitListeners[0]({ exitCode: 0 })

			expect(manager.running).toBe(false)
			expect(manager.getPort()).toBeNull()
		})

		test("should clean up exit handler on PTY exit", async () => {
			const removeListenerSpy = vi.spyOn(process, "removeListener")

			await manager.start({ cols: 80, rows: 24 })

			mockOnExitListeners[0]({ exitCode: 0 })

			expect(removeListenerSpy).toHaveBeenCalledWith("exit", expect.any(Function))
			removeListenerSpy.mockRestore()
		})
	})
})
