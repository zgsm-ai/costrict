export function getLiteWriteToFileDescription(): string {
	return `## write_to_file
Create/overwrite file with content.
Params: path, content(required)`
}

export function getLiteSearchFilesDescription(): string {
	return `## search_files
Regex search in directory.
Params: path (required), regex (required), file_pattern (required)`
}

export function getLiteListFilesDescription(): string {
	return `## list_files
List directory contents.
Params: path (required), recursive (required)`
}

export function getLiteExecuteCommandDescription(): string {
	return `## execute_command
Execute CLI command.
Params: command (required), cwd (required)`
}

export function getLiteAskFollowupQuestionDescription(): string {
	return `## ask_followup_question
Ask user for clarification.
Params: question, follow_up with 2-4 suggest tags`
}

export function getLiteAttemptCompletionDescription(): string {
	return `## attempt_completion
Present final result after task completion.
Params: result (required)`
}

export function getLiteBrowserActionDescription(): string {
	return `## browser_action
Browser interaction: screenshot, click, type, scroll.
Params: action (required), url/coordinate/size/text/path based on action`
}

export function getLiteSwitchModeDescription(): string {
	return `## switch_mode
Switch to different mode.
Params: mode_slug (required), reason (required)`
}

export function getLiteNewTaskDescription(): string {
	return `## new_task
Create new task in specified mode.
Params: mode (required), message (required), todos (required)`
}

export function getLiteUpdateTodoListDescription(): string {
	return `## update_todo_list
Update TODO checklist.
Format: [ ] pending, [x] completed, [-] in progress`
}

export function getLiteFetchInstructionsDescription(): string {
	return `## fetch_instructions
Get task instructions.
Params: task (required) - create_mcp_server or create_mode`
}

export function getLiteCodebaseSearchDescription(): string {
	return `## codebase_search
Semantic search for relevant code.
Params: query (required), path (required)`
}

export function getLiteAccessMcpResourceDescription(): string {
	return `## access_mcp_resource
Access MCP server resource.
Params: server_name (required), uri (required)`
}

export function getLiteGenerateImageDescription(): string {
	return `## generate_image
Generate image using AI.
Params: prompt (required), path (required), image (required)`
}

export function getLiteRunSlashCommandDescription(): string {
	return `## run_slash_command
Run a VS Code slash command.
Params: command (required), args (required)`
}

// Native tools
export function getLiteApplyPatchDescription(): string {
	return `## apply_patch
Apply a patch to a file. supports creating new files, deleting files, and updating existing files with precise changes.
Params: patch (required)`
}

export function getLiteEditFileDescription(): string {
	return `## edit_file
Replace text in an existing file, or create a new file.
Params: file_path (required), old_string (required), new_string (required), expected_replacements (optional)`
}

export function getLiteAskMultipleChoiceDescription(): string {
	return `## ask_multiple_choice
Ask the user to select one or more options from a list of choices.
Params: title (required), questions (required)
CRITICAL: Every question and every option MUST have an id field - results cannot be matched without ids.`
}
