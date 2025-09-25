import pWaitFor from "p-wait-for"
import * as vscode from "vscode"

import { TelemetryService } from "@roo-code/telemetry"

import { Task } from "../task/Task"

import { getWorkspacePath } from "../../utils/path"
import { checkGitInstalled } from "../../utils/git"
import { t } from "../../i18n"

import { ClineApiReqInfo } from "../../shared/ExtensionMessage"
import { getApiMetrics } from "../../shared/getApiMetrics"

import { DIFF_VIEW_URI_SCHEME } from "../../integrations/editor/DiffViewProvider"

import { CheckpointServiceOptions, RepoPerTaskCheckpointService } from "../../services/checkpoints"
import { CospecMetadataManager } from "../costrict/workflow/CospecMetadataManager"
import * as path from "path"
import * as fs from "fs/promises"

/**
 */
async function updateCospecMetadataForCheckpoint(
	workspaceDir: string,
	taskId: string,
	checkpointId: string,
	checkpointService?: RepoPerTaskCheckpointService,
): Promise<void> {
	const cospecDirs = await findCospecDirectories(workspaceDir)

	console.log(`[updateCospecMetadataForCheckpoint] ?? ${cospecDirs.length} ? .cospec ??`)

	let changedFiles: Set<string> = new Set()
	if (checkpointService) {
		try {
			const diffs = await checkpointService.getDiff({ from: checkpointService.baseHash, to: checkpointId })
			changedFiles = new Set(diffs.map((diff: any) => diff.paths.relative))
		} catch (error) {
			changedFiles = new Set(["requirements.md", "design.md", "tasks.md"])
		}
	} else {
		changedFiles = new Set(["requirements.md", "design.md", "tasks.md"])
	}

	for (const cospecDir of cospecDirs) {
		try {
			const metadata = await CospecMetadataManager.getMetadataOrDefault(cospecDir)

			const fileTypes: Array<{ type: keyof typeof metadata; filename: string }> = [
				{ type: "design", filename: "design.md" },
				{ type: "requirements", filename: "requirements.md" },
				{ type: "tasks", filename: "tasks.md" },
			]

			let hasUpdates = false
			for (const { type, filename } of fileTypes) {
				const fileChanged = Array.from(changedFiles).some(
					(changedFile) =>
						changedFile.endsWith(filename) ||
						(changedFile.includes(`/.cospec/`) && changedFile.endsWith(filename)),
				)

				if (fileChanged && metadata[type]) {
					metadata[type]!.lastTaskId = taskId
					metadata[type]!.lastCheckpointId = checkpointId
					hasUpdates = true
				}
			}

			if (hasUpdates) {
				await CospecMetadataManager.writeMetadata(cospecDir, metadata)
			} else {
			}
		} catch (error) {}
	}
}

/**
 */
async function findCospecDirectories(workspaceDir: string): Promise<string[]> {
	const cospecDirs: string[] = []

	async function searchDirectory(dir: string, depth = 0): Promise<void> {
		if (depth > 5) return

		try {
			const entries = await fs.readdir(dir, { withFileTypes: true })

			for (const entry of entries) {
				if (entry.isDirectory()) {
					const fullPath = path.join(dir, entry.name)

					if (entry.name === ".cospec") {
						await searchCospecSubdirectories(fullPath)
					} else if (!entry.name.startsWith(".") && !entry.name.includes("node_modules")) {
						await searchDirectory(fullPath, depth + 1)
					}
				}
			}
		} catch (error) {}
	}

	/**
	 */
	async function searchCospecSubdirectories(cospecDir: string): Promise<void> {
		try {
			const supportedFiles = ["requirements.md", "design.md", "tasks.md"]
			let hasRootFiles = false

			for (const fileName of supportedFiles) {
				const filePath = path.join(cospecDir, fileName)
				try {
					await fs.access(filePath)
					hasRootFiles = true
					break
				} catch {}
			}

			if (hasRootFiles) {
				cospecDirs.push(cospecDir)
			}

			const entries = await fs.readdir(cospecDir, { withFileTypes: true })

			for (const entry of entries) {
				if (entry.isDirectory() && !entry.name.startsWith(".")) {
					const subDir = path.join(cospecDir, entry.name)

					let hasWorkflowFiles = false
					for (const fileName of supportedFiles) {
						const filePath = path.join(subDir, fileName)
						try {
							await fs.access(filePath)
							hasWorkflowFiles = true
							break
						} catch {}
					}

					if (hasWorkflowFiles) {
						cospecDirs.push(subDir)
					}

					await searchCospecSubdirectories(subDir)
				}
			}
		} catch (error) {}
	}

	await searchDirectory(workspaceDir)
	return cospecDirs
}

export async function getCheckpointService(
	task: Task,
	{ interval = 250, timeout = 15_000 }: { interval?: number; timeout?: number } = {},
) {
	if (!task.enableCheckpoints) {
		return undefined
	}

	if (task.checkpointService) {
		return task.checkpointService
	}

	const provider = task.providerRef.deref()

	const log = (message: string) => {
		console.log(message)

		try {
			provider?.log(message)
		} catch (err) {
			// NO-OP
		}
	}

	console.log("[Task#getCheckpointService] initializing checkpoints service")

	try {
		const workspaceDir = task.cwd || getWorkspacePath()

		if (!workspaceDir) {
			log("[Task#getCheckpointService] workspace folder not found, disabling checkpoints")
			task.enableCheckpoints = false
			return undefined
		}

		const globalStorageDir = provider?.context.globalStorageUri.fsPath

		if (!globalStorageDir) {
			log("[Task#getCheckpointService] globalStorageDir not found, disabling checkpoints")
			task.enableCheckpoints = false
			return undefined
		}

		const options: CheckpointServiceOptions = {
			taskId: task.taskId,
			workspaceDir,
			shadowDir: globalStorageDir,
			log,
		}

		if (task.checkpointServiceInitializing) {
			await pWaitFor(
				() => {
					console.log("[Task#getCheckpointService] waiting for service to initialize")
					return !!task.checkpointService && !!task?.checkpointService?.isInitialized
				},
				{ interval, timeout },
			)
			if (!task?.checkpointService) {
				task.enableCheckpoints = false
				return undefined
			}
			return task.checkpointService
		}

		if (!task.enableCheckpoints) {
			return undefined
		}

		const service = RepoPerTaskCheckpointService.create(options)
		task.checkpointServiceInitializing = true
		await checkGitInstallation(task, service, log, provider)
		task.checkpointService = service
		return service
	} catch (err) {
		log(`[Task#getCheckpointService] ${err.message}`)
		task.enableCheckpoints = false
		task.checkpointServiceInitializing = false
		return undefined
	}
}

async function checkGitInstallation(
	task: Task,
	service: RepoPerTaskCheckpointService,
	log: (message: string) => void,
	provider: any,
) {
	try {
		const gitInstalled = await checkGitInstalled()

		if (!gitInstalled) {
			log("[Task#getCheckpointService] Git is not installed, disabling checkpoints")
			task.enableCheckpoints = false
			task.checkpointServiceInitializing = false

			// Show user-friendly notification
			const selection = await vscode.window.showWarningMessage(
				t("common:errors.git_not_installed"),
				t("common:buttons.learn_more"),
			)

			if (selection === t("common:buttons.learn_more")) {
				await vscode.env.openExternal(vscode.Uri.parse("https://git-scm.com/downloads"))
			}

			return
		}

		// Git is installed, proceed with initialization
		service.on("initialize", () => {
			log("[Task#getCheckpointService] service initialized")
			task.checkpointServiceInitializing = false
		})

		service.on("checkpoint", ({ fromHash: from, toHash: to, suppressMessage }) => {
			try {
				// Always update the current checkpoint hash in the webview, including the suppress flag
				provider?.postMessageToWebview({
					type: "currentCheckpointUpdated",
					text: to,
					suppressMessage: !!suppressMessage,
				})

				// Always create the chat message but include the suppress flag in the payload
				// so the chatview can choose not to render it while keeping it in history.
				task.say(
					"checkpoint_saved",
					to,
					undefined,
					undefined,
					{ from, to, suppressMessage: !!suppressMessage },
					undefined,
					{ isNonInteractive: true },
				).catch((err) => {
					log("[Task#getCheckpointService] caught unexpected error in say('checkpoint_saved')")
					console.error(err)
				})
			} catch (err) {
				log("[Task#getCheckpointService] caught unexpected error in on('checkpoint'), disabling checkpoints")
				console.error(err)
				task.enableCheckpoints = false
			}
		})

		log("[Task#getCheckpointService] initializing shadow git")

		try {
			await service.initShadowGit()
		} catch (err) {
			log(`[Task#getCheckpointService] initShadowGit -> ${err.message}`)
			task.enableCheckpoints = false
		}
	} catch (err) {
		log(`[Task#getCheckpointService] Unexpected error during Git check: ${err.message}`)
		console.error("Git check error:", err)
		task.enableCheckpoints = false
		task.checkpointServiceInitializing = false
	}
}

export async function checkpointSave(task: Task, force = false, suppressMessage = false) {
	const service = await getCheckpointService(task)

	if (!service) {
		return
	}

	TelemetryService.instance.captureCheckpointCreated(task.taskId)

	// Start the checkpoint process in the background.
	const checkpointResult = service
		.saveCheckpoint(`Task: ${task.taskId}, Time: ${Date.now()}`, { allowEmpty: force, suppressMessage })
		.then(async (result) => {
			if (result && result.commit) {
				try {
					const workspaceDir = task.cwd || getWorkspacePath()
					if (workspaceDir) {
						await updateCospecMetadataForCheckpoint(workspaceDir, task.taskId, result.commit, service)
					}
				} catch (error) {
					console.error(
						"[Task#updateCospecMetadataForCheckpoint] caught unexpected error, disabling checkpoints",
						error,
					)
				}
			}
			return result
		})
		.catch((err) => {
			console.error("[Task#checkpointSave] caught unexpected error, disabling checkpoints", err)
			task.enableCheckpoints = false
		})

	return checkpointResult
}

export type CheckpointRestoreOptions = {
	ts: number
	commitHash: string
	mode: "preview" | "restore"
	operation?: "delete" | "edit" // Optional to maintain backward compatibility
}

export async function checkpointRestore(
	task: Task,
	{ ts, commitHash, mode, operation = "delete" }: CheckpointRestoreOptions,
) {
	const service = await getCheckpointService(task)

	if (!service) {
		return
	}

	const index = task.clineMessages.findIndex((m) => m.ts === ts)

	if (index === -1) {
		return
	}

	const provider = task.providerRef.deref()

	try {
		await service.restoreCheckpoint(commitHash)
		TelemetryService.instance.captureCheckpointRestored(task.taskId)
		await provider?.postMessageToWebview({ type: "currentCheckpointUpdated", text: commitHash })

		if (mode === "restore") {
			await task.overwriteApiConversationHistory(task.apiConversationHistory.filter((m) => !m.ts || m.ts < ts))

			const deletedMessages = task.clineMessages.slice(index + 1)

			const { totalTokensIn, totalTokensOut, totalCacheWrites, totalCacheReads, totalCost } = getApiMetrics(
				task.combineMessages(deletedMessages),
			)

			// For delete operations, exclude the checkpoint message itself
			// For edit operations, include the checkpoint message (to be edited)
			const endIndex = operation === "edit" ? index + 1 : index
			await task.overwriteClineMessages(task.clineMessages.slice(0, endIndex))

			// TODO: Verify that this is working as expected.
			await task.say(
				"api_req_deleted",
				JSON.stringify({
					tokensIn: totalTokensIn,
					tokensOut: totalTokensOut,
					cacheWrites: totalCacheWrites,
					cacheReads: totalCacheReads,
					cost: totalCost,
				} satisfies ClineApiReqInfo),
			)
		}

		// The task is already cancelled by the provider beforehand, but we
		// need to re-init to get the updated messages.
		//
		// This was taken from Cline's implementation of the checkpoints
		// feature. The task instance will hang if we don't cancel twice,
		// so this is currently necessary, but it seems like a complicated
		// and hacky solution to a problem that I don't fully understand.
		// I'd like to revisit this in the future and try to improve the
		// task flow and the communication between the webview and the
		// `Task` instance.
		provider?.cancelTask()
	} catch (err) {
		provider?.log("[checkpointRestore] disabling checkpoints for this task")
		task.enableCheckpoints = false
	}
}

export type CheckpointDiffOptions = {
	ts: number
	previousCommitHash?: string
	commitHash: string
	mode: "full" | "checkpoint"
}

export async function checkpointDiff(task: Task, { ts, previousCommitHash, commitHash, mode }: CheckpointDiffOptions) {
	const service = await getCheckpointService(task)

	if (!service) {
		return
	}

	TelemetryService.instance.captureCheckpointDiffed(task.taskId)

	let prevHash = commitHash
	let nextHash: string | undefined = undefined

	if (mode !== "full") {
		const checkpoints = task.clineMessages.filter(({ say }) => say === "checkpoint_saved").map(({ text }) => text!)
		const idx = checkpoints.indexOf(commitHash)
		if (idx !== -1 && idx < checkpoints.length - 1) {
			nextHash = checkpoints[idx + 1]
		} else {
			nextHash = undefined
		}
	}

	try {
		const changes = await service.getDiff({ from: prevHash, to: nextHash })

		if (!changes?.length) {
			vscode.window.showInformationMessage("No changes found.")
			return
		}

		await vscode.commands.executeCommand(
			"vscode.changes",
			mode === "full" ? "Changes since task started" : "Changes compare with next checkpoint",
			changes.map((change) => [
				vscode.Uri.file(change.paths.absolute),
				vscode.Uri.parse(`${DIFF_VIEW_URI_SCHEME}:${change.paths.relative}`).with({
					query: Buffer.from(change.content.before ?? "").toString("base64"),
				}),
				vscode.Uri.parse(`${DIFF_VIEW_URI_SCHEME}:${change.paths.relative}`).with({
					query: Buffer.from(change.content.after ?? "").toString("base64"),
				}),
			]),
		)
	} catch (err) {
		const provider = task.providerRef.deref()
		provider?.log("[checkpointDiff] disabling checkpoints for this task")
		task.enableCheckpoints = false
	}
}
