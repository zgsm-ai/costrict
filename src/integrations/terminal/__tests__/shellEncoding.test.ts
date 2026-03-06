// npx vitest run integrations/terminal/__tests__/shellEncoding.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const mockPid = 12345

// Mock execa - must be before any imports that use execa
vitest.mock("execa", () => {
	const mockKill = vitest.fn()
	const boundExeca = vitest.fn()
	const execa = Object.assign(boundExeca, {
		bind: (_ctx: any) => (options: any) => {
			boundExeca(options)
			return (_template: TemplateStringsArray, ..._args: any[]) => ({
				pid: mockPid,
				iterable: (_opts: any) =>
					(async function* () {
						yield "test output\n"
					})(),
				kill: mockKill,
			})
		},
	})
	return { execa, ExecaError: class extends Error {} }
})

vitest.mock("ps-tree", () => ({
	default: vitest.fn((_: number, cb: any) => cb(null, [])),
}))

vitest.mock("../../../utils/platform", () => ({
	isCliPatform: vitest.fn(() => true),
	isJetbrainsPlatform: vitest.fn(() => false),
}))

vitest.mock("../../../utils/shell", () => ({
	getShell: vitest.fn(() => "/bin/bash"),
}))

vitest.mock("../../../utils/ideaShellEnvLoader", () => ({
	getIdeaShellEnvWithUpdatePath: vitest.fn((env: any) => env),
}))

// Imports must come after mocks
import { Options } from "execa"
import { execa } from "execa"
import { ExecaTerminalProcess } from "../ExecaTerminalProcess"
import { BaseTerminal } from "../BaseTerminal"
import type { RooTerminal } from "../types"

describe("ExecaTerminalProcess Shell Encoding", () => {
	let mockTerminal: RooTerminal
	let originalEnv: NodeJS.ProcessEnv

	beforeEach(() => {
		vi.clearAllMocks()
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
			process: undefined,
		} as unknown as RooTerminal
	})

	afterEach(() => {
		process.env = originalEnv
		vi.clearAllMocks()
	})

	it("should use PowerShell encoding command for PowerShell", async () => {
		BaseTerminal.setExecaShellPath("C:\\Program Files\\PowerShell\\7\\pwsh.exe")
		const terminalProcess = new ExecaTerminalProcess(mockTerminal)

		await terminalProcess.run('echo "test"')

		const execaMock = vitest.mocked(execa)
		expect(execaMock).toHaveBeenCalledTimes(1)
		const calledOptions = execaMock.mock.calls[0][0] as any
		expect(calledOptions).toMatchObject({
			cwd: "/test/cwd",
			all: true,
			encoding: "buffer",
		})
		expect(calledOptions.shell).toBe("C:\\Program Files\\PowerShell\\7\\pwsh.exe")
	})

	it("should use CMD encoding command for CMD", async () => {
		BaseTerminal.setExecaShellPath("C:\\Windows\\System32\\cmd.exe")
		const terminalProcess = new ExecaTerminalProcess(mockTerminal)

		await terminalProcess.run('echo "test"')

		const execaMock = vitest.mocked(execa)
		expect(execaMock).toHaveBeenCalledTimes(1)
		const calledOptions = execaMock.mock.calls[0][0] as any
		expect(calledOptions).toMatchObject({
			cwd: "/test/cwd",
			all: true,
			encoding: "buffer",
		})
		expect(calledOptions.shell).toBe("C:\\Windows\\System32\\cmd.exe")
	})

	it("should not modify command on non-Windows platforms", async () => {
		BaseTerminal.setExecaShellPath("/bin/bash")
		const terminalProcess = new ExecaTerminalProcess(mockTerminal)

		// Temporarily modify process.platform for testing
		const originalPlatform = (global.process as any).platform
		Object.defineProperty(global.process, "platform", {
			value: "linux",
			configurable: true,
		})

		try {
			await terminalProcess.run('echo "test"')

			const execaMock = vitest.mocked(execa)
			expect(execaMock).toHaveBeenCalledTimes(1)
			const calledOptions = execaMock.mock.calls[0][0] as any
			expect(calledOptions).toMatchObject({
				cwd: "/test/cwd",
				all: true,
				encoding: "buffer",
			})
			expect(calledOptions.shell).toBe("/bin/bash")
		} finally {
			// Restore original platform
			Object.defineProperty(global.process, "platform", {
				value: originalPlatform,
				configurable: true,
			})
		}
	})

	it("should handle Git Bash path correctly", async () => {
		BaseTerminal.setExecaShellPath("C:\\Program Files\\Git\\bin\\bash.exe")
		const terminalProcess = new ExecaTerminalProcess(mockTerminal)

		await terminalProcess.run('echo "test"')

		const execaMock = vitest.mocked(execa)
		expect(execaMock).toHaveBeenCalledTimes(1)
		const calledOptions = execaMock.mock.calls[0][0] as any
		expect(calledOptions).toMatchObject({
			cwd: "/test/cwd",
			all: true,
			encoding: "buffer",
		})
		expect(calledOptions.shell).toBe("C:\\Program Files\\Git\\bin\\bash.exe")
	})

	it("should handle legacy PowerShell path correctly", async () => {
		BaseTerminal.setExecaShellPath("C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe")
		const terminalProcess = new ExecaTerminalProcess(mockTerminal)

		await terminalProcess.run('echo "test"')

		const execaMock = vitest.mocked(execa)
		expect(execaMock).toHaveBeenCalledTimes(1)
		const calledOptions = execaMock.mock.calls[0][0] as any
		expect(calledOptions).toMatchObject({
			cwd: "/test/cwd",
			all: true,
			encoding: "buffer",
		})
		expect(calledOptions.shell).toBe("C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe")
	})
})
