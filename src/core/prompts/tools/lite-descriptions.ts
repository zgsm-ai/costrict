export function getLiteReadFileDescription(): string {
	return `## read_file
Read file contents with line numbers. Supports text extraction from PDF and DOCX files.
Two modes:
- slice (default): Read lines sequentially with offset/limit
- indentation: Extract semantic code blocks based on anchor_line
Params fields:
- path (REQUIRED): File path relative to workspace
- mode (optional): Reading mode - 'slice' or 'indentation' (default: 'slice')
- offset (optional): 1-based start line for slice mode (default: 1)
- limit (optional): Max lines for slice mode (default: 2000)
- indentation (optional): Object for indentation mode
  - anchor_line (REQUIRED): 1-based line number to extract semantic block
  - max_levels (optional): Indentation levels to include above anchor
  - include_siblings (optional): Include sibling blocks (default: false)
Note: When anchor_line is known, prefer indentation mode for complete code blocks. Returns up to 2000 lines by default.`
}
getLiteReadFileDescription.toolname = "read_file"

export function getLiteWriteToFileDescription(): string {
	return `## write_to_file
Create/overwrite file with content.
Params fields: path, content(REQUIRED)`
}
getLiteWriteToFileDescription.toolname = "write_to_file"

export function getLiteSearchFilesDescription(): string {
	return `## search_files
Regex search in directory.
Params fields: path (REQUIRED), regex (REQUIRED), file_pattern (REQUIRED)`
}
getLiteSearchFilesDescription.toolname = "search_files"

export function getLiteListFilesDescription(): string {
	return `## list_files
List directory contents.
Params fields: path (REQUIRED), recursive (REQUIRED)`
}
getLiteListFilesDescription.toolname = "list_files"

export function getLiteExecuteCommandDescription(): string {
	return `## execute_command
Execute CLI command.
Params fields: command (REQUIRED), cwd (REQUIRED)`
}
getLiteExecuteCommandDescription.toolname = "execute_command"

export function getLiteAskFollowupQuestionDescription(): string {
	return `## ask_followup_question
Ask user for clarification.
Params fields: question (REQUIRED), follow_up (REQUIRED)
- question: Clear, specific question addressing the information needed
- follow_up: Array of 2-4 suggested responses
  - text (REQUIRED): Suggested answer the user can pick
  - mode (optional): Mode slug to switch to if chosen (e.g., code, architect)`
}
getLiteAskFollowupQuestionDescription.toolname = "ask_followup_question"

export function getLiteAttemptCompletionDescription(): string {
	return `## attempt_completion
Present final result after task completion.
Params fields: result (REQUIRED)`
}
getLiteAttemptCompletionDescription.toolname = "attempt_completion"

export function getLiteBrowserActionDescription(): string {
	return `## browser_action
Browser interaction: screenshot, click, type, scroll.
Params fields: action (REQUIRED), url/coordinate/size/text/path based on action`
}
getLiteBrowserActionDescription.toolname = "browser_action"

export function getLiteSwitchModeDescription(): string {
	return `## switch_mode
Switch to different mode.
Params fields: mode_slug (REQUIRED), reason (REQUIRED)`
}
getLiteSwitchModeDescription.toolname = "switch_mode"

export function getLiteNewTaskDescription(): string {
	return `## new_task
Create new task in specified mode.
Params fields: mode (REQUIRED), message (REQUIRED), todos (REQUIRED)`
}
getLiteNewTaskDescription.toolname = "new_task"

export function getLiteUpdateTodoListDescription(): string {
	return `## update_todo_list
Update TODO checklist.
Params fields: todos (REQUIRED)
- todos: Full markdown checklist in execution order
Format: [ ] pending, [x] completed, [-] in progress`
}
getLiteUpdateTodoListDescription.toolname = "update_todo_list"

export function getLiteSkillDescription(): string {
	return `## skill
Load and execute a skill by name. Skills provide specialized instructions for common tasks like creating MCP servers or custom modes.
Params fields:
- skill (REQUIRED): Name of the skill to load (e.g., create-mcp-server, create-mode)
- args (optional): Context or arguments to pass to the skill`
}
getLiteSkillDescription.toolname = "skill"

export function getLiteCodebaseSearchDescription(): string {
	return `## codebase_search
Semantic search for relevant code.
Params fields: query (REQUIRED), path (REQUIRED)`
}
getLiteCodebaseSearchDescription.toolname = "codebase_search"

export function getLiteAccessMcpResourceDescription(): string {
	return `## access_mcp_resource
Access MCP server resource.
Params fields: server_name (REQUIRED), uri (REQUIRED)`
}
getLiteAccessMcpResourceDescription.toolname = "access_mcp_resource"

export function getLiteGenerateImageDescription(): string {
	return `## generate_image
Generate image using AI.
Params fields: prompt (REQUIRED), path (REQUIRED), image (REQUIRED)`
}
getLiteGenerateImageDescription.toolname = "generate_image"

export function getLiteRunSlashCommandDescription(): string {
	return `## run_slash_command
Run a VS Code slash command.
Params fields: command (REQUIRED), args (REQUIRED)`
}
getLiteRunSlashCommandDescription.toolname = "run_slash_command"

export function getLiteReadCommandOutputDescription(): string {
	return `## read_command_output
Retrieve the full output from a command that was truncated in execute_command.
Params fields: artifact_id (REQUIRED), search (optional), offset (optional), limit (optional)
- artifact_id: The artifact filename from truncated output (e.g., "cmd-1706119234567.txt")
- search: Optional pattern to filter lines (regex or literal, case-insensitive)
- offset: Byte offset to start reading from (default: 0)
- limit: Maximum bytes to return (default: 40KB)`
}
getLiteReadCommandOutputDescription.toolname = "read_command_output"

// Native tools
export function getLiteApplyDiffDescription(): string {
	return `## apply_diff
Apply precise, targeted modifications to an existing file using one or more search/replace blocks.
Params fields: path (REQUIRED), diff (REQUIRED)
- path: File path relative to workspace
- diff: String containing search/replace blocks`
}
getLiteApplyDiffDescription.toolname = "apply_diff"

export function getLiteApplyPatchDescription(): string {
	return `## apply_patch
Apply a patch to a file. supports creating new files, deleting files, and updating existing files with precise changes.
Params fields: patch (REQUIRED)`
}
getLiteApplyPatchDescription.toolname = "apply_patch"

export function getLiteEditFileDescription(): string {
	return `## edit_file
Replace text in an existing file, or create a new file.
Params fields: file_path (REQUIRED), old_string (REQUIRED), new_string (REQUIRED), expected_replacements (optional)`
}
getLiteEditFileDescription.toolname = "edit_file"

export function getLiteAskMultipleChoiceDescription(): string {
	return `## ask_multiple_choice
Ask the user to select one or more options from a list of choices.
Params fields: title (REQUIRED), questions (REQUIRED)
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
Params fields: path (REQUIRED), operations (REQUIRED)
- path: File path relative to workspace
- operations: Array of search/replace operations
  - search (REQUIRED): Exact text to find
  - replace (REQUIRED): Text to replace with`
}
getLiteSearchAndReplaceDescription.toolname = "search_and_replace"

export function getLiteSearchReplaceDescription(): string {
	return `## search_replace
Replace ONE occurrence of old_string with new_string in a file.
Params fields: file_path (REQUIRED), old_string (REQUIRED), new_string (REQUIRED)
- file_path: Path to the file (relative or absolute)
- old_string: Text to replace (must be unique, include 3-5 lines of context)
- new_string: Edited text to replace with`
}
getLiteSearchReplaceDescription.toolname = "search_replace"

getLiteReadFileDescription.toolname = "read_file"

getLiteWriteToFileDescription.toolname = "write_to_file"

getLiteSearchFilesDescription.toolname = "search_files"

getLiteListFilesDescription.toolname = "list_files"

getLiteExecuteCommandDescription.toolname = "execute_command"

getLiteAskFollowupQuestionDescription.toolname = "ask_followup_question"

getLiteAttemptCompletionDescription.toolname = "attempt_completion"

getLiteBrowserActionDescription.toolname = "browser_action"

getLiteSwitchModeDescription.toolname = "switch_mode"

getLiteNewTaskDescription.toolname = "new_task"

getLiteUpdateTodoListDescription.toolname = "update_todo_list"

getLiteSkillDescription.toolname = "skill"

getLiteCodebaseSearchDescription.toolname = "codebase_search"

getLiteAccessMcpResourceDescription.toolname = "access_mcp_resource"

getLiteGenerateImageDescription.toolname = "generate_image"

getLiteRunSlashCommandDescription.toolname = "run_slash_command"

getLiteReadCommandOutputDescription.toolname = "read_command_output"

getLiteApplyDiffDescription.toolname = "apply_diff"

getLiteApplyPatchDescription.toolname = "apply_patch"

getLiteEditFileDescription.toolname = "edit_file"

getLiteAskMultipleChoiceDescription.toolname = "ask_multiple_choice"

getLiteSearchAndReplaceDescription.toolname = "search_and_replace"

getLiteSearchReplaceDescription.toolname = "search_replace"

const liteTools = [
	getLiteReadFileDescription,
	getLiteWriteToFileDescription,
	getLiteSearchFilesDescription,
	getLiteListFilesDescription,
	getLiteExecuteCommandDescription,
	getLiteReadCommandOutputDescription,
	getLiteAskFollowupQuestionDescription,
	getLiteBrowserActionDescription,
	getLiteSwitchModeDescription,
	getLiteNewTaskDescription,
	getLiteUpdateTodoListDescription,
	getLiteSkillDescription,
	getLiteCodebaseSearchDescription,
	getLiteAccessMcpResourceDescription,
	getLiteGenerateImageDescription,
	getLiteRunSlashCommandDescription,
	getLiteApplyPatchDescription,
	getLiteEditFileDescription,
	getLiteAskMultipleChoiceDescription,
	getLiteApplyDiffDescription,
	getLiteSearchAndReplaceDescription,
	getLiteSearchReplaceDescription,
	getLiteAttemptCompletionDescription,
]

export const liteRetryPrompt = (tag = "tool_call") => `
# Your previous response did not follow the required format.

You MUST respond with ONLY the <${tag}> XML.
Do not include any explanation or extra text.

Retry now.
`
export const liteToolContractPrompt = (tag = "tool_call") => `
# RESPONSE OUTPUT FORMAT CONTRACT (STRICT)

When calling a tool, you MUST wrap the tool call parameters in a <${tag}> tag containing a valid JSON object.

Valid Response example:

<${tag}>
{
  "name": "read_file",
  "arguments": {
    "path": "src/index.ts",
    "offset": 1,
    "limit": 200
  }
}
</${tag}>

Requirements:
- Response Output ONLY the <${tag}> XML block
	- "name" field: string, the exact name of the tool to call
	- "arguments" field: object, containing all required parameters for the tool
- No text before or after
- No markdown
- No explanation
- No comments
- The content inside <${tag}> tags MUST be valid JSON
- Do NOT include comments in the JSON
- Ensure proper JSON syntax (double quotes, no trailing commas)

Any deviation will cause automatic failure.
`

export const liteToolJudgePrompt = (allowedToolNames?: string[]) => `
# You can ONLY call the following built-in tools by name:

${liteTools.map((t) => (allowedToolNames?.includes(t.toolname) || !allowedToolNames ? t.toolname : "")).join("\n")}

You must call ONE tool per assistant response.
Do not explain your decision.

`

export const getGeminiCliLiteToolGuide = (allowedToolNames?: string[]) => {
	return `
# User Local Available Built-in Tools

${liteTools
	.map((t) => {
		if (allowedToolNames?.includes(t.toolname) || !allowedToolNames) return t()
		else return ""
	})
	.filter((tn) => !!tn)
	.join("\n\n")}

`
}
