/**
 * OpenCode Permission Dialog Component
 *
 * Displays a permission request from OpenCode and allows the user to approve or deny it.
 */

import React from "react"
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@src/components/ui"
import { Button } from "@src/components/ui"
import { Shield, AlertTriangle, CheckCircle } from "lucide-react"

interface PermissionDetails {
	tool: string
	action: string
	resource?: string
	reason?: string
}

interface OpenCodePermissionDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	requestId: string
	details: PermissionDetails
	onResponse: (requestId: string, approved: boolean, remember: boolean) => void
}

/**
 * Format tool name for display
 */
function formatToolName(tool: string): string {
	return tool
		.split("_")
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ")
}

export const OpenCodePermissionDialog: React.FC<OpenCodePermissionDialogProps> = ({
	open,
	onOpenChange,
	requestId,
	details,
	onResponse,
}) => {
	const handleResponse = (approved: boolean, remember: boolean) => {
		onResponse(requestId, approved, remember)
		onOpenChange(false)
	}

	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent className="max-w-md">
				<AlertDialogHeader>
					<div className="flex items-center gap-2 mb-2">
						<Shield className="h-5 w-5 text-yellow-500" />
						<AlertDialogTitle className="text-lg">Permission Request</AlertDialogTitle>
					</div>
					<AlertDialogDescription className="text-base space-y-3">
						<div>
							<span className="font-semibold">OpenCode</span> is requesting permission to perform an
							action:
						</div>

						<div className="bg-muted/50 rounded-md p-3 space-y-2">
							<div className="flex items-start gap-2">
								<span className="font-medium text-foreground min-w-[80px]">Tool:</span>
								<span className="text-foreground">{formatToolName(details.tool)}</span>
							</div>

							<div className="flex items-start gap-2">
								<span className="font-medium text-foreground min-w-[80px]">Action:</span>
								<span className="text-foreground">{details.action}</span>
							</div>

							{details.resource && (
								<div className="flex items-start gap-2">
									<span className="font-medium text-foreground min-w-[80px]">Resource:</span>
									<span className="text-foreground break-all font-mono text-sm">
										{details.resource}
									</span>
								</div>
							)}

							{details.reason && (
								<div className="flex items-start gap-2">
									<span className="font-medium text-foreground min-w-[80px]">Reason:</span>
									<span className="text-foreground">{details.reason}</span>
								</div>
							)}
						</div>

						<div className="flex items-start gap-2 text-sm text-yellow-600 dark:text-yellow-500">
							<AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
							<span>Review the details carefully before granting permission.</span>
						</div>
					</AlertDialogDescription>
				</AlertDialogHeader>

				<AlertDialogFooter className="flex-col sm:flex-row gap-2">
					<AlertDialogCancel
						onClick={() => handleResponse(false, false)}
						className="bg-vscode-button-secondaryBackground hover:bg-vscode-button-secondaryHoverBackground text-vscode-button-secondaryForeground border-vscode-button-border">
						Deny
					</AlertDialogCancel>

					<Button
						variant="outline"
						onClick={() => handleResponse(true, false)}
						className="bg-vscode-button-background hover:bg-vscode-button-hoverBackground text-vscode-button-foreground">
						<CheckCircle className="h-4 w-4 mr-2" />
						Allow Once
					</Button>

					<Button
						variant="secondary"
						onClick={() => handleResponse(true, true)}
						className="bg-green-600 hover:bg-green-700 text-white">
						<CheckCircle className="h-4 w-4 mr-2" />
						Always Allow
					</Button>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	)
}

export default OpenCodePermissionDialog
