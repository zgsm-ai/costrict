export function getLiteReadFileDescription(): string {
	return `## read_file
Read file contents with line numbers.
Params: files (REQUIRED)
- files: Array of file objects
  - path (REQUIRED): File path relative to workspace
  - line_ranges (optional): Array of [start, end] tuples for specific sections`
}
getLiteReadFileDescription.toolname = "read_file"

export function getLiteWriteToFileDescription(): string {
	return `## write_to_file
Create/overwrite file with content.
Params: path, content(REQUIRED)`
}
getLiteWriteToFileDescription.toolname = "write_to_file"

export function getLiteSearchFilesDescription(): string {
	return `## search_files
Regex search in directory.
Params: path (REQUIRED), regex (REQUIRED), file_pattern (REQUIRED)`
}
getLiteSearchFilesDescription.toolname = "search_files"

export function getLiteListFilesDescription(): string {
	return `## list_files
List directory contents.
Params: path (REQUIRED), recursive (REQUIRED)`
}
getLiteListFilesDescription.toolname = "list_files"

export function getLiteExecuteCommandDescription(): string {
	return `## execute_command
Execute CLI command.
Params: command (REQUIRED), cwd (REQUIRED)`
}
getLiteExecuteCommandDescription.toolname = "execute_command"

export function getLiteAskFollowupQuestionDescription(): string {
	return `## ask_followup_question
Ask user for clarification.
Params: question (required), follow_up (required)
- question: Clear, specific question addressing the information needed
- follow_up: Array of 2-4 suggested responses
  - text (required): Suggested answer the user can pick
  - mode (optional): Mode slug to switch to if chosen (e.g., code, architect)`
}
getLiteAskFollowupQuestionDescription.toolname = "ask_followup_question"

export function getLiteAttemptCompletionDescription(): string {
	return `## attempt_completion
Present final result after task completion.
Params: result (REQUIRED)`
}
getLiteAttemptCompletionDescription.toolname = "attempt_completion"

export function getLiteBrowserActionDescription(): string {
	return `## browser_action
Browser interaction: screenshot, click, type, scroll.
Params: action (REQUIRED), url/coordinate/size/text/path based on action`
}
getLiteBrowserActionDescription.toolname = "browser_action"

export function getLiteSwitchModeDescription(): string {
	return `## switch_mode
Switch to different mode.
Params: mode_slug (REQUIRED), reason (REQUIRED)`
}
getLiteSwitchModeDescription.toolname = "switch_mode"

export function getLiteNewTaskDescription(): string {
	return `## new_task
Create new task in specified mode.
Params: mode (REQUIRED), message (REQUIRED), todos (REQUIRED)`
}
getLiteNewTaskDescription.toolname = "new_task"

export function getLiteUpdateTodoListDescription(): string {
	return `## update_todo_list
Update TODO checklist.
Params: todos (required)
- todos: Full markdown checklist in execution order
Format: [ ] pending, [x] completed, [-] in progress`
}
getLiteUpdateTodoListDescription.toolname = "update_todo_list"

export function getLiteFetchInstructionsDescription(): string {
	return `## fetch_instructions
Get task instructions.
Params: task (REQUIRED) - create_mcp_server or create_mode`
}
getLiteFetchInstructionsDescription.toolname = "fetch_instructions"

export function getLiteCodebaseSearchDescription(): string {
	return `## codebase_search
Semantic search for relevant code.
Params: query (REQUIRED), path (REQUIRED)`
}
getLiteCodebaseSearchDescription.toolname = "codebase_search"

export function getLiteAccessMcpResourceDescription(): string {
	return `## access_mcp_resource
Access MCP server resource.
Params: server_name (REQUIRED), uri (REQUIRED)`
}
getLiteAccessMcpResourceDescription.toolname = "access_mcp_resource"

export function getLiteGenerateImageDescription(): string {
	return `## generate_image
Generate image using AI.
Params: prompt (REQUIRED), path (REQUIRED), image (REQUIRED)`
}
getLiteGenerateImageDescription.toolname = "generate_image"

export function getLiteRunSlashCommandDescription(): string {
	return `## run_slash_command
Run a VS Code slash command.
Params: command (REQUIRED), args (REQUIRED)`
}
getLiteRunSlashCommandDescription.toolname = "run_slash_command"

// Native tools
export function getLiteApplyDiffDescription(): string {
	return `## apply_diff
Apply precise, targeted modifications to an existing file using one or more search/replace blocks.
Params: path (REQUIRED), diff (REQUIRED)
- path: File path relative to workspace
- diff: String containing search/replace blocks`
}
getLiteApplyDiffDescription.toolname = "apply_diff"

export function getLiteApplyPatchDescription(): string {
	return `## apply_patch
Apply a patch to a file. supports creating new files, deleting files, and updating existing files with precise changes.
Params: patch (REQUIRED)`
}
getLiteApplyPatchDescription.toolname = "apply_patch"

export function getLiteEditFileDescription(): string {
	return `## edit_file
Replace text in an existing file, or create a new file.
Params: file_path (REQUIRED), old_string (REQUIRED), new_string (REQUIRED), expected_replacements (optional)`
}
getLiteEditFileDescription.toolname = "edit_file"

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
getLiteAskMultipleChoiceDescription.toolname = "ask_multiple_choice"

export function getLiteSearchAndReplaceDescription(): string {
	return `## search_and_replace
Apply precise, targeted modifications using search and replace operations.
Params: path (REQUIRED), operations (REQUIRED)
- path: File path relative to workspace
- operations: Array of search/replace operations
  - search (REQUIRED): Exact text to find
  - replace (REQUIRED): Text to replace with`
}
getLiteSearchAndReplaceDescription.toolname = "search_and_replace"

export function getLiteSearchReplaceDescription(): string {
	return `## search_replace
Replace ONE occurrence of old_string with new_string in a file.
Params: file_path (REQUIRED), old_string (REQUIRED), new_string (REQUIRED)
- file_path: Path to the file (relative or absolute)
- old_string: Text to replace (must be unique, include 3-5 lines of context)
- new_string: Edited text to replace with`
}
getLiteSearchReplaceDescription.toolname = "search_replace"

export const xmlLiteToolGuide = `
# Response Format (CRITICAL):
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

export const getGeminiCliLiteToolGuide = () => {
	return `---- CRITICAL TOOL RULES (MUST FOLLOW) ----

# User Local Available Tools

${getLiteReadFileDescription()}

${getLiteWriteToFileDescription()}

${getLiteSearchFilesDescription()}

${getLiteListFilesDescription()}

${getLiteExecuteCommandDescription()}

${getLiteAskFollowupQuestionDescription()}

${getLiteAttemptCompletionDescription()}

${getLiteBrowserActionDescription()}

${getLiteSwitchModeDescription()}

${getLiteNewTaskDescription()}

${getLiteUpdateTodoListDescription()}

${getLiteFetchInstructionsDescription()}

${getLiteCodebaseSearchDescription()}

${getLiteAccessMcpResourceDescription()}

${getLiteGenerateImageDescription()}

${getLiteRunSlashCommandDescription()}

${getLiteApplyPatchDescription()}

${getLiteEditFileDescription()}

${getLiteAskMultipleChoiceDescription()}

${getLiteApplyDiffDescription()}

${getLiteSearchAndReplaceDescription()}

${getLiteSearchReplaceDescription()}

${xmlLiteToolGuide}

-----------------------------------------
`
}
