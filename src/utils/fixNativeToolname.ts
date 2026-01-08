import { ToolName } from "@roo-code/types"

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
