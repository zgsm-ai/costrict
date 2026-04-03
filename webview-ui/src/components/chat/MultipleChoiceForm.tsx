import { useState, useCallback, useEffect, useMemo } from "react"
import { Timer } from "lucide-react"
import { Trans } from "react-i18next"

import { Button } from "@/components/ui"
import { cn } from "@/lib/utils"
import { useExtensionState } from "@src/context/ExtensionStateContext"
import { useAppTranslation } from "@src/i18n/TranslationContext"
import type { MultipleChoiceData, MultipleChoiceQuestionResponse, MultipleChoiceResponse } from "@roo-code/types"

const DEFAULT_FOLLOWUP_TIMEOUT_MS = 60000
const COUNTDOWN_INTERVAL_MS = 1000

const getRecommendedOptionId = (question: MultipleChoiceData["questions"][number]): string | undefined => {
	return question.options.find((option) => option.recommended)?.id ?? question.options[0]?.id
}

const createDefaultSelections = (data: MultipleChoiceData): MultipleChoiceResponse => {
	const initialSelections: MultipleChoiceResponse = {}

	for (const question of data.questions || []) {
		const existingResponse = data.userResponse?.[question.id]

		if (Array.isArray(existingResponse)) {
			initialSelections[question.id] = { selectedOptionIds: existingResponse }
			continue
		}

		if (existingResponse) {
			initialSelections[question.id] = {
				selectedOptionIds: existingResponse.selectedOptionIds || [],
				customAnswer: existingResponse.customAnswer,
			}
			continue
		}

		const recommendedOptionId = getRecommendedOptionId(question)
		initialSelections[question.id] = {
			selectedOptionIds: recommendedOptionId ? [recommendedOptionId] : [],
		}
	}

	return initialSelections
}

const normalizeQuestionResponse = (response?: MultipleChoiceResponse[string]): MultipleChoiceQuestionResponse => {
	if (Array.isArray(response)) {
		return { selectedOptionIds: response }
	}

	return {
		selectedOptionIds: response?.selectedOptionIds || [],
		customAnswer: response?.customAnswer,
	}
}

interface MultipleChoiceFormProps {
	data: MultipleChoiceData
	onSubmit: (response: MultipleChoiceResponse) => void
	isAnswered?: boolean
	onCancelAutoApproval?: () => void
}

export const MultipleChoiceForm = ({
	data,
	onSubmit,
	isAnswered = false,
	onCancelAutoApproval,
}: MultipleChoiceFormProps) => {
	const { t } = useAppTranslation()
	const { autoApprovalEnabled, alwaysAllowFollowupQuestions, followupAutoApproveTimeoutMs } = useExtensionState()
	const [selections, setSelections] = useState<MultipleChoiceResponse>(() => createDefaultSelections(data))
	const [submitted, setSubmitted] = useState(isAnswered)
	const [collapsed, setCollapsed] = useState(isAnswered)
	const [countdown, setCountdown] = useState<number | null>(null)
	const [hasUserInteracted, setHasUserInteracted] = useState(false)

	const getInitialSubmitAction = (): "confirm" | "skip" | null => {
		if (!isAnswered || !data.userResponse) return null
		return (data.userResponse as any).__skipped ? "skip" : "confirm"
	}
	const [submitAction, setSubmitAction] = useState<"confirm" | "skip" | null>(getInitialSubmitAction())

	useEffect(() => {
		setSubmitted(isAnswered)
	}, [isAnswered])

	useEffect(() => {
		setSelections(createDefaultSelections(data))
		setHasUserInteracted(false)
	}, [data])

	useEffect(() => {
		if (isAnswered && data.userResponse) {
			setSubmitAction((data.userResponse as any).__skipped ? "skip" : "confirm")
		}
	}, [isAnswered, data.userResponse])

	const defaultSelections = useMemo(() => createDefaultSelections(data), [data])

	useEffect(() => {
		//costrict: keep multiple_choice auto-approval enablement aligned with followup countdown gating
		if (
			autoApprovalEnabled &&
			alwaysAllowFollowupQuestions &&
			!isAnswered &&
			!submitted &&
			!hasUserInteracted &&
			data.questions.length > 0
		) {
			const timeoutMs =
				typeof followupAutoApproveTimeoutMs === "number" && !isNaN(followupAutoApproveTimeoutMs)
					? followupAutoApproveTimeoutMs
					: DEFAULT_FOLLOWUP_TIMEOUT_MS

			setCountdown(Math.floor(timeoutMs / 1000))

			const intervalId = setInterval(() => {
				setCountdown((prevCountdown) => {
					if (prevCountdown === null || prevCountdown <= 1) {
						clearInterval(intervalId)
						return null
					}
					return prevCountdown - 1
				})
			}, COUNTDOWN_INTERVAL_MS)

			const timeoutId = window.setTimeout(() => {
				if (isAnswered) {
					return
				}
				setSubmitAction("confirm")
				setSubmitted(true)
				onSubmit(defaultSelections)
			}, timeoutMs)

			return () => {
				//costrict: keep backend auto-approval timeout in sync when multiple_choice countdown stops or unmounts
				onCancelAutoApproval?.()
				clearInterval(intervalId)
				window.clearTimeout(timeoutId)
			}
		}

		setCountdown(null)
	}, [
		autoApprovalEnabled,
		alwaysAllowFollowupQuestions,
		data.questions.length,
		defaultSelections,
		followupAutoApproveTimeoutMs,
		hasUserInteracted,
		isAnswered,
		onCancelAutoApproval,
		onSubmit,
		submitted,
	])

	const handleToggleOption = useCallback(
		(questionId: string, optionId: string, allowMultiple: boolean) => {
			//costrict: cancel backend auto-approval as soon as the user manually changes a multiple_choice selection
			onCancelAutoApproval?.()
			setHasUserInteracted(true)
			setSelections((prev) => {
				const currentResponse = normalizeQuestionResponse(prev[questionId])
				const currentSelections = currentResponse.selectedOptionIds

				if (allowMultiple) {
					if (currentSelections.includes(optionId)) {
						return {
							...prev,
							[questionId]: {
								...currentResponse,
								selectedOptionIds: currentSelections.filter((id) => id !== optionId),
							},
						}
					}

					return {
						...prev,
						[questionId]: {
							...currentResponse,
							selectedOptionIds: [...currentSelections, optionId],
						},
					}
				}

				return {
					...prev,
					[questionId]: {
						selectedOptionIds: [optionId],
						customAnswer: undefined,
					},
				}
			})
		},
		[onCancelAutoApproval],
	)

	const handleCustomToggle = useCallback(
		(questionId: string, allowMultiple: boolean) => {
			//costrict: cancel backend auto-approval as soon as the user manually enters the custom-answer path
			onCancelAutoApproval?.()
			setHasUserInteracted(true)
			setSelections((prev) => {
				const currentResponse = normalizeQuestionResponse(prev[questionId])
				const hasCustomAnswer = currentResponse.customAnswer !== undefined

				return {
					...prev,
					[questionId]: {
						selectedOptionIds: allowMultiple ? currentResponse.selectedOptionIds : [],
						customAnswer: hasCustomAnswer ? undefined : "",
					},
				}
			})
		},
		[onCancelAutoApproval],
	)

	const handleCustomAnswerChange = useCallback(
		(questionId: string, value: string) => {
			//costrict: cancel backend auto-approval as soon as the user types a custom answer
			onCancelAutoApproval?.()
			setHasUserInteracted(true)
			setSelections((prev) => ({
				...prev,
				[questionId]: {
					...normalizeQuestionResponse(prev[questionId]),
					customAnswer: value,
				},
			}))
		},
		[onCancelAutoApproval],
	)

	const questions = useMemo(() => data?.questions || [], [data])
	const normalizedSelections = useMemo(() => {
		const result: Record<string, MultipleChoiceQuestionResponse> = {}
		for (const question of questions) {
			result[question.id] = normalizeQuestionResponse(selections[question.id])
		}
		return result
	}, [questions, selections])

	const isFormValid = questions.every((question) => {
		const response = normalizedSelections[question.id]
		const hasSelectedOption = response.selectedOptionIds.length > 0
		const hasCustomAnswer = Boolean(response.customAnswer?.trim())
		const hasInvalidEmptyCustom = response.customAnswer !== undefined && !response.customAnswer.trim()
		return !hasInvalidEmptyCustom && (hasSelectedOption || hasCustomAnswer)
	})

	const hasInvalidCustomByQuestion = useMemo(() => {
		const result: Record<string, boolean> = {}
		for (const question of questions) {
			const response = normalizedSelections[question.id]
			result[question.id] = response.customAnswer !== undefined && !response.customAnswer.trim()
		}
		return result
	}, [questions, normalizedSelections])

	const answeredCount = questions.filter((question) => {
		const response = normalizedSelections[question.id]
		return response.selectedOptionIds.length > 0 || Boolean(response.customAnswer?.trim())
	}).length
	const totalCount = questions.length

	const handleSubmit = useCallback(() => {
		setSubmitAction("confirm")
		setSubmitted(true)
		onSubmit(selections)
	}, [selections, onSubmit])

	const handleSkip = useCallback(() => {
		setSubmitAction("skip")
		setSubmitted(true)
		onSubmit({ __skipped: true } as any)
	}, [onSubmit])

	const toggleCollapse = useCallback(() => {
		setCollapsed((prev) => !prev)
	}, [])

	return (
		<div className="flex flex-col my-2 bg-vscode-sideBar-background border border-vscode-panel-border rounded-lg shadow-sm">
			<div
				className={cn(
					"flex items-center gap-2 px-4 py-2.5 transition-colors border-b border-vscode-panel-border/30",
					"cursor-pointer hover:bg-vscode-list-hoverBackground",
				)}
				onClick={toggleCollapse}>
				<i
					className={cn(
						"codicon text-[12px] text-vscode-descriptionForeground transition-transform",
						collapsed ? "codicon-chevron-right" : "codicon-chevron-down",
					)}
				/>
				<div className="flex-1 flex items-baseline gap-1.5">
					<span className="text-[13px] font-semibold text-vscode-foreground leading-relaxed">
						{data.title || t("chat:multipleChoice.questionnaire")}
					</span>
					<span
						className={cn(
							"text-[11px] font-medium transition-colors",
							answeredCount === totalCount
								? "text-vscode-testing-iconPassed"
								: "text-vscode-descriptionForeground",
						)}>
						({answeredCount}/{totalCount})
					</span>
					{submitted && submitAction && (
						<span className="text-[11px] text-vscode-descriptionForeground italic">
							(
							{submitAction === "skip"
								? t("chat:multipleChoice.userSkipped")
								: t("chat:multipleChoice.userConfirmed")}
							)
						</span>
					)}
				</div>
				{!submitted && (
					<span className="text-[11px] text-vscode-descriptionForeground opacity-60">
						{collapsed ? t("chat:multipleChoice.expand") : t("chat:multipleChoice.collapse")}
					</span>
				)}
			</div>

			{!collapsed && (
				<>
					{countdown !== null && !submitted && (
						//costrict: keep the countdown visible while only the question list scrolls
						<div className="mx-4 mt-4 text-[11px] text-vscode-descriptionForeground rounded-md border border-vscode-panel-border bg-vscode-editor-background px-3 py-2">
							<Timer className="size-3 inline-block -mt-0.5 mr-1 animate-pulse" />
							{t("chat:multipleChoice.autoSelectCountdown", { countdown })}
						</div>
					)}
					<div className="flex flex-col gap-2.5 p-4 max-h-100 overflow-y-auto">
						{questions.map((question, qIndex) => {
							const response = normalizedSelections[question.id]
							const currentSelections = response.selectedOptionIds
							const customAnswer = response.customAnswer ?? ""
							const customSelected = response.customAnswer !== undefined
							const hasInvalidCustom = hasInvalidCustomByQuestion[question.id]
							const selectionTypeLabel = question.allow_multiple
								? t("chat:multipleChoice.multiSelect")
								: t("chat:multipleChoice.singleSelect")

							return (
								<div key={question.id} className="flex flex-col gap-2">
									<div className="flex items-baseline gap-1.5">
										<span className="text-vscode-descriptionForeground text-[12px] font-medium shrink-0">
											{qIndex + 1}.
										</span>
										<div className="flex-1">
											<span className="text-[12px] text-vscode-foreground font-medium leading-snug">
												{question.prompt}
											</span>
											<span className="ml-2 text-[10px] text-vscode-descriptionForeground opacity-70">
												({selectionTypeLabel})
											</span>
										</div>
									</div>

									<div className="flex flex-col gap-1.5">
										{question.options.map((option, optIndex) => {
											const isSelected = currentSelections.includes(option.id)
											const optionLetter = String.fromCharCode(65 + optIndex)

											return (
												<div
													key={option.id}
													onClick={
														submitted
															? undefined
															: () =>
																	handleToggleOption(
																		question.id,
																		option.id,
																		question.allow_multiple || false,
																	)
													}
													className={cn(
														"flex items-center gap-2 px-2.5 py-2 rounded-md",
														"border transition-all duration-200",
														"border-vscode-panel-border bg-vscode-editor-background",
														!submitted && [
															"cursor-pointer",
															"hover:border-vscode-focusBorder/50 hover:bg-vscode-list-hoverBackground",
														],
														submitted && "opacity-60 cursor-not-allowed",
														isSelected && [
															"border-vscode-focusBorder bg-vscode-list-activeSelectionBackground/15",
															!submitted && "shadow-sm",
														],
													)}>
													<span
														className={cn(
															"text-[11px] font-semibold shrink-0",
															isSelected
																? "text-vscode-focusBorder"
																: "text-vscode-descriptionForeground",
														)}>
														{optionLetter}.
													</span>
													<span className="text-[12px] text-vscode-foreground select-none leading-snug flex-1">
														{option.label}
														{option.recommended && (
															<span className="ml-2 inline-flex items-center rounded-sm border border-vscode-panel-border bg-vscode-badge-background/35 px-1.5 py-px text-[10px] font-medium leading-none text-vscode-descriptionForeground align-middle">
																{t("chat:multipleChoice.recommended")}
															</span>
														)}
													</span>
												</div>
											)
										})}

										<div
											onClick={
												submitted
													? undefined
													: () =>
															handleCustomToggle(
																question.id,
																question.allow_multiple || false,
															)
											}
											className={cn(
												"flex items-center gap-2 px-2.5 py-2 rounded-md",
												"border transition-all duration-200 border-vscode-panel-border bg-vscode-editor-background",
												!submitted && [
													"cursor-pointer",
													"hover:border-vscode-focusBorder/50 hover:bg-vscode-list-hoverBackground",
												],
												submitted && "opacity-60 cursor-not-allowed",
												customSelected && [
													"border-vscode-focusBorder bg-vscode-list-activeSelectionBackground/15",
													!submitted && "shadow-sm",
												],
											)}>
											<span
												className={cn(
													"text-[11px] font-semibold shrink-0",
													customSelected
														? "text-vscode-focusBorder"
														: "text-vscode-descriptionForeground",
												)}>
												{String.fromCharCode(65 + question.options.length)}.
											</span>
											<span className="text-[12px] text-vscode-foreground select-none leading-snug flex-1">
												{t("chat:multipleChoice.customAnswer")}
											</span>
										</div>

										{customSelected && (
											<input
												type="text"
												value={customAnswer}
												onChange={(event) =>
													handleCustomAnswerChange(question.id, event.target.value)
												}
												disabled={submitted}
												placeholder={t("chat:multipleChoice.customAnswerPlaceholder")}
												className="w-full rounded-md border border-vscode-input-border bg-vscode-input-background px-3 py-2 text-[12px] text-vscode-input-foreground outline-none focus:border-vscode-focusBorder"
											/>
										)}

										{customSelected && hasInvalidCustom && !submitted && (
											<div className="text-[11px] text-vscode-errorForeground leading-snug px-1">
												{t("chat:multipleChoice.customAnswerRequired")}
											</div>
										)}
									</div>
								</div>
							)
						})}
					</div>

					<div className="flex flex-col gap-2 px-4 pb-4 pt-2.5 border-t border-vscode-panel-border/50 bg-vscode-sideBar-background">
						<div className="flex items-center gap-2.5">
							<Button
								onClick={handleSubmit}
								variant="primary"
								disabled={submitted || !isFormValid}
								className={cn(
									"px-4 py-1.5 text-[12px]",
									submitted && submitAction === "confirm" && "opacity-100",
								)}>
								{submitted && submitAction === "confirm" ? "✓ " : ""}
								{t("chat:multipleChoice.confirm")}
							</Button>
							<Button
								onClick={handleSkip}
								variant="secondary"
								disabled={submitted}
								className={cn(
									"px-3 py-1.5 text-[12px]",
									submitted && submitAction === "skip" && "opacity-100",
								)}>
								{submitted && submitAction === "skip" ? "✓ " : ""}
								{t("chat:multipleChoice.skip")}
							</Button>
						</div>

						{!submitted && !isAnswered && (
							<div className="text-[10px] text-vscode-descriptionForeground leading-snug opacity-75">
								<Trans
									i18nKey="chat:multipleChoice.skipHint"
									components={{ code: <span style={{ color: "#E64545" }}></span> }}
								/>
							</div>
						)}
					</div>
				</>
			)}
		</div>
	)
}
