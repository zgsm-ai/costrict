import { ToolName } from "@roo-code/types"
import { parseJSON } from "partial-json"

export const fixNativeToolname = (toolname: string | ToolName) => {
	if (
		!toolname ||
		(!toolname.includes("<tool_call>") && !toolname.includes("<arg_value>") && !toolname.includes("</tool_call>"))
	)
		return toolname as ToolName
	let tags = [] as Array<ToolName | string>
	let fixedToolname = toolname as ToolName
	if (fixedToolname.includes("<tool_call>")) {
		tags = fixedToolname.split("<tool_call>").sort((a, b) => b.length - a.length)
		fixedToolname = tags[0] as ToolName
	}

	if (fixedToolname.includes("</tool_call>")) {
		tags = fixedToolname.split("</tool_call>").sort((a, b) => b.length - a.length)
		fixedToolname = tags[0] as ToolName
	}

	if (fixedToolname.includes("<arg_value>")) {
		tags = fixedToolname.split("<arg_value>").sort((a, b) => b.length - a.length)
		fixedToolname = tags[0] as ToolName
	}

	return fixedToolname
}

export function fixAskMultipleChoiceFinalToolUseResult(input?: string) {
	if (!input) return "{}"

	try {
		JSON.parse(input as string) // check if it's a valid json
		return input
	} catch (error) {
		return input.replace(/'/g, '"').replace(/\b(False|True)\b/g, (match) => match.toLowerCase())
	}
}
