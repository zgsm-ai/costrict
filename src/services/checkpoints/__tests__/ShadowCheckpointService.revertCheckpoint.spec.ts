// npx vitest run src/services/checkpoints/__tests__/ShadowCheckpointService.revertCheckpoint.spec.ts

import fs from "fs/promises"
import path from "path"
import os from "os"

import { simpleGit, SimpleGit } from "simple-git"

import { RepoPerTaskCheckpointService } from "../RepoPerTaskCheckpointService"

function extractHash(str: string | undefined): string | undefined {
	if (!str) return str
	const match = str.match(/[a-f0-9]{40}/)
	return match ? match[0] : str
}

const tmpDir = path.join(os.tmpdir(), "CheckpointServiceRevert")

const initWorkspaceRepo = async ({
	workspaceDir,
	userName = "CoStrict",
	userEmail = "zgsm@sangfor.com.cn",
	testFileName = "test.txt",
	textFileContent = "Hello, world!",
}: {
	workspaceDir: string
	userName?: string
	userEmail?: string
	testFileName?: string
	textFileContent?: string
}) => {
	// Create a temporary directory for testing.
	await fs.mkdir(workspaceDir, { recursive: true })

	// Initialize git repo.
	const git = simpleGit(workspaceDir)
	await git.init()
	await git.addConfig("user.name", userName)
	await git.addConfig("user.email", userEmail)

	// Create test file.
	const testFile = path.join(workspaceDir, testFileName)
	await fs.writeFile(testFile, textFileContent)

	// Create initial commit.
	await git.add(".")
	const commitResult = await git.commit("Initial commit")
	if (!commitResult) {
		throw new Error("Failed to create initial commit")
	}

	return { git, testFile, workspaceDir }
}

describe("RepoPerTaskCheckpointService#revertCheckpoint", () => {
	const taskId = "test-task-revert"

	let shadowDir: string
	let workspaceDir: string
	let workspaceGit: SimpleGit
	let testFile: string
	let service: RepoPerTaskCheckpointService

	beforeEach(async () => {
		const prefix = "RepoPerTaskCheckpointService"
		shadowDir = path.join(tmpDir, `${prefix}-${Date.now()}`)
		workspaceDir = path.join(tmpDir, `workspace-revert-${Date.now()}`)
		const repo = await initWorkspaceRepo({ workspaceDir })

		workspaceGit = repo.git
		testFile = repo.testFile

		service = await RepoPerTaskCheckpointService.create({ taskId, shadowDir, workspaceDir, log: () => {} })
		await service.initShadowGit()
	})

	afterEach(async () => {
		vitest.restoreAllMocks()
	})

	afterAll(async () => {
		await fs.rm(tmpDir, { recursive: true, force: true })
	}, 60000) // 60 second timeout for Windows cleanup

	it("creates a revert commit to undo a previous checkpoint", async () => {
		// Create initial file and checkpoint
		await fs.writeFile(testFile, "Initial content")
		const initialCommit = await service.saveCheckpoint("Initial checkpoint")
		expect(initialCommit?.commit).toBeTruthy()

		// Modify the file and create second checkpoint
		await fs.writeFile(testFile, "Modified content")
		const secondCommit = await service.saveCheckpoint("Second checkpoint")
		expect(secondCommit?.commit).toBeTruthy()

		// Revert the second checkpoint
		const revertCommitHash = await service.revertCheckpoint(extractHash(secondCommit!.commit)!)
		expect(revertCommitHash).toBeTruthy()

		// Verify the file content was reverted
		expect(await fs.readFile(testFile, "utf-8")).toBe("Initial content")

		// Verify the revert commit is different from original commits
		expect(revertCommitHash).not.toBe(extractHash(secondCommit!.commit)!)
		expect(revertCommitHash).not.toBe(extractHash(initialCommit!.commit)!)
	})

	it("throws error when reverting an invalid commit hash", async () => {
		const invalidCommitHash = "invalid-commit-hash-12345"

		await expect(service.revertCheckpoint(invalidCommitHash)).rejects.toThrow(
			`Commit ${invalidCommitHash} does not exist in the checkpoint history`,
		)
	})

	it("emits revert event with correct payload", async () => {
		// Create initial checkpoint
		await fs.writeFile(testFile, "Content for revert test")
		const commit = await service.saveCheckpoint("Checkpoint for revert test")
		expect(commit?.commit).toBeTruthy()

		// Modify and create second checkpoint
		await fs.writeFile(testFile, "Changed after checkpoint")
		const secondCommit = await service.saveCheckpoint("Second checkpoint")
		expect(secondCommit?.commit).toBeTruthy()

		// Setup revert event listener
		const revertHandler = vitest.fn()
		service.on("revert", revertHandler)

		// Revert the second checkpoint
		const revertCommitHash = await service.revertCheckpoint(extractHash(secondCommit!.commit)!)

		// Verify the event was emitted
		expect(revertHandler).toHaveBeenCalledTimes(1)
		const eventData = revertHandler.mock.calls[0][0]
		expect(eventData.type).toBe("revert")
		expect(eventData.newCommitHash).toBe(revertCommitHash)
		expect(typeof eventData.duration).toBe("number")
	})

	it("preserves git history when reverting a checkpoint", async () => {
		// Create initial checkpoint
		await fs.writeFile(testFile, "First content")
		const firstCommit = await service.saveCheckpoint("First checkpoint")
		expect(firstCommit?.commit).toBeTruthy()

		// Create second checkpoint
		await fs.writeFile(testFile, "Second content")
		const secondCommit = await service.saveCheckpoint("Second checkpoint")
		expect(secondCommit?.commit).toBeTruthy()

		// Revert the second checkpoint
		const revertCommitHash = await service.revertCheckpoint(extractHash(secondCommit!.commit)!)

		// Verify all commits are in the history
		const checkpoints = service.getCheckpoints()
		expect(checkpoints).toHaveLength(3)
		expect(checkpoints).toContain(extractHash(firstCommit!.commit)!)
		expect(checkpoints).toContain(extractHash(secondCommit!.commit)!)
		expect(checkpoints).toContain(revertCommitHash)
	})

	it("handles multiple file revert correctly", async () => {
		// Create multiple files
		const testFile2 = path.join(workspaceDir, "test2.txt")
		const testFile3 = path.join(workspaceDir, "test3.txt")
		await fs.writeFile(testFile, "File 1 initial")
		await fs.writeFile(testFile2, "File 2 initial")
		await fs.writeFile(testFile3, "File 3 initial")

		// Create initial checkpoint
		const firstCommit = await service.saveCheckpoint("Initial multi-file checkpoint")
		expect(firstCommit?.commit).toBeTruthy()

		// Modify all files
		await fs.writeFile(testFile, "File 1 modified")
		await fs.writeFile(testFile2, "File 2 modified")
		await fs.writeFile(testFile3, "File 3 modified")

		// Create second checkpoint with modifications
		const secondCommit = await service.saveCheckpoint("Modified multi-file checkpoint")
		expect(secondCommit?.commit).toBeTruthy()

		// Revert the second checkpoint
		await service.revertCheckpoint(extractHash(secondCommit!.commit)!)

		// Verify all files were reverted
		expect(await fs.readFile(testFile, "utf-8")).toBe("File 1 initial")
		expect(await fs.readFile(testFile2, "utf-8")).toBe("File 2 initial")
		expect(await fs.readFile(testFile3, "utf-8")).toBe("File 3 initial")
	})

	it("handles empty revert correctly (no-op)", async () => {
		// Create initial file
		await fs.writeFile(testFile, "Initial content")
		const firstCommit = await service.saveCheckpoint("First checkpoint")
		expect(firstCommit?.commit).toBeTruthy()

		// Modify and create second checkpoint
		await fs.writeFile(testFile, "Second content")
		const secondCommit = await service.saveCheckpoint("Second checkpoint")
		expect(secondCommit?.commit).toBeTruthy()

		// Revert to create a third checkpoint (undoing second)
		const revertCommit1 = await service.revertCheckpoint(extractHash(secondCommit!.commit)!)
		expect(revertCommit1).toBeTruthy()

		// Create a fourth checkpoint with same content as initial
		await fs.writeFile(testFile, "New content")
		const thirdCommit = await service.saveCheckpoint("Third checkpoint")
		expect(thirdCommit?.commit).toBeTruthy()

		// Verify file content is correct
		expect(await fs.readFile(testFile, "utf-8")).toBe("New content")

		// Verify all checkpoints are in history
		const checkpoints = service.getCheckpoints()
		expect(checkpoints).toHaveLength(4)
	})

	it("emits error event when revert fails", async () => {
		const errorHandler = vitest.fn()
		service.on("error", errorHandler)

		// Try to revert an invalid checkpoint
		const invalidCommitHash = "invalid-commit-hash"
		try {
			await service.revertCheckpoint(invalidCommitHash)
		} catch (error) {
			// Expected to throw, we're testing the event emission
		}

		// Verify the error event was emitted
		expect(errorHandler).toHaveBeenCalledTimes(1)
		const eventData = errorHandler.mock.calls[0][0]
		expect(eventData.type).toBe("error")
		expect(eventData.error).toBeInstanceOf(Error)
	})
})
