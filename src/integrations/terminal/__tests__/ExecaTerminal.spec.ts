// npx vitest run src/integrations/terminal/__tests__/ExecaTerminal.spec.ts

// Mock dependencies to avoid using real vscode API - must be before imports
vi.mock("../../../utils/shell", () => ({
	getShell: vi.fn().mockReturnValue("/bin/sh"),
}))

vi.mock("../../../utils/platform", () => ({
	isCliPatform: vi.fn().mockReturnValue(false),
	isJetbrainsPlatform: vi.fn().mockReturnValue(false),
}))

vi.mock("../constants", () => ({
	isGbkEncodedCommand: vi.fn().mockReturnValue(false),
}))

vi.mock("../../../utils/ideaShellEnvLoader", () => ({
	getIdeaShellEnvWithUpdatePath: vi.fn((env) => env),
}))

vi.mock("../../../i18n", () => ({
	t: vi.fn((key: string) => key),
}))

vi.mock("delay", () => ({
	default: vi.fn(() => Promise.resolve()),
}))

vi.mock("ps-tree", () => ({
	default: vi.fn((_pid: number, cb: any) => cb(null, [])),
}))

import { RooTerminalCallbacks } from "../types"
import { ExecaTerminal } from "../ExecaTerminal"

describe("ExecaTerminal", () => {
	it("should run terminal commands and collect output", async () => {
		// TODO: Run the equivalent test for Windows.
		if (process.platform === "win32") {
			return
		}

		const terminal = new ExecaTerminal(1, "/tmp")
		let result

		const callbacks: RooTerminalCallbacks = {
			onLine: vi.fn(),
			onCompleted: (output) => {
				result = output
			},
			onShellExecutionStarted: vi.fn(),
			onShellExecutionComplete: vi.fn(),
		}

		const subprocess = terminal.runCommand("ls -al", callbacks)
		await subprocess

		expect(callbacks.onLine).toHaveBeenCalled()
		expect(callbacks.onShellExecutionStarted).toHaveBeenCalled()
		expect(callbacks.onShellExecutionComplete).toHaveBeenCalled()

		expect(result).toBeTypeOf("string")
		expect(result).toMatch(/total|总计/)
	})
})
