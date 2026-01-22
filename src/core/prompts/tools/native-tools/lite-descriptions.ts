export function getLiteWriteToFileDescription(): string {
	return `## write_to_file
Create/overwrite file with content.
Params: path, content(REQUIRED)`
}

export function getLiteSearchFilesDescription(): string {
	return `## search_files
Regex search in directory.
Params: path (REQUIRED), regex (REQUIRED), file_pattern (REQUIRED)`
}

export function getLiteListFilesDescription(): string {
	return `## list_files
List directory contents.
Params: path (REQUIRED), recursive (REQUIRED)`
}

export function getLiteExecuteCommandDescription(): string {
	return `## execute_command
Execute CLI command.
Params: command (REQUIRED), cwd (REQUIRED)`
}

export function getLiteAskFollowupQuestionDescription(): string {
	return `## ask_followup_question
Ask user for clarification.
Params: question (required), follow_up (required)
- question: Clear, specific question addressing the information needed
- follow_up: Array of 2-4 suggested responses
  - text (required): Suggested answer the user can pick
  - mode (optional): Mode slug to switch to if chosen (e.g., code, architect)`
}

export function getLiteAttemptCompletionDescription(): string {
	return `## attempt_completion
Present final result after task completion.
Params: result (REQUIRED)`
}

export function getLiteBrowserActionDescription(): string {
	return `## browser_action
Browser interaction: screenshot, click, type, scroll.
Params: action (REQUIRED), url/coordinate/size/text/path based on action`
}

export function getLiteSwitchModeDescription(): string {
	return `## switch_mode
Switch to different mode.
Params: mode_slug (REQUIRED), reason (REQUIRED)`
}

export function getLiteNewTaskDescription(): string {
	return `## new_task
Create new task in specified mode.
Params: mode (REQUIRED), message (REQUIRED), todos (REQUIRED)`
}

export function getLiteUpdateTodoListDescription(): string {
	return `## update_todo_list
Update TODO checklist.
Params: todos (required)
- todos: Full markdown checklist in execution order
Format: [ ] pending, [x] completed, [-] in progress`
}

export function getLiteFetchInstructionsDescription(): string {
	return `## fetch_instructions
Get task instructions.
Params: task (REQUIRED) - create_mcp_server or create_mode`
}

export function getLiteCodebaseSearchDescription(): string {
	return `## codebase_search
Semantic search for relevant code.
Params: query (REQUIRED), path (REQUIRED)`
}

export function getLiteAccessMcpResourceDescription(): string {
	return `## access_mcp_resource
Access MCP server resource.
Params: server_name (REQUIRED), uri (REQUIRED)`
}

export function getLiteGenerateImageDescription(): string {
	return `## generate_image
Generate image using AI.
Params: prompt (REQUIRED), path (REQUIRED), image (REQUIRED)`
}

export function getLiteRunSlashCommandDescription(): string {
	return `## run_slash_command
Run a VS Code slash command.
Params: command (REQUIRED), args (REQUIRED)`
}

// Native tools
export function getLiteApplyPatchDescription(): string {
	return `## apply_patch
Apply a patch to a file. supports creating new files, deleting files, and updating existing files with precise changes.
Params: patch (REQUIRED)`
}

export function getLiteEditFileDescription(): string {
	return `## edit_file
Replace text in an existing file, or create a new file.
Params: file_path (REQUIRED), old_string (REQUIRED), new_string (REQUIRED), expected_replacements (optional)`
}

export function getLiteAskMultipleChoiceDescription(): string {
	return `## ask_multiple_choice
Ask the user to select one or more options from a list of choices.
Params: title (optional), questions (REQUIRED)
- questions: Array of question objects (at least 1)
  - id (REQUIRED): Unique identifier for the question
  - prompt (REQUIRED): Question text to display
  - options (REQUIRED): Array of option objects (at least 2)
    - id (REQUIRED): Unique identifier for the option
    - label (REQUIRED): Display text for the option
  - allow_multiple (optional): true for multi-select, false for single-select (default: false)
CRITICAL: Every question and every option MUST have an id field - results cannot be matched without ids.`
}

export const xmlLiteToolGuide = `
	## Tool Call Format (CRITICAL):
	When calling a tool, you MUST wrap the tool call parameters in a <tool_call> XML tag containing a valid JSON object.
	
	Required format:
	\`\`\`xml
	<tool_call>
	{
			"name": "tool_name_here",
			"arguments": {
				 "param1": "value1",
				 "param2": "value2"
			}
	}
	</tool_call>
	\`\`\`
	
	Requirements:
	- The content inside <tool_call> tags MUST be valid JSON
	- "name" field: string, the exact name of the tool to call
	- "arguments" field: object, containing all required parameters for the tool
	- Do NOT include comments in the JSON
	- Ensure proper JSON syntax (double quotes, no trailing commas)
	`
