/**
 * OpenCode Tool Block Component
 *
 * Displays a tool call from OpenCode with its status, input, and output.
 */

import { useState, memo } from "react"
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react"
import { cn } from "@src/lib/utils"
import CodeBlock from "@src/components/common/CodeBlock"
import { Button } from "@src/components/ui"
import type { ToolPart } from "@src/types/opencode"

interface OpenCodeToolBlockProps {
	tool: ToolPart
	className?: string
}

/**
 * Get tool display name (convert snake_case to Title Case)
 */
function getToolDisplayName(toolName: string): string {
	return toolName
		.split("_")
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ")
}

/**
 * Format tool input for display
 */
function formatToolInput(input: Record<string, any>): string {
	try {
		return JSON.stringify(input, null, 2)
	} catch (error) {
		return String(input)
	}
}

/**
 * Get status icon and color
 */
function getStatusDisplay(status: ToolPart["status"]) {
	switch (status) {
		case "pending":
			return {
				icon: <Loader2 className="h-4 w-4 animate-spin" />,
				text: "Pending",
				color: "text-yellow-500",
				bgColor: "bg-yellow-500/10",
			}
		case "running":
			return {
				icon: <Loader2 className="h-4 w-4 animate-spin" />,
				text: "Running",
				color: "text-blue-500",
				bgColor: "bg-blue-500/10",
			}
		case "completed":
			return {
				icon: <span className="text-green-500">✓</span>,
				text: "Completed",
				color: "text-green-500",
				bgColor: "bg-green-500/10",
			}
		case "error":
			return {
				icon: <span className="text-red-500">✗</span>,
				text: "Failed",
				color: "text-red-500",
				bgColor: "bg-red-500/10",
			}
		default:
			return {
				icon: null,
				text: "Unknown",
				color: "text-gray-500",
				bgColor: "bg-gray-500/10",
			}
	}
}

export const OpenCodeToolBlock = memo(({ tool, className }: OpenCodeToolBlockProps) => {
	const [isExpanded, setIsExpanded] = useState(false)
	const statusDisplay = getStatusDisplay(tool.status)
	const hasOutput = Boolean(tool.output || tool.error)
	const isActive = tool.status === "pending" || tool.status === "running"

	return (
		<div className={cn("rounded-lg border border-border overflow-hidden", className)}>
			{/* Header */}
			<div
				className={cn(
					"flex items-center gap-2 px-4 py-2 cursor-pointer select-none",
					statusDisplay.bgColor,
					"hover:opacity-80 transition-opacity"
				)}
				onClick={() => setIsExpanded(!isExpanded)}
			>
				{/* Expand/Collapse Icon */}
				<Button variant="ghost" size="icon" className="h-5 w-5 p-0">
					{isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
				</Button>

				{/* Status Icon */}
				<div className="flex-shrink-0">{statusDisplay.icon}</div>

				{/* Tool Name */}
				<div className="font-semibold flex-1">
					{getToolDisplayName(tool.name)}
				</div>

				{/* Status Badge */}
				<div className={cn("text-xs font-medium px-2 py-0.5 rounded-full", statusDisplay.color, statusDisplay.bgColor)}>
					{statusDisplay.text}
				</div>
			</div>

			{/* Expanded Content */}
			{isExpanded && (
				<div className="border-t border-border">
					{/* Tool Input */}
					{Object.keys(tool.input).length > 0 && (
						<div className="p-4 border-b border-border">
							<div className="text-sm font-medium mb-2 text-muted-foreground">Input:</div>
							<CodeBlock source={formatToolInput(tool.input)} language="json" />
						</div>
					)}

					{/* Tool Output */}
					{hasOutput && (
						<div className="p-4">
							{tool.error ? (
								<>
									<div className="text-sm font-medium mb-2 text-red-500">Error:</div>
									<CodeBlock source={tool.error} language="text" />
								</>
							) : tool.output ? (
								<>
									<div className="text-sm font-medium mb-2 text-muted-foreground">Output:</div>
									<CodeBlock source={tool.output} language="text" />
								</>
							) : null}
						</div>
					)}

					{/* Loading State */}
					{isActive && !hasOutput && (
						<div className="p-4 text-center text-muted-foreground">
							<Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
							<div className="text-sm">Executing...</div>
						</div>
					)}
				</div>
			)}
		</div>
	)
})

OpenCodeToolBlock.displayName = "OpenCodeToolBlock"

export default OpenCodeToolBlock
