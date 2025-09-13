import * as vscode from "vscode"
import * as path from "path"
import { EventEmitter } from "events"
import { simpleGit, SimpleGit } from "simple-git"
import { ILogger } from "../../../utils/logger"
import ZgsmCodebaseIndexManager from "."

export interface CheckoutEvent {
	oldBranch: string | undefined
	newBranch: string
}

export class GitCheckoutDetector extends EventEmitter {
	private git: SimpleGit
	private lastBranch: string | undefined
	// Debounce timestamp
	private lastEmit?: NodeJS.Timeout

	constructor(private repoRoot: string) {
		super()
		this.git = simpleGit(repoRoot)
		this.init()
	}

	/** Returns absolute path of .git/HEAD */
	get headPath(): string {
		return path.join(this.repoRoot, ".git", "HEAD")
	}

	/** Initialize: read current branch */
	private async init(): Promise<void> {
		try {
			this.lastBranch = await this.currentBranch()
		} catch {
			/* ignore */
		}
	}

	/** Exposed externally: trigger 'checkout' event when checkout is detected */
	async onHeadChanged(): Promise<void> {
		clearTimeout(this.lastEmit)

		this.lastEmit = setTimeout(async () => {
			try {
				const newBranch = await this.currentBranch()
				// Verify: must be a local branch
				if (!newBranch || !newBranch.startsWith("refs/heads/")) return

				const branchName = newBranch.replace("refs/heads/", "")
				if (branchName === this.lastBranch?.replace("refs/heads/", "")) return // Unchanged

				const event: CheckoutEvent = {
					oldBranch: this.lastBranch,
					newBranch: branchName,
				}
				this.lastBranch = branchName
				this.emit("checkout", event)
			} catch {
				/* Silently ignore when reading fails */
			}
		}, 1000)
	}

	/** Get current local branch ref; returns undefined on failure */
	private async currentBranch(): Promise<string | undefined> {
		try {
			// 1. First try to get local branch ref
			const ref = (await this.git.raw(["symbolic-ref", "HEAD"])).trim()
			return ref // e.g. refs/heads/main
		} catch {
			// 2. Failure may indicate detached HEAD, use short hash as name
			try {
				const sha = (await this.git.revparse(["--short", "HEAD"])).trim()
				return sha // e.g. a1b2c3d
			} catch {
				return undefined
			}
		}
	}
}

export function initGitCheckoutDetector(context: vscode.ExtensionContext, logger: ILogger) {
	const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
	if (!root) return

	const detector = new GitCheckoutDetector(root)

	// Use VS Code's watcher to monitor .git/HEAD
	const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(root, ".git/HEAD"))
	watcher.onDidCreate(() => detector.onHeadChanged())
	watcher.onDidChange(() => detector.onHeadChanged())

	// Show notification after receiving event
	detector?.on("checkout", async ({ oldBranch, newBranch }) => {
		oldBranch = oldBranch?.replace("refs/heads/", "")
		// newBranch
		try {
			const zgsmCodebaseIndexManager = ZgsmCodebaseIndexManager.getInstance()

			// Get workspace path
			const result = await zgsmCodebaseIndexManager.publishWorkspaceEvents({
				workspace: root,
				data: [
					{
						eventType: "open_workspace",
						eventTime: `${Date.now()}`,
						sourcePath: "",
						targetPath: "",
					},
				],
			})

			if (result.success) {
				vscode.window.showInformationMessage(`Branch switched: ${oldBranch ?? "(unknown)"} → ${newBranch}`)
				logger.info(`[GitCheckoutDetector:${oldBranch} -> ${newBranch}] Successfully open_workspace event`)
			} else {
				logger.error(
					`[GitCheckoutDetector:${oldBranch} -> ${newBranch}] Failed to open_workspace event: ${result.message}`,
				)
			}
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Unknown error occurred while open_workspace event"
			logger.error(`[GitCheckoutDetector:${oldBranch} -> ${newBranch}] ${errorMessage}`)
		}
	})

	context.subscriptions.push(watcher)
}
