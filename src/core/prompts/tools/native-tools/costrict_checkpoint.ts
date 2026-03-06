import type OpenAI from "openai"

const CHECKPOINT_DESCRIPTION = `Creates and manages snapshots of the project state using a shadow Git repository for safe experimentation and recovery.

Usage notes:
- This tool requires Git to be installed on the system
- Checkpoints are stored in a shadow Git repository separate from your project
- Use this tool to save, list, compare, restore, or revert project states

Actions:
- commit: Creates a new checkpoint with a descriptive message
- list: Lists all available checkpoints
- show_diff: Shows differences between current state and a checkpoint
- restore: Restores project to a specific checkpoint (destructive)
- revert: Creates a new commit undoing a checkpoint's changes (non-destructive)

Important:
- The 'commit_hash' parameter is required for show_diff, restore, and revert actions
- The 'message' parameter is required for commit action
- Restore is destructive and will discard uncommitted changes
- Revert is safe and preserves history by creating a new commit`

const ACTION_PARAMETER_DESCRIPTION = `The checkpoint action to perform. Must be one of:
- "commit": Create a new checkpoint
- "list": List all checkpoints
- "show_diff": Show differences from a checkpoint
- "restore": Restore to a checkpoint (destructive)
- "revert": Create a revert commit (non-destructive)`

const MESSAGE_PARAMETER_DESCRIPTION = `Commit message (required when action is "commit"). A descriptive message for the checkpoint.`

const COMMIT_HASH_PARAMETER_DESCRIPTION = `Commit hash (required for "restore", "show_diff", and "revert" actions). The checkpoint identifier.`

const FILES_PARAMETER_DESCRIPTION = `List of file paths to restore (optional, only for "restore" action). If omitted, all files are restored.`

const checkpoint = {
	type: "function",
	function: {
		name: "costrict_checkpoint",
		description: CHECKPOINT_DESCRIPTION,
		strict: true,
		parameters: {
			type: "object",
			properties: {
				action: {
					type: "string",
					enum: ["commit", "list", "show_diff", "restore", "revert"],
					description: ACTION_PARAMETER_DESCRIPTION,
				},
				message: {
					type: "string",
					description: MESSAGE_PARAMETER_DESCRIPTION,
				},
				commit_hash: {
					type: "string",
					description: COMMIT_HASH_PARAMETER_DESCRIPTION,
				},
				files: {
					type: "array",
					items: {
						type: "string",
					},
					description: FILES_PARAMETER_DESCRIPTION,
				},
			},
			required: ["action"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool

export default checkpoint
