/**
 * OpenCode Status Badge Component
 *
 * Displays the current status of the OpenCode connection and session.
 */

import { memo } from "react"
import { Circle, Loader2, AlertCircle } from "lucide-react"
import { cn } from "@src/lib/utils"
import { StandardTooltip } from "@src/components/ui"
import type { SessionStatus } from "@src/types/opencode"

interface OpenCodeStatusBadgeProps {
	status: SessionStatus
	connected: boolean
	className?: string
}

/**
 * Get status display information
 */
function getStatusDisplay(status: SessionStatus, connected: boolean) {
	if (!connected) {
		return {
			icon: <AlertCircle className="h-3 w-3" />,
			text: "Disconnected",
			color: "text-red-500",
			bgColor: "bg-red-500/10",
			tooltip: "OpenCode service is disconnected",
		}
	}

	switch (status) {
		case "idle":
			return {
				icon: <Circle className="h-3 w-3 fill-green-500" />,
				text: "Ready",
				color: "text-green-500",
				bgColor: "bg-green-500/10",
				tooltip: "OpenCode is ready",
			}
		case "busy":
			return {
				icon: <Loader2 className="h-3 w-3 animate-spin" />,
				text: "Busy",
				color: "text-blue-500",
				bgColor: "bg-blue-500/10",
				tooltip: "OpenCode is processing",
			}
		case "retry":
			return {
				icon: <Loader2 className="h-3 w-3 animate-spin" />,
				text: "Retrying",
				color: "text-yellow-500",
				bgColor: "bg-yellow-500/10",
				tooltip: "OpenCode is retrying an operation",
			}
		case "error":
			return {
				icon: <AlertCircle className="h-3 w-3" />,
				text: "Error",
				color: "text-red-500",
				bgColor: "bg-red-500/10",
				tooltip: "OpenCode encountered an error",
			}
		default:
			return {
				icon: <Circle className="h-3 w-3" />,
				text: "Unknown",
				color: "text-gray-500",
				bgColor: "bg-gray-500/10",
				tooltip: "Unknown status",
			}
	}
}

export const OpenCodeStatusBadge = memo(({ status, connected, className }: OpenCodeStatusBadgeProps) => {
	const display = getStatusDisplay(status, connected)

	return (
		<StandardTooltip content={display.tooltip}>
			<div
				className={cn(
					"inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium",
					display.color,
					display.bgColor,
					className
				)}
			>
				{display.icon}
				<span>OpenCode: {display.text}</span>
			</div>
		</StandardTooltip>
	)
})

OpenCodeStatusBadge.displayName = "OpenCodeStatusBadge"

export default OpenCodeStatusBadge
