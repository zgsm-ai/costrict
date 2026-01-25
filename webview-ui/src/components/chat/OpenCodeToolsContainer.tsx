/**
 * OpenCode Tools Container Component
 *
 * Container for displaying multiple tool calls from an OpenCode message.
 */

import { memo } from "react"
import { cn } from "@src/lib/utils"
import OpenCodeToolBlock from "./OpenCodeToolBlock"
import type { ToolPart } from "@src/types/opencode"

interface OpenCodeToolsContainerProps {
	tools: ToolPart[]
	className?: string
}

export const OpenCodeToolsContainer = memo(({ tools, className }: OpenCodeToolsContainerProps) => {
	if (tools.length === 0) {
		return null
	}

	return (
		<div className={cn("space-y-2", className)}>
			{tools.map((tool) => (
				<OpenCodeToolBlock key={tool.id} tool={tool} />
			))}
		</div>
	)
})

OpenCodeToolsContainer.displayName = "OpenCodeToolsContainer"

export default OpenCodeToolsContainer
