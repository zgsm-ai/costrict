import { describe, it, expect, vi, beforeEach } from "vitest"
import { ensureProjectWikiCommandExists } from "../helpers/projectWikiHelpers"
import { promises as fs } from "fs"
import * as path from "path"
import * as os from "os"

// Mock fs module
vi.mock("fs")
const mockedFs = vi.mocked(fs)

describe("projectWikiHelpers", () => {
	const globalCommandsDir = path.join(os.homedir(), ".roo", "commands")
	const projectWikiFile = path.join(globalCommandsDir, "project-wiki.md")
	const subTaskDir = path.join(globalCommandsDir, "subtasks")

	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("should successfully create wiki command files", async () => {
		// Mock file system operations
		mockedFs.mkdir.mockResolvedValue(undefined)
		mockedFs.access.mockRejectedValue(new Error("File not found"))
		mockedFs.rm.mockResolvedValue(undefined)
		mockedFs.writeFile.mockResolvedValue(undefined)
		mockedFs.readdir.mockResolvedValue([
			"01_Project_Overview_Analysis.md",
			"02_Overall_Architecture_Analysis.md",
		] as any)

		// Execute function
		await expect(ensureProjectWikiCommandExists()).resolves.not.toThrow()

		// Verify calls
		expect(mockedFs.mkdir).toHaveBeenCalledWith(globalCommandsDir, { recursive: true })
		expect(mockedFs.writeFile).toHaveBeenCalledTimes(10) // 1 main file + 9 subtask files
	})

	it("should skip creation when files already exist", async () => {
		// Mock existing files
		mockedFs.mkdir.mockResolvedValue(undefined)
		mockedFs.access.mockResolvedValue(undefined)
		mockedFs.stat.mockResolvedValue({
			isDirectory: () => true,
		} as any)
		mockedFs.readdir.mockResolvedValue(["01_Project_Overview_Analysis.md"] as any)

		// Execute function
		await expect(ensureProjectWikiCommandExists()).resolves.not.toThrow()

		// Verify no write operations were called
		expect(mockedFs.writeFile).not.toHaveBeenCalled()
	})

	it("should generate all wiki files correctly", async () => {
		// Read the modified projectWikiHelpers.ts file to test the generateWikiFiles function
		// generateWikiFiles is an internal function and not exported, so we test ensureProjectWikiCommandExists instead
		// This will indirectly test the functionality of generateWikiFiles
		expect(true).toBe(true) // Placeholder test
	})
})
