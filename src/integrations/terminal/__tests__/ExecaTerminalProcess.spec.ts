// npx vitest run integrations/terminal/__tests__/ExecaTerminalProcess.spec.ts

const mockPid = 12345

// Use a global object to store captured options ( survives mock hoisting)
;(global as any).__capturedExecaOptions = null

// Mocks must be declared before any imports
vitest.mock("execa", () => {
	const mockKill = vitest.fn()

	// Create a mock function that can be tracked by vitest
	const mockExeca = vitest.fn((options: any) => {
		;(global as any).__capturedExecaOptions = options
		// Return a mock result that supports tag template literal
		return {
			pid: mockPid,
			iterable: (_opts: any) =>
				(async function* () {
					yield "test output\n"
				})(),
			kill: mockKill,
			// Add promise-like behavior
			then: (onfulfilled: any, onrejected: any) => {
				return Promise.resolve({ exitCode: 0 }).then(onfulfilled, onrejected)
			},
			catch: (onrejected: any) => {
				return Promise.resolve({ exitCode: 0 }).catch(onrejected)
			},
		}
	})

	// Add bind method to support additional call patterns
	;(mockExeca as any).bind = (_ctx: any) => (options: any) => {
		;(global as any).__capturedExecaOptions = options
		return {
			pid: mockPid,
			iterable: (_opts: any) =>
				(async function* () {
					yield "test output\n"
				})(),
			kill: mockKill,
			then: (onfulfilled: any, onrejected: any) => {
				return Promise.resolve({ exitCode: 0 }).then(onfulfilled, onrejected)
			},
			catch: (onrejected: any) => {
				return Promise.resolve({ exitCode: 0 }).catch(onrejected)
			},
		}
	}

	return { execa: mockExeca, ExecaError: class extends Error {} }
})

vitest.mock("ps-tree", () => ({
	default: vitest.fn((_pid: number, cb: any) => cb(null, [])),
}))

vitest.mock("../../utils/shell", () => ({
	getShell: vitest.fn().mockReturnValue("/bin/sh"),
}))

vitest.mock("../../utils/ideaShellEnvLoader", () => ({
	getIdeaShellEnvWithUpdatePath: vitest.fn((env: any) => env),
}))

vitest.mock("../../utils/platform", () => ({
	isCliPatform: vitest.fn().mockReturnValue(false),
	isJetbrainsPlatform: vitest.fn().mockReturnValue(false),
}))

vitest.mock("./constants", () => ({
	isGbkEncodedCommand: vitest.fn().mockReturnValue(false),
}))

vitest.mock("../../i18n", () => ({
	t: vitest.fn((key: string) => key),
}))

vitest.mock("delay", () => ({
	default: vitest.fn(() => Promise.resolve()),
}))

// Now import after mocks are declared
import { ExecaTerminalProcess } from "../ExecaTerminalProcess"
import { BaseTerminal } from "../BaseTerminal"
import type { RooTerminal } from "../types"

describe("ExecaTerminalProcess", () => {
	let mockTerminal: RooTerminal
	let terminalProcess: ExecaTerminalProcess
	let originalEnv: NodeJS.ProcessEnv

	beforeEach(() => {
		originalEnv = { ...process.env }
		BaseTerminal.setExecaShellPath(undefined)
		mockTerminal = {
			provider: "execa",
			id: 1,
			busy: false,
			running: false,
			getCurrentWorkingDirectory: vitest.fn().mockReturnValue("/test/cwd"),
			isClosed: vitest.fn().mockReturnValue(false),
			runCommand: vitest.fn(),
			setActiveStream: vitest.fn().mockResolvedValue(undefined),
			shellExecutionComplete: vitest.fn(),
			getProcessesWithOutput: vitest.fn().mockReturnValue([]),
			getUnretrievedOutput: vitest.fn().mockReturnValue(""),
			getLastCommand: vitest.fn().mockReturnValue(""),
			cleanCompletedProcessQueue: vitest.fn(),
		} as unknown as RooTerminal
		terminalProcess = new ExecaTerminalProcess(mockTerminal)
		;(global as any).__capturedExecaOptions = null
	})

	afterEach(() => {
		process.env = originalEnv
		vitest.clearAllMocks()
	})

	describe("basic functionality", () => {
		it("should create instance with terminal reference", () => {
			expect(terminalProcess).toBeInstanceOf(ExecaTerminalProcess)
			expect(terminalProcess.terminal).toBe(mockTerminal)
		})
	})

	describe("trimRetrievedOutput", () => {
		it("clears buffer when all output has been retrieved", () => {
			// Set up a scenario where all output has been retrieved
			terminalProcess["fullOutput"] = "test output data"
			terminalProcess["lastRetrievedIndex"] = 16 // Same as fullOutput.length

			// Access the protected method through type casting
			;(terminalProcess as any).trimRetrievedOutput()

			expect(terminalProcess["fullOutput"]).toBe("")
			expect(terminalProcess["lastRetrievedIndex"]).toBe(0)
		})

		it("does not clear buffer when there is unretrieved output", () => {
			// Set up a scenario where not all output has been retrieved
			terminalProcess["fullOutput"] = "test output data"
			terminalProcess["lastRetrievedIndex"] = 5 // Less than fullOutput.length
			;(terminalProcess as any).trimRetrievedOutput()

			// Buffer should NOT be cleared - there's still unretrieved content
			expect(terminalProcess["fullOutput"]).toBe("test output data")
			expect(terminalProcess["lastRetrievedIndex"]).toBe(5)
		})

		it("does nothing when buffer is already empty", () => {
			terminalProcess["fullOutput"] = ""
			terminalProcess["lastRetrievedIndex"] = 0
			;(terminalProcess as any).trimRetrievedOutput()

			expect(terminalProcess["fullOutput"]).toBe("")
			expect(terminalProcess["lastRetrievedIndex"]).toBe(0)
		})

		it("clears buffer when lastRetrievedIndex exceeds fullOutput length", () => {
			// Edge case: index is greater than current length (could happen if output was modified)
			terminalProcess["fullOutput"] = "short"
			terminalProcess["lastRetrievedIndex"] = 100
			;(terminalProcess as any).trimRetrievedOutput()

			expect(terminalProcess["fullOutput"]).toBe("")
			expect(terminalProcess["lastRetrievedIndex"]).toBe(0)
		})
	})
})
