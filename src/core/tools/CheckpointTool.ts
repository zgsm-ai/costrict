import { Task } from "../task/Task"
import { BaseTool, ToolCallbacks } from "./BaseTool"
import type { ClineSayTool } from "@roo-code/types"

/**
 * Parameters for the checkpoint tool
 */
export interface CheckpointParams {
	action: "commit" | "list" | "show_diff" | "restore" | "revert"
	message?: string
	commit_hash?: string
	files?: string[]
}

/**
 * Tool description
 */
const DESCRIPTION = `Creates and manages snapshots of the project state using a shadow Git repository for safe experimentation and recovery.

## Actions

### commit
Creates a new checkpoint (snapshot) of the current project state.
- **Required**: \`message\` - A descriptive message for the checkpoint
- Returns: The commit hash of the new checkpoint

### list
Lists all available checkpoints in chronological order.
- Returns: A numbered list of checkpoint commit hashes

### show_diff
Shows the differences between the current state and a specific checkpoint.
- **Required**: \`commit_hash\` - The checkpoint to compare against
- Returns: Detailed diff showing what changed in each file

### restore
Restores the project to a specific checkpoint state (destructive operation).
- **Required**: \`commit_hash\` - The checkpoint to restore to
- **Optional**: \`files\` - Specific files to restore (if omitted, restores all files)
- Returns: Confirmation of restoration

### revert
Creates a new commit that undoes the changes from a specific checkpoint (non-destructive).
- **Required**: \`commit_hash\` - The checkpoint to revert
- Returns: The commit hash of the new revert commit

## Important Notes
- Checkpoint feature requires Git to be installed
- All checkpoints are stored in a shadow Git repository (separate from your project's Git)
- \`restore\` is destructive and will discard any uncommitted changes
- \`revert\` is safe and preserves history by creating a new commit`

/**
 * Checkpoint tool for creating and managing project snapshots
 */
export class CheckpointTool extends BaseTool<"costrict_checkpoint"> {
	readonly name = "costrict_checkpoint" as const

	async execute(params: CheckpointParams, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { action, message, commit_hash, files } = params
		const { askApproval, handleError, pushToolResult } = callbacks

		try {
			// Check if checkpoint service is available
			if (!task.enableCheckpoints || !task.checkpointService) {
				pushToolResult(
					"Checkpoint feature is unavailable. Git is required for this functionality.\n\nPlease install Git and restart the CLI to use checkpoint features.",
				)
				return
			}

			const checkpointService = task.checkpointService

			// Validate required parameters based on action
			if (action === "commit" && !message) {
				task.consecutiveMistakeCount++
				task.recordToolError("costrict_checkpoint")
				task.didToolFailInCurrentTurn = true
				pushToolResult("Error: 'message' parameter is required for commit action.")
				return
			}

			if ((action === "show_diff" || action === "restore" || action === "revert") && !commit_hash) {
				task.consecutiveMistakeCount++
				task.recordToolError("costrict_checkpoint")
				task.didToolFailInCurrentTurn = true
				pushToolResult(`Error: 'commit_hash' parameter is required for ${action} action.`)
				return
			}

			// Reset mistake count on valid input
			task.consecutiveMistakeCount = 0

			// Prepare the message for approval
			const sharedMessageProps: ClineSayTool = {
				tool: "costrict_checkpoint",
				content: JSON.stringify({ action, message, commit_hash, files }),
			}

			const completeMessage = JSON.stringify(sharedMessageProps)
			const didApprove = await askApproval("tool", completeMessage)

			if (!didApprove) {
				return
			}

			// Execute the requested action
			let result: string

			switch (action) {
				case "commit": {
					const commitResult = await checkpointService.saveCheckpoint(message!)
					if (commitResult && commitResult.commit) {
						result = `Checkpoint created successfully.\nCommit: ${commitResult.commit}`
					} else {
						result = "No changes to commit. Checkpoint was not created."
					}
					break
				}

				case "list": {
					const checkpoints = checkpointService.getCheckpoints()
					if (checkpoints.length === 0) {
						result = "No checkpoints found."
					} else {
						const listOutput = checkpoints.map((hash, index) => `${index + 1}. ${hash}`).join("\n")
						result = `Checkpoints:\n${listOutput}`
					}
					break
				}

				case "show_diff": {
					const diffs = await checkpointService.getDiff({ from: commit_hash, to: undefined })
					if (diffs.length === 0) {
						result = "No differences found."
					} else {
						const diffOutput = diffs
							.map((diff) => {
								return `File: ${diff.paths.relative}\n--- Before ---\n${diff.content.before}\n--- After ---\n${diff.content.after}\n`
							})
							.join("\n")
						result = `Differences:\n${diffOutput}`
					}
					break
				}

				case "restore": {
					await checkpointService.restoreCheckpoint(commit_hash!)
					result = `Successfully restored to checkpoint: ${commit_hash}`
					break
				}

				case "revert": {
					const revertCommitHash = await checkpointService.revertCheckpoint(commit_hash!)
					result = `Successfully reverted checkpoint ${commit_hash}\nNew revert commit: ${revertCommitHash}`
					break
				}

				default:
					result = `Unknown action: ${action}`
			}

			pushToolResult(result)
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error)
			const actionDescription = `checkpoint ${action} operation`
			await handleError(actionDescription, error instanceof Error ? error : new Error(errorMessage))
		}
	}
}

/**
 * Singleton instance of the CheckpointTool
 */
export const checkpointTool = new CheckpointTool()
