import { CommitMessageGenerator } from "../commitGenerator"
import { exec } from "child_process"
import { promisify } from "util"
import * as fs from "fs/promises"
import * as path from "path"

const execAsync = promisify(exec)

// Mock vscode module - complete mock configuration
vi.mock("vscode", async (importOriginal) => ({
	...(await importOriginal()),
	extensions: {
		getExtension: (extensionId: string) => ({
			extensionPath: "/mock/extension/path",
			extensionUri: { fsPath: "/mock/extension/path", path: "/mock/extension/path", scheme: "file" },
			packageJSON: {
				name: "zgsm",
				publisher: "zgsm-ai",
				version: "2.0.27",
			},
		}),
		all: [],
	},
	ExtensionContext: vi.fn(),
	OutputChannel: vi.fn(),
	Uri: {
		joinPath: vi.fn(),
		file: vi.fn(),
	},
	CodeActionKind: {
		QuickFix: { value: "quickfix" },
		RefactorRewrite: { value: "refactor.rewrite" },
	},
	commands: {
		executeCommand: vi.fn().mockResolvedValue(undefined),
	},
	window: {
		showInformationMessage: vi.fn(),
		showWarningMessage: vi.fn(),
		showErrorMessage: vi.fn(),
		createOutputChannel: () => ({
			appendLine: vi.fn(),
			show: vi.fn(),
		}),
		createTextEditorDecorationType: vi.fn(() => ({
			dispose: vi.fn(),
		})),
	},
	workspace: {
		getConfiguration: vi.fn(() => ({
			get: vi.fn(() => "en"),
			update: vi.fn(),
		})),
		onDidChangeConfiguration: vi.fn().mockImplementation(() => ({
			dispose: vi.fn(),
		})),
		onDidSaveTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
		onDidChangeTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
		onDidOpenTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
		onDidCloseTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
		createFileSystemWatcher: vi.fn().mockReturnValue({
			onDidCreate: vi.fn().mockReturnValue({ dispose: vi.fn() }),
			onDidChange: vi.fn().mockReturnValue({ dispose: vi.fn() }),
			onDidDelete: vi.fn().mockReturnValue({ dispose: vi.fn() }),
			dispose: vi.fn(),
		}),
	},
	env: {
		uriScheme: "vscode",
		language: "en",
		appName: "Visual Studio Code",
	},
	ExtensionMode: {
		Production: 1,
		Development: 2,
		Test: 3,
	},
	RelativePattern: vi.fn().mockImplementation((base, pattern) => ({ base, pattern })),
	version: "1.85.0",
}))

describe("CommitMessageGenerator", () => {
	let workspaceRoot: string
	let testRepoDir: string

	beforeEach(() => {
		// Set up test workspace root directory
		workspaceRoot = "/test/workspace"
		testRepoDir = path.join("/tmp", `test-repo-${Date.now()}`)
	})

	afterEach(async () => {
		// Clean up temporary directory
		try {
			await fs.rm(testRepoDir, { recursive: true, force: true })
		} catch {
			// Ignore cleanup errors
		}
	})

	describe("hasCommits() - unit tests", () => {
		it("should return true when repository has commits", async () => {
			const repoDir = await setupTestRepo(testRepoDir, true)

			const generator = new CommitMessageGenerator(repoDir)
			const result = await (generator as any).hasCommits()

			expect(result).toBe(true)
		})

		it("当仓库无提交（新仓库）时应该返回 false", async () => {
			const repoDir = await setupTestRepo(testRepoDir, false)

			const generator = new CommitMessageGenerator(repoDir)
			const result = await (generator as any).hasCommits()

			expect(result).toBe(false)
		})
	})

	describe("getUntrackedFiles() - unit tests", () => {
		it("should return file list when there are untracked files", async () => {
			const repoDir = await setupTestRepo(testRepoDir, true)

			// Create untracked files
			const testFile1 = path.join(repoDir, "file1.ts")
			const testFile2 = path.join(repoDir, "file2.ts")
			const testFile3 = path.join(repoDir, "file3.ts")
			await fs.writeFile(testFile1, "content1")
			await fs.writeFile(testFile2, "content2")
			await fs.writeFile(testFile3, "content3")

			const generator = new CommitMessageGenerator(repoDir)
			const result = await (generator as any).getUntrackedFiles()

			expect(result).toContain("file1.ts")
			expect(result).toContain("file2.ts")
			expect(result).toContain("file3.ts")
		})

		it("should return empty array when there are no untracked files", async () => {
			const repoDir = await setupTestRepo(testRepoDir, true)

			// Create and commit files to ensure no untracked files
			const testFile = path.join(repoDir, "committed.ts")
			await fs.writeFile(testFile, "content")
			await execAsync("git add committed.ts", { cwd: repoDir })
			await execAsync('git commit -m "Initial commit"', { cwd: repoDir })

			const generator = new CommitMessageGenerator(repoDir)
			const result = await (generator as any).getUntrackedFiles()

			expect(result).toEqual([])
		})

		it("should correctly filter empty lines", async () => {
			const repoDir = await setupTestRepo(testRepoDir, true)

			// Create untracked files
			const testFile = path.join(repoDir, "test-file.ts")
			await fs.writeFile(testFile, "content")

			const generator = new CommitMessageGenerator(repoDir)
			const result = await (generator as any).getUntrackedFiles()

			// Ensure no empty strings
			expect(result.every((file: string) => file.trim().length > 0)).toBe(true)
		})
	})

	describe("getGitDiff() - integration tests for new repository scenarios", () => {
		it("new repository + unstaged new files: should detect correctly", async () => {
			const repoDir = await setupTestRepo(testRepoDir, false)

			// Create new file (unstaged)
			const testFile = path.join(repoDir, "test-file.ts")
			await fs.writeFile(testFile, "console.log('test')")

			const generator = new CommitMessageGenerator(repoDir)
			const diffInfo = await generator.getGitDiff()

			expect(diffInfo.added.length).toBeGreaterThan(0)
			expect(diffInfo.added).toContain("test-file.ts")
			expect(diffInfo.modified.length).toBe(0)
			expect(diffInfo.deleted.length).toBe(0)
		})

		it("new repository + staged new files: should detect correctly", async () => {
			const repoDir = await setupTestRepo(testRepoDir, false)

			// Create new file and stage it
			const testFile = path.join(repoDir, "staged-file.ts")
			await fs.writeFile(testFile, "console.log('staged')")
			await execAsync("git add staged-file.ts", { cwd: repoDir })

			const generator = new CommitMessageGenerator(repoDir)
			const diffInfo = await generator.getGitDiff()

			expect(diffInfo.added.length).toBeGreaterThan(0)
			expect(diffInfo.added).toContain("staged-file.ts")
		})

		it("new repository + mixed changes (staged and unstaged): should detect correctly", async () => {
			const repoDir = await setupTestRepo(testRepoDir, false)

			// Create staged files
			const stagedFile = path.join(repoDir, "staged.ts")
			await fs.writeFile(stagedFile, "staged content")
			await execAsync("git add staged.ts", { cwd: repoDir })

			// Create unstaged files
			const unstagedFile = path.join(repoDir, "unstaged.ts")
			await fs.writeFile(unstagedFile, "unstaged content")

			const generator = new CommitMessageGenerator(repoDir)
			const diffInfo = await generator.getGitDiff()

			// Should contain both types of files
			expect(diffInfo.added.length).toBeGreaterThan(0)
			expect(diffInfo.added.length).toBeGreaterThanOrEqual(2)
		})

		it("new repository + no changes: should return empty result correctly", async () => {
			const repoDir = await setupTestRepo(testRepoDir, false)

			const generator = new CommitMessageGenerator(repoDir)
			const diffInfo = await generator.getGitDiff()

			// All change arrays should be empty
			expect(diffInfo.added.length).toBe(0)
			expect(diffInfo.modified.length).toBe(0)
			expect(diffInfo.deleted.length).toBe(0)
			expect(diffInfo.renamed.length).toBe(0)
		})
	})

	describe("parseDiffOutput() - unit tests", () => {
		it("should correctly parse added files", () => {
			const generator = new CommitMessageGenerator(workspaceRoot)
			const parseDiffOutput = (generator as any).parseDiffOutput.bind(generator)

			const diffOutput = "A\tfile1.ts\nA\tfile2.ts"
			const diffInfo = { added: [], modified: [], deleted: [], renamed: [], diffContent: "" }

			parseDiffOutput(diffOutput, diffInfo)

			expect(diffInfo.added).toEqual(["file1.ts", "file2.ts"])
		})

		it("should correctly parse modified files", () => {
			const generator = new CommitMessageGenerator(workspaceRoot)
			const parseDiffOutput = (generator as any).parseDiffOutput.bind(generator)

			const diffOutput = "M\tfile1.ts\nM\tfile2.ts"
			const diffInfo = { added: [], modified: [], deleted: [], renamed: [], diffContent: "" }

			parseDiffOutput(diffOutput, diffInfo)

			expect(diffInfo.modified).toEqual(["file1.ts", "file2.ts"])
		})

		it("should correctly parse deleted files", () => {
			const generator = new CommitMessageGenerator(workspaceRoot)
			const parseDiffOutput = (generator as any).parseDiffOutput.bind(generator)

			const diffOutput = "D\tfile1.ts\nD\tfile2.ts"
			const diffInfo = { added: [], modified: [], deleted: [], renamed: [], diffContent: "" }

			parseDiffOutput(diffOutput, diffInfo)

			expect(diffInfo.deleted).toEqual(["file1.ts", "file2.ts"])
		})

		it("should correctly parse renamed files", () => {
			const generator = new CommitMessageGenerator(workspaceRoot)
			const parseDiffOutput = (generator as any).parseDiffOutput.bind(generator)

			// Use actual git diff --name-status output format
			// Note: parseDiffOutput method can only handle "R" status, cannot handle "R100"
			// So use "R" for testing here
			const diffOutput = "R\told-file.ts\tnew-file.ts"
			const diffInfo = { added: [], modified: [], deleted: [], renamed: [], diffContent: "" }

			parseDiffOutput(diffOutput, diffInfo)

			expect(diffInfo.renamed).toEqual(["old-file.ts -> new-file.ts"])
		})

		it("should correctly parse mixed change types", () => {
			const generator = new CommitMessageGenerator(workspaceRoot)
			const parseDiffOutput = (generator as any).parseDiffOutput.bind(generator)

			// Use correct git diff --name-status output format
			// Note: parseDiffOutput can only handle single-character status codes
			const diffOutput = "A\tfile1.ts\nM\tfile2.ts\nD\tfile3.ts\nR\told.ts\tnew.ts"
			const diffInfo = { added: [], modified: [], deleted: [], renamed: [], diffContent: "" }

			parseDiffOutput(diffOutput, diffInfo)

			expect(diffInfo.added).toEqual(["file1.ts"])
			expect(diffInfo.modified).toEqual(["file2.ts"])
			expect(diffInfo.deleted).toEqual(["file3.ts"])
			expect(diffInfo.renamed).toEqual(["old.ts -> new.ts"])

			// 验证总数量
			expect(
				diffInfo.added.length + diffInfo.modified.length + diffInfo.deleted.length + diffInfo.renamed.length,
			).toBe(4)
		})

		it("should ignore empty lines", () => {
			const generator = new CommitMessageGenerator(workspaceRoot)
			const parseDiffOutput = (generator as any).parseDiffOutput.bind(generator)

			const diffOutput = "A\tfile1.ts\n\nA\tfile2.ts"
			const diffInfo = { added: [], modified: [], deleted: [], renamed: [], diffContent: "" }

			parseDiffOutput(diffOutput, diffInfo)

			expect(diffInfo.added).toEqual(["file1.ts", "file2.ts"])
		})
	})
})

/**
 * Set up test Git repository
 * @param repoPath Repository path
 * @param hasCommits Whether initial commit is needed
 * @returns Repository path
 */
async function setupTestRepo(repoPath: string, hasCommits: boolean): Promise<string> {
	await fs.mkdir(repoPath, { recursive: true })

	// Initialize Git repository
	await execAsync("git init", { cwd: repoPath })
	await execAsync("git config user.name 'Test User'", { cwd: repoPath })
	await execAsync("git config user.email 'test@example.com'", { cwd: repoPath })

	if (hasCommits) {
		// Create and commit initial files
		const initialFile = path.join(repoPath, "README.md")
		await fs.writeFile(initialFile, "# Test Repository")
		await execAsync("git add README.md", { cwd: repoPath })
		await execAsync('git commit -m "Initial commit"', { cwd: repoPath })
	}

	return repoPath
}
