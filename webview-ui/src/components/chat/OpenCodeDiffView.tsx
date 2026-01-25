/**
 * OpenCode Diff View Component
 *
 * Displays file diffs from OpenCode with accept/reject functionality.
 */

import React, { memo, useState, useCallback } from "react"
import { Check, X, ChevronDown, ChevronRight, File } from "lucide-react"
import { cn } from "@src/lib/utils"
import { Button } from "@src/components/ui"
import CodeAccordian from "../common/CodeAccordian"

export interface FileDiff {
	path: string
	operation: "create" | "modify" | "delete"
	old_content?: string
	new_content?: string
	diff?: string
}

interface OpenCodeDiffViewProps {
	diffs: FileDiff[]
	sessionId: string
	onAccept?: (path: string) => void
	onReject?: (path: string) => void
	onAcceptAll?: () => void
	onRejectAll?: () => void
	className?: string
}

interface DiffFileState {
	accepted?: boolean
	rejected?: boolean
}

/**
 * Get operation badge color
 */
function getOperationColor(operation: FileDiff["operation"]) {
	switch (operation) {
		case "create":
			return {
				bg: "bg-green-500/10",
				text: "text-green-600 dark:text-green-400",
				label: "Created",
			}
		case "modify":
			return {
				bg: "bg-blue-500/10",
				text: "text-blue-600 dark:text-blue-400",
				label: "Modified",
			}
		case "delete":
			return {
				bg: "bg-red-500/10",
				text: "text-red-600 dark:text-red-400",
				label: "Deleted",
			}
		default:
			return {
				bg: "bg-gray-500/10",
				text: "text-gray-600 dark:text-gray-400",
				label: "Unknown",
			}
	}
}

export const OpenCodeDiffView = memo(
	({ diffs, sessionId, onAccept, onReject, onAcceptAll, onRejectAll, className }: OpenCodeDiffViewProps) => {
		const [expandedFiles, setExpandedFiles] = useState<Record<string, boolean>>({})
		const [fileStates, setFileStates] = useState<Record<string, DiffFileState>>({})

		const handleToggleExpand = useCallback((filePath: string) => {
			setExpandedFiles((prev) => ({
				...prev,
				[filePath]: !prev[filePath],
			}))
		}, [])

		const handleAcceptFile = useCallback(
			(path: string) => {
				setFileStates((prev) => ({
					...prev,
					[path]: { accepted: true, rejected: false },
				}))
				onAccept?.(path)
			},
			[onAccept]
		)

		const handleRejectFile = useCallback(
			(path: string) => {
				setFileStates((prev) => ({
					...prev,
					[path]: { accepted: false, rejected: true },
				}))
				onReject?.(path)
			},
			[onReject]
		)

		const handleAcceptAll = useCallback(() => {
			const newStates: Record<string, DiffFileState> = {}
			diffs.forEach((diff) => {
				newStates[diff.path] = { accepted: true, rejected: false }
			})
			setFileStates(newStates)
			onAcceptAll?.()
		}, [diffs, onAcceptAll])

		const handleRejectAll = useCallback(() => {
			const newStates: Record<string, DiffFileState> = {}
			diffs.forEach((diff) => {
				newStates[diff.path] = { accepted: false, rejected: true }
			})
			setFileStates(newStates)
			onRejectAll?.()
		}, [diffs, onRejectAll])

		if (!diffs || diffs.length === 0) {
			return null
		}

		const acceptedCount = Object.values(fileStates).filter((s) => s.accepted).length
		const rejectedCount = Object.values(fileStates).filter((s) => s.rejected).length
		const pendingCount = diffs.length - acceptedCount - rejectedCount

		return (
			<div className={cn("space-y-3", className)}>
				{/* Header with stats and bulk actions */}
				<div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border border-border">
					<div className="flex items-center gap-4 text-sm">
						<div>
							<span className="font-semibold">{diffs.length}</span> file{diffs.length !== 1 ? "s" : ""}{" "}
							changed
						</div>
						{pendingCount > 0 && (
							<div className="text-muted-foreground">
								<span className="font-medium">{pendingCount}</span> pending
							</div>
						)}
						{acceptedCount > 0 && (
							<div className="text-green-600 dark:text-green-400">
								<span className="font-medium">{acceptedCount}</span> accepted
							</div>
						)}
						{rejectedCount > 0 && (
							<div className="text-red-600 dark:text-red-400">
								<span className="font-medium">{rejectedCount}</span> rejected
							</div>
						)}
					</div>

					{/* Bulk action buttons */}
					<div className="flex items-center gap-2">
						<Button size="sm" variant="outline" onClick={handleAcceptAll} className="gap-1">
							<Check className="h-3.5 w-3.5" />
							Accept All
						</Button>
						<Button size="sm" variant="outline" onClick={handleRejectAll} className="gap-1">
							<X className="h-3.5 w-3.5" />
							Reject All
						</Button>
					</div>
				</div>

				{/* File list */}
				<div className="space-y-2">
					{diffs.map((diff) => {
						const isExpanded = expandedFiles[diff.path] || false
						const fileState = fileStates[diff.path]
						const opColor = getOperationColor(diff.operation)

						return (
							<div
								key={diff.path}
								className={cn(
									"border border-border rounded-lg overflow-hidden",
									fileState?.accepted && "border-green-500/50 bg-green-500/5",
									fileState?.rejected && "border-red-500/50 bg-red-500/5"
								)}>
								{/* File header */}
								<div
									className={cn(
										"flex items-center justify-between p-3 cursor-pointer hover:bg-muted/50 transition-colors",
										isExpanded && "border-b border-border"
									)}
									onClick={() => handleToggleExpand(diff.path)}>
									<div className="flex items-center gap-2 flex-1 min-w-0">
										{/* Expand icon */}
										{isExpanded ? (
											<ChevronDown className="h-4 w-4 flex-shrink-0" />
										) : (
											<ChevronRight className="h-4 w-4 flex-shrink-0" />
										)}

										{/* File icon */}
										<File className="h-4 w-4 flex-shrink-0 text-muted-foreground" />

										{/* File path */}
										<span className="font-mono text-sm truncate" title={diff.path}>
											{diff.path}
										</span>

										{/* Operation badge */}
										<span
											className={cn(
												"px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0",
												opColor.bg,
												opColor.text
											)}>
											{opColor.label}
										</span>

										{/* Status badge */}
										{fileState?.accepted && (
											<span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/10 text-green-600 dark:text-green-400 flex-shrink-0">
												Accepted
											</span>
										)}
										{fileState?.rejected && (
											<span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-600 dark:text-red-400 flex-shrink-0">
												Rejected
											</span>
										)}
									</div>

									{/* Action buttons */}
									<div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
										{!fileState?.accepted && (
											<Button
												size="sm"
												variant="ghost"
												onClick={() => handleAcceptFile(diff.path)}
												className="gap-1 text-green-600 hover:text-green-700 hover:bg-green-500/10">
												<Check className="h-3.5 w-3.5" />
												Accept
											</Button>
										)}
										{!fileState?.rejected && (
											<Button
												size="sm"
												variant="ghost"
												onClick={() => handleRejectFile(diff.path)}
												className="gap-1 text-red-600 hover:text-red-700 hover:bg-red-500/10">
												<X className="h-3.5 w-3.5" />
												Reject
											</Button>
										)}
									</div>
								</div>

								{/* Diff content */}
								{isExpanded && diff.diff && (
									<div className="p-3 bg-background">
										<CodeAccordian
											path={diff.path}
											code={diff.diff}
											language="diff"
											isExpanded={true}
											onToggleExpand={() => {}}
										/>
									</div>
								)}
							</div>
						)
					})}
				</div>
			</div>
		)
	}
)

OpenCodeDiffView.displayName = "OpenCodeDiffView"

export default OpenCodeDiffView
