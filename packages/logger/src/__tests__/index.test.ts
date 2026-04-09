import * as vscode from "vscode"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const createOutputChannel = vi.fn()

vi.mock("vscode", () => ({
	window: {
		createOutputChannel,
	},
}))

describe("@roo-code/logger", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	afterEach(async () => {
		const loggerModule = await import("../index")
		loggerModule.deactivate()
	})

	it("reuses cached loggers for the same name and preserves the first channel", async () => {
		const firstChannel = {
			appendLine: vi.fn(),
			dispose: vi.fn(),
		}
		const secondChannel = {
			appendLine: vi.fn(),
			dispose: vi.fn(),
		}
		createOutputChannel.mockReturnValue(firstChannel)

		const loggerModule = await import("../index")
		const first = loggerModule.createLogger("SharedLogger")
		const second = loggerModule.createLogger("SharedLogger", {
			channel: secondChannel as unknown as vscode.OutputChannel,
		})

		expect(second).toBe(first)
		expect(first.channel).toBe(firstChannel)
		expect(createOutputChannel).toHaveBeenCalledTimes(1)
		expect(createOutputChannel).toHaveBeenCalledWith("SharedLogger")
	})

	it("uses the package default logger name when no name is provided", async () => {
		const channel = {
			appendLine: vi.fn(),
			dispose: vi.fn(),
		}
		createOutputChannel.mockReturnValue(channel)

		const loggerModule = await import("../index")
		loggerModule.createLogger()

		expect(createOutputChannel).toHaveBeenCalledWith(loggerModule.DEFAULT_LOGGER_NAME)
	})
})
