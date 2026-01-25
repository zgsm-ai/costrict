import type OpenAI from "openai"
import accessMcpResource from "./access_mcp_resource"
import { apply_diff } from "./apply_diff"
import applyPatch from "./apply_patch"
import askFollowupQuestion from "./ask_followup_question"
import askMultipleChoice from "./ask_multiple_choice"
import attemptCompletion from "./attempt_completion"
import browserAction from "./browser_action"
import codebaseSearch from "./codebase_search"
import executeCommand from "./execute_command"
import fetchInstructions from "./fetch_instructions"
import generateImage from "./generate_image"
import listFiles from "./list_files"
import newTask from "./new_task"
import { createReadFileTool, type ReadFileToolOptions } from "./read_file"
import runSlashCommand from "./run_slash_command"
import searchAndReplace from "./search_and_replace"
import searchReplace from "./search_replace"
import edit_file from "./edit_file"
import searchFiles from "./search_files"
import switchMode from "./switch_mode"
import updateTodoList from "./update_todo_list"
import writeToFile from "./write_to_file"

export { getMcpServerTools } from "./mcp_server"
export { convertOpenAIToolToAnthropic, convertOpenAIToolsToAnthropic } from "./converters"
export type { ReadFileToolOptions } from "./read_file"

import {
	getLiteReadFileDescription,
	getLiteWriteToFileDescription,
	getLiteApplyPatchDescription,
	getLiteApplyDiffDescription,
	getLiteSearchFilesDescription,
	getLiteListFilesDescription,
	getLiteExecuteCommandDescription,
	getLiteAskFollowupQuestionDescription,
	getLiteAttemptCompletionDescription,
	getLiteBrowserActionDescription,
	getLiteSwitchModeDescription,
	getLiteNewTaskDescription,
	getLiteUpdateTodoListDescription,
	getLiteFetchInstructionsDescription,
	getLiteCodebaseSearchDescription,
	getLiteAccessMcpResourceDescription,
	getLiteGenerateImageDescription,
	getLiteRunSlashCommandDescription,
	getLiteEditFileDescription,
	getLiteAskMultipleChoiceDescription,
	getLiteSearchAndReplaceDescription,
	getLiteSearchReplaceDescription,
} from "./lite-descriptions"

/**
 * Options for customizing the native tools array.
 */
export interface NativeToolsOptions {
	/** Whether to include line_ranges support in read_file tool (default: true) */
	partialReadsEnabled?: boolean
	/** Maximum number of files that can be read in a single read_file request (default: 5) */
	maxConcurrentFileReads?: number
	/** Whether the model supports image processing (default: false) */
	supportsImages?: boolean
	useLitePrompts?: boolean
}

function getLiteDescription(tool: OpenAI.Chat.ChatCompletionFunctionTool): string {
	switch (tool.function!.name) {
		case "access_mcp_resource":
			return getLiteAccessMcpResourceDescription()
		case "apply_diff":
			return getLiteApplyDiffDescription()
		case "apply_patch":
			return getLiteApplyPatchDescription()
		case "ask_followup_question":
			return getLiteAskFollowupQuestionDescription()
		case "ask_multiple_choice":
			return getLiteAskMultipleChoiceDescription()
		case "attempt_completion":
			return getLiteAttemptCompletionDescription()
		case "browser_action":
			return getLiteBrowserActionDescription()
		case "codebase_search":
			return getLiteCodebaseSearchDescription()
		case "execute_command":
			return getLiteExecuteCommandDescription()
		case "fetch_instructions":
			return getLiteFetchInstructionsDescription()
		case "generate_image":
			return getLiteGenerateImageDescription()
		case "list_files":
			return getLiteListFilesDescription()
		case "new_task":
			return getLiteNewTaskDescription()
		case "read_file":
			return getLiteReadFileDescription()
		case "run_slash_command":
			return getLiteRunSlashCommandDescription()
		case "edit_file":
			return getLiteEditFileDescription()
		case "search_and_replace":
			return getLiteSearchAndReplaceDescription()
		case "search_files":
			return getLiteSearchFilesDescription()
		case "search_replace":
			return getLiteSearchReplaceDescription()
		case "switch_mode":
			return getLiteSwitchModeDescription()
		case "update_todo_list":
			return getLiteUpdateTodoListDescription()
		case "write_to_file":
			return getLiteWriteToFileDescription()
		default:
			return tool.function!.description!
	}
}

/**
 * Get native tools array, optionally customizing based on settings.
 *
 * @param options - Configuration options for the tools
 * @returns Array of native tool definitions
 */
export function getNativeTools(options: NativeToolsOptions = {}): OpenAI.Chat.ChatCompletionTool[] {
	const {
		partialReadsEnabled = true,
		maxConcurrentFileReads = 5,
		supportsImages = false,
		useLitePrompts = false,
	} = options
	const readFileOptions: ReadFileToolOptions = {
		partialReadsEnabled,
		maxConcurrentFileReads,
		supportsImages,
	}

	return [
		accessMcpResource,
		apply_diff,
		applyPatch,
		askFollowupQuestion,
		askMultipleChoice,
		attemptCompletion,
		browserAction,
		codebaseSearch,
		executeCommand,
		fetchInstructions,
		generateImage,
		listFiles,
		newTask,
		createReadFileTool(readFileOptions),
		runSlashCommand,
		searchAndReplace,
		searchReplace,
		edit_file,
		searchFiles,
		switchMode,
		updateTodoList,
		writeToFile,
	].map((item) => {
		if (item.type === "function") {
			return {
				...item,
				function: {
					...item.function,
					description: useLitePrompts ? getLiteDescription(item) : item.function.description,
				},
			}
		}
		return item
	}) satisfies OpenAI.Chat.ChatCompletionTool[]
}

// Backward compatibility: export default tools with line ranges enabled
export const nativeTools = getNativeTools()
