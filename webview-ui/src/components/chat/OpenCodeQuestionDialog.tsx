/**
 * OpenCode Question Dialog Component
 *
 * Displays a question from OpenCode and allows the user to provide answers.
 */

import React, { useState, useCallback } from "react"
import {
	AlertDialog,
	// AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@src/components/ui"
import { Button } from "@src/components/ui"
import { Input } from "@src/components/ui"
import { Checkbox } from "@src/components/ui"
import { RadioGroup, RadioGroupItem } from "@src/components/ui"
// import { Label } from "@src/components/ui"
import { HelpCircle, CheckCircle } from "lucide-react"
// import { cn } from "@src/lib/utils"

interface OpenCodeQuestionDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	requestId: string
	question: string
	options?: string[]
	multiSelect?: boolean
	onResponse: (requestId: string, answers: string[]) => void
}

export const OpenCodeQuestionDialog: React.FC<OpenCodeQuestionDialogProps> = ({
	open,
	onOpenChange,
	requestId,
	question,
	options,
	multiSelect = false,
	onResponse,
}) => {
	const [selectedOptions, setSelectedOptions] = useState<Set<string>>(new Set())
	const [textAnswer, setTextAnswer] = useState("")

	const hasOptions = options && options.length > 0

	const handleOptionToggle = useCallback(
		(option: string) => {
			setSelectedOptions((prev) => {
				const newSet = new Set(prev)
				if (multiSelect) {
					// Multi-select: toggle
					if (newSet.has(option)) {
						newSet.delete(option)
					} else {
						newSet.add(option)
					}
				} else {
					// Single-select: replace
					newSet.clear()
					newSet.add(option)
				}
				return newSet
			})
		},
		[multiSelect]
	)

	const handleSubmit = useCallback(() => {
		let answers: string[]

		if (hasOptions) {
			answers = Array.from(selectedOptions)
		} else {
			answers = textAnswer.trim() ? [textAnswer.trim()] : []
		}

		if (answers.length === 0) {
			return // Don't submit if no answer provided
		}

		onResponse(requestId, answers)
		onOpenChange(false)

		// Reset state
		setSelectedOptions(new Set())
		setTextAnswer("")
	}, [hasOptions, selectedOptions, textAnswer, requestId, onResponse, onOpenChange])

	const handleCancel = useCallback(() => {
		onOpenChange(false)
		setSelectedOptions(new Set())
		setTextAnswer("")
	}, [onOpenChange])

	const isValid = hasOptions ? selectedOptions.size > 0 : textAnswer.trim().length > 0

	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent className="max-w-md">
				<AlertDialogHeader>
					<div className="flex items-center gap-2 mb-2">
						<HelpCircle className="h-5 w-5 text-blue-500" />
						<AlertDialogTitle className="text-lg">Question from OpenCode</AlertDialogTitle>
					</div>
					<AlertDialogDescription className="text-base space-y-4">
						<div className="font-medium text-foreground">{question}</div>

						{hasOptions ? (
							<div className="space-y-2">
								{multiSelect ? (
									// Multi-select with checkboxes
									<div className="space-y-2">
										{options.map((option) => (
											<div key={option} className="flex items-center space-x-2">
												<Checkbox
													id={option}
													checked={selectedOptions.has(option)}
													onCheckedChange={() => handleOptionToggle(option)}
												/>
												<div
													// htmlFor={option}
													className="text-sm font-normal cursor-pointer flex-1">
													{option}
												</div>
											</div>
										))}
									</div>
								) : (
									// Single-select with radio buttons
									<RadioGroup
										value={Array.from(selectedOptions)[0] || ""}
										onValueChange={handleOptionToggle}>
										{options.map((option) => (
											<div key={option} className="flex items-center space-x-2">
												<RadioGroupItem value={option} id={option} />
												<div
													// htmlFor={option}
													className="text-sm font-normal cursor-pointer flex-1">
													{option}
												</div>
											</div>
										))}
									</RadioGroup>
								)}
								{multiSelect && (
									<div className="text-xs text-muted-foreground mt-2">
										Select one or more options
									</div>
								)}
							</div>
						) : (
							// Text input for free-form answers
							<div className="space-y-2">
								<Input
									type="text"
									placeholder="Type your answer here..."
									value={textAnswer}
									onChange={(e) => setTextAnswer(e.target.value)}
									onKeyDown={(e) => {
										if (e.key === "Enter" && isValid) {
											handleSubmit()
										}
									}}
									className="w-full"
									autoFocus
								/>
							</div>
						)}
					</AlertDialogDescription>
				</AlertDialogHeader>

				<AlertDialogFooter className="flex-col sm:flex-row gap-2">
					<AlertDialogCancel
						onClick={handleCancel}
						className="bg-vscode-button-secondaryBackground hover:bg-vscode-button-secondaryHoverBackground text-vscode-button-secondaryForeground border-vscode-button-border">
						Cancel
					</AlertDialogCancel>

					<Button
						variant="primary"
						onClick={handleSubmit}
						disabled={!isValid}
						className="bg-vscode-button-background hover:bg-vscode-button-hoverBackground text-vscode-button-foreground disabled:opacity-50">
						<CheckCircle className="h-4 w-4 mr-2" />
						Submit
					</Button>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	)
}

export default OpenCodeQuestionDialog
