export function getLiteReadFileDescription(): string {
	return `## read_file
Read a single file with line numbers. Two modes: 'slice' (default, offset/limit) and 'indentation' (extract semantic block around anchor_line, preferred when line number is known). Supports PDF/DOCX text extraction. Default 1500 lines, 1500 chars/line max.
Params: path (REQUIRED), mode (optional: slice|indentation), offset, limit, indentation: {anchor_line, max_levels, include_siblings}`
}
getLiteReadFileDescription.toolname = "read_file"

export function getLiteWriteToFileDescription(): string {
	return `## write_to_file
Create or completely overwrite a file. Auto-creates directories. MUST provide COMPLETE content — no placeholders. Prefer edit tools for modifications.
Params: path (REQUIRED), content (REQUIRED)`
}
getLiteWriteToFileDescription.toolname = "write_to_file"

export function getLiteSearchFilesDescription(): string {
	return `## search_files
Regex search across files in a directory with surrounding context. Uses Rust regex syntax.
Params: path (REQUIRED), regex (REQUIRED), file_pattern (REQUIRED, glob like '*.ts')`
}
getLiteSearchFilesDescription.toolname = "search_files"

export function getLiteListFilesDescription(): string {
	return `## list_files
List directory contents, optionally recursive.
Params: path (REQUIRED), recursive (REQUIRED)`
}
getLiteListFilesDescription.toolname = "list_files"

export function getLiteExecuteCommandDescription(): string {
	return `## execute_command
Execute a CLI command on the system. Prefer relative paths. Use timeout for long-running processes (dev servers, watchers) — exceeded commands run in background.
Params: command (REQUIRED), cwd (REQUIRED), timeout (optional, seconds)`
}
getLiteExecuteCommandDescription.toolname = "execute_command"

export function getLiteAskFollowupQuestionDescription(): string {
	return `## ask_followup_question
Ask the user a question with 2-4 suggested actionable answers. May include mode switch.
Params: question (REQUIRED), follow_up (REQUIRED: [{text, mode?}])`
}
getLiteAskFollowupQuestionDescription.toolname = "ask_followup_question"

export function getLiteAttemptCompletionDescription(): string {
	return `## attempt_completion
Present final task result. Only after confirming all prior tool uses succeeded. No questions.
Params: result (REQUIRED)`
}
getLiteAttemptCompletionDescription.toolname = "attempt_completion"

export function getLiteBrowserActionDescription(): string {
	return `## browser_action
Interact with a browser: launch, navigate, screenshot, click, type, scroll, close.
Params: action (REQUIRED), url/coordinate/size/text/path based on action`
}
getLiteBrowserActionDescription.toolname = "browser_action"

export function getLiteSwitchModeDescription(): string {
	return `## switch_mode
Switch to a different mode (requires user approval).
Params: mode_slug (REQUIRED), reason (REQUIRED)`
}
getLiteSwitchModeDescription.toolname = "switch_mode"

export function getLiteNewTaskDescription(): string {
	return `## new_task
Create a new task in chosen mode. MUST be called alone — no other tools in same turn.
Params: mode (REQUIRED), message (REQUIRED), todos (REQUIRED)`
}
getLiteNewTaskDescription.toolname = "new_task"

export function getLiteUpdateTodoListDescription(): string {
	return `## update_todo_list
Replace the entire TODO checklist. Always provide full list — system overwrites previous.
Params: todos (REQUIRED: [ ] pending, [x] done, [-] in progress)`
}
getLiteUpdateTodoListDescription.toolname = "update_todo_list"

export function getLiteSkillDescription(): string {
	return `## skill
Load and execute a skill by name for specialized instructions.
Params: skill (REQUIRED), args (optional)`
}
getLiteSkillDescription.toolname = "skill"

export function getLiteCodebaseSearchDescription(): string {
	return `## codebase_search
Semantic search for relevant code across the codebase.
Params: query (REQUIRED), path (REQUIRED)`
}
getLiteCodebaseSearchDescription.toolname = "codebase_search"

export function getLiteAccessMcpResourceDescription(): string {
	return `## access_mcp_resource
Access a resource (file, API response, etc.) from a connected MCP server.
Params: server_name (REQUIRED), uri (REQUIRED)`
}
getLiteAccessMcpResourceDescription.toolname = "access_mcp_resource"

export function getLiteGenerateImageDescription(): string {
	return `## generate_image
Generate or edit images via AI (OpenRouter). Supports PNG, JPG, JPEG, GIF, WEBP.
Params: prompt (REQUIRED), path (REQUIRED), image (optional, for editing)`
}
getLiteGenerateImageDescription.toolname = "generate_image"

export function getLiteRunSlashCommandDescription(): string {
	return `## run_slash_command
Execute a predefined slash command template.
Params: command (REQUIRED), args (REQUIRED)`
}
getLiteRunSlashCommandDescription.toolname = "run_slash_command"

export function getLiteReadCommandOutputDescription(): string {
	return `## read_command_output
Retrieve truncated command output. Read mode (offset/limit) or search mode (regex filter).
Params: artifact_id (REQUIRED), search (optional), offset (optional, bytes), limit (optional, default 40KB)`
}
getLiteReadCommandOutputDescription.toolname = "read_command_output"

// Native tools
export function getLiteApplyDiffDescription(): string {
	return `## apply_diff
Apply search/replace blocks to a file. SEARCH must exactly match existing content including whitespace. Use read_file first if unsure.
Params: path (REQUIRED), diff (REQUIRED: SEARCH/REPLACE blocks with :start_line:)`
}
getLiteApplyDiffDescription.toolname = "apply_diff"

export function getLiteApplyPatchDescription(): string {
	return `## apply_patch
Apply patches supporting create/delete/update files. Uses '*** Begin/End Patch' format.
Params: patch (REQUIRED)`
}
getLiteApplyPatchDescription.toolname = "apply_patch"

export function getLiteEditFileDescription(): string {
	return `## edit_file
Replace text in a file or create new (empty old_string). Normalizes line endings; falls back to fuzzy matching. Include 3+ lines context for uniqueness. Use expected_replacements for multiple identical matches.
Params: file_path (REQUIRED), old_string (REQUIRED), new_string (REQUIRED), expected_replacements (optional, default 1)`
}
getLiteEditFileDescription.toolname = "edit_file"

export function getLiteAskMultipleChoiceDescription(): string {
	return `## ask_multiple_choice
Present structured multiple-choice questions. CRITICAL: every question and option MUST have an id field.
Params: title (REQUIRED), questions (REQUIRED: [{id, prompt, options: [{id, label}], allow_multiple?}])`
}
getLiteAskMultipleChoiceDescription.toolname = "ask_multiple_choice"

export function getLiteSearchAndReplaceDescription(): string {
	return `## search_and_replace
Apply search/replace operations on an existing file.
Params: path (REQUIRED), operations (REQUIRED: [{search, replace}])`
}
getLiteSearchAndReplaceDescription.toolname = "search_and_replace"

export function getLiteSearchReplaceDescription(): string {
	return `## search_replace
Replace ONE occurrence of old_string with new_string. Must be unique — include 3-5 lines context. Separate calls for multiple instances.
Params: file_path (REQUIRED), old_string (REQUIRED), new_string (REQUIRED)`
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

export function getLiteSequentialThinkingDescription(): string {
	return `## sequential_thinking
Structured thinking tool for step-by-step analysis of complex problems. Supports dynamically adjusting total steps, revising previous thoughts, and creating alternative branches. Use for multi-step problems, plans needing revision, or unclear problem scope. Recommended 5-25 steps based on complexity.
Params fields:
- thought (REQUIRED): Content of the current thinking step
- nextThoughtNeeded (REQUIRED): Whether to continue thinking
- thoughtNumber (REQUIRED): Current step number (starting from 1)
- totalThoughts (REQUIRED): Estimated total steps (adjustable)
- isRevision (optional): Whether this revises a previous thought
- revisesThought (optional): Thought number to revise
- branchFromThought (optional): Which thought to branch from
- branchId (optional): Branch identifier
- needsMoreThoughts (optional): Whether more thoughts beyond estimate are needed`
}
getLiteSequentialThinkingDescription.toolname = "sequential_thinking"

export function getLiteFileOutlineDescription(): string {
	return `## file_outline
Extract code structure outline (classes, functions, methods, docstrings). Supports Python, JS/TS, Go, Java, C/C++.
Params: file_path (REQUIRED), include_docstrings (optional)`
}
getLiteFileOutlineDescription.toolname = "file_outline"

export function getLiteCostrictCheckpointDescription(): string {
	return `## costrict_checkpoint
Creates and manages snapshots of project state using a shadow Git repository.
Params fields:
- action (REQUIRED): The action to perform - "commit", "list", "show_diff", "restore", or "revert"
- message (optional): Commit message (required when action is "commit")
- commit_hash (optional): Commit hash (required for "restore", "show_diff", "revert" actions)
- files (optional): List of file paths to restore (only for "restore" action)`
}
getLiteCostrictCheckpointDescription.toolname = "costrict_checkpoint"

const liteTools = [
	getLiteReadFileDescription,
	getLiteWriteToFileDescription,
	getLiteSearchFilesDescription,
	getLiteListFilesDescription,
	getLiteExecuteCommandDescription,
	getLiteReadCommandOutputDescription,
	getLiteAskFollowupQuestionDescription,
	getLiteSequentialThinkingDescription,
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
	getLiteFileOutlineDescription,
	getLiteAttemptCompletionDescription,
	// getLiteCostrictCheckpointDescription,
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
