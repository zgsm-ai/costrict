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

export const fixNativeToolArgKey = <TName extends ToolName>(toolCall: {
	id: string
	name: TName
	arguments: string
}) => {
	if (!toolCall.arguments.includes("<arg_key>")) return toolCall.arguments

	try {
		const format = parseJSON(toolCall.arguments)
		Object.entries(format).forEach(([key, value]) => {
			console.log("fixNativeToolArgKey key", key)

			if (!key.includes("<arg_key>")) {
				return
			}
			const newKey = key.split("<arg_key>").pop() as string
			format[newKey] = value
			console.log(`${toolCall.name}|${toolCall.id}: ${key} -> ${newKey}`)
			delete format[key]
		})

		return JSON.stringify(format)
	} catch (error) {
		console.log(`${toolCall.name}|${toolCall.id}: ${error.message}`)

		return toolCall.arguments
	}
}
