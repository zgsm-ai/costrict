import { useMemo, useState, useCallback, useEffect, useRef, useLayoutEffect } from "react"
import { VSCodeLink } from "@vscode/webview-ui-toolkit/react"
import { Trans } from "react-i18next"
import { ChevronsUpDown, Check, X, Brain, Info } from "lucide-react"

import type { ProviderSettings, ModelInfo, OrganizationAllowList } from "@roo-code/types"

import { useAppTranslation } from "@src/i18n/TranslationContext"
import { useSelectedModel } from "@/components/ui/hooks/useSelectedModel"
import { filterModels } from "./utils/organizationFilters"
import { cn } from "@src/lib/utils"
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	Popover,
	PopoverContent,
	PopoverTrigger,
	Button,
} from "@src/components/ui"
import { useEscapeKey } from "@src/hooks/useEscapeKey"
import { StandardTooltip } from "@/components/ui"

import { ModelInfoView } from "./ModelInfoView"
import { ApiErrorMessage } from "./ApiErrorMessage"

type ModelIdKey = keyof Pick<
	ProviderSettings,
	| "openRouterModelId"
	| "unboundModelId"
	| "requestyModelId"
	| "openAiModelId"
	| "litellmModelId"
	| "zgsmModelId"
	| "apiModelId"
	| "ollamaModelId"
	| "lmStudioModelId"
	| "vsCodeLmModelSelector"
	| "deepInfraModelId"
	| "ioIntelligenceModelId"
	| "vercelAiGatewayModelId"
	| "apiModelId"
	| "ollamaModelId"
	| "lmStudioModelId"
	| "lmStudioDraftModelId"
	| "vsCodeLmModelSelector"
>

interface ModelPickerProps {
	defaultModelId: string
	modelPickerId?: string
	models: Record<string, ModelInfo> | null
	modelIdKey: ModelIdKey
	serviceName: string
	serviceUrl: string
	apiConfiguration: ProviderSettings
	setApiConfigurationField: <K extends keyof ProviderSettings>(
		field: K,
		value: ProviderSettings[K],
		isUserAction?: boolean,
	) => void
	organizationAllowList?: OrganizationAllowList
	errorMessage?: string
	showInfoView?: boolean
	showLabel?: boolean
	isChatBox?: boolean
	isStreaming?: boolean
	triggerClassName?: string
	popoverContentClassName?: string
	PopoverTriggerContentClassName?: string
	tooltip?: string
	simplifySettings?: boolean
	hidePricing?: boolean
	/** Label for the model picker field - defaults to "Model" */
	label?: string
	/** Transform model ID string to the value stored in configuration (for compound types like VSCodeLM selector) */
	valueTransform?: (modelId: string) => unknown
	/** Transform stored configuration value back to display string */
	displayTransform?: (value: unknown) => string
	/** Callback when model changes - useful for side effects like clearing related fields */
	onModelChange?: (modelId: string) => void
}

export const ModelPicker = ({
	// modelPickerId = "",
	defaultModelId,
	models,
	modelIdKey,
	serviceName,
	serviceUrl,
	apiConfiguration,
	setApiConfigurationField,
	organizationAllowList,
	errorMessage,
	showInfoView = true,
	showLabel = true,
	isStreaming = false,
	triggerClassName = "",
	popoverContentClassName = "",
	PopoverTriggerContentClassName = "",
	tooltip,
	simplifySettings,
	hidePricing,
	label,
	valueTransform,
	displayTransform,
	onModelChange,
}: ModelPickerProps) => {
	const { t } = useAppTranslation()

	const [open, setOpen] = useState(false)
	const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false)
	const isInitialized = useRef(false)
	const searchInputRef = useRef<HTMLInputElement>(null)
	const selectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
	const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null)

	const { id: selectedModelId, info: selectedModelInfo } = useSelectedModel(apiConfiguration)

	// Get the display value for the current selection
	// If displayTransform is provided, use it to convert the stored value to a display string
	const displayValue = useMemo(() => {
		if (displayTransform) {
			const storedValue = apiConfiguration[modelIdKey]
			return storedValue ? displayTransform(storedValue) : undefined
		}
		return selectedModelId
	}, [displayTransform, apiConfiguration, modelIdKey, selectedModelId])

	const modelIds = useMemo(() => {
		const filteredModels = filterModels(models, apiConfiguration.apiProvider, organizationAllowList)

		// Include the currently selected model even if deprecated (so users can see what they have selected)
		// But filter out other deprecated models from being newly selectable
		const availableModels = Object.entries(filteredModels ?? {})
			.filter(([modelId, modelInfo]) => {
				// Always include the currently selected model
				if (modelId === selectedModelId) return true
				// Filter out deprecated models that aren't currently selected
				return !modelInfo.deprecated
			})
			.reduce(
				(acc, [modelId, modelInfo]) => {
					acc[modelId] = modelInfo
					return acc
				},
				{} as Record<string, ModelInfo>,
			)

		return Object.keys(availableModels).sort((a, b) => a.localeCompare(b))
	}, [models, apiConfiguration.apiProvider, organizationAllowList, selectedModelId])

	const [searchValue, setSearchValue] = useState("")

	const onSelect = useCallback(
		(modelId: string) => {
			if (!modelId) {
				return
			}

			setOpen(false)

			// Apply value transform if provided (e.g., for VSCodeLM selector)
			const valueToStore = valueTransform ? valueTransform(modelId) : modelId
			setApiConfigurationField(modelIdKey, valueToStore as ProviderSettings[ModelIdKey])

			// Call the optional change callback
			onModelChange?.(modelId)

			// Clear any existing timeout
			if (selectTimeoutRef.current) {
				clearTimeout(selectTimeoutRef.current)
			}

			// Delay to ensure the popover is closed before setting the search value.
			selectTimeoutRef.current = setTimeout(() => setSearchValue(""), 100)
		},
		[modelIdKey, setApiConfigurationField, valueTransform, onModelChange],
	)

	const onOpenChange = useCallback((open: boolean) => {
		setOpen(open)

		// Abandon the current search if the popover is closed.
		if (!open) {
			// Clear any existing timeout
			if (closeTimeoutRef.current) {
				clearTimeout(closeTimeoutRef.current)
			}

			// Clear the search value when closing instead of prefilling it
			closeTimeoutRef.current = setTimeout(() => setSearchValue(""), 100)
		}
	}, [])

	const onClearSearch = useCallback(() => {
		setSearchValue("")
		searchInputRef.current?.focus()
	}, [])

	useEffect(() => {
		if (showLabel) {
			setOpen(false)
		}
	}, [showLabel])

	useEffect(() => {
		if (!selectedModelId && !isInitialized.current) {
			const initialValue = modelIds.includes(selectedModelId) ? selectedModelId : defaultModelId
			setApiConfigurationField(modelIdKey, initialValue, false) // false = automatic initialization
		}

		isInitialized.current = true
	}, [modelIds, setApiConfigurationField, modelIdKey, selectedModelId, defaultModelId])

	// Cleanup timeouts on unmount to prevent test flakiness
	useEffect(() => {
		return () => {
			if (selectTimeoutRef.current) {
				clearTimeout(selectTimeoutRef.current)
			}
			if (closeTimeoutRef.current) {
				clearTimeout(closeTimeoutRef.current)
			}
		}
	}, [])

	// Close dropdown when clicking anywhere outside or on page change
	useLayoutEffect(() => {
		const handleClickAnywhere = (event: MouseEvent) => {
			if (!open) {
				return
			}

			const popoverElement = document.querySelector(`[data-testid="model-picker-content${displayValue}"]`)
			if (popoverElement && !popoverElement.contains(event.target as Node)) {
				const triggerButton = document.querySelector(`[data-testid="model-picker-button${displayValue}"]`)
				if (triggerButton && !triggerButton.contains(event.target as Node)) {
					setOpen(false)
				}
			}
		}

		const handlePageChange = (event: MessageEvent) => {
			// check messsage type only close with action
			if (event.data && event.data.type === "action") {
				if (open) {
					setOpen(false)
				}
			}
		}

		document.addEventListener("click", handleClickAnywhere)
		window.addEventListener("message", handlePageChange)

		return () => {
			document.removeEventListener("click", handleClickAnywhere)
			window.removeEventListener("message", handlePageChange)
		}
	}, [displayValue, open])

	// Use the shared ESC key handler hook
	useEscapeKey(open, () => setOpen(false))

	return (
		<>
			<div>
				{showLabel && (
					<label className="block font-medium mb-1">{label ?? t("settings:modelPicker.label")}</label>
				)}
				<Popover open={open} onOpenChange={onOpenChange}>
					<StandardTooltip content={tooltip ?? ""}>
						<PopoverTrigger asChild>
							<Button
								variant="combobox"
								role="combobox"
								aria-expanded={open}
								disabled={isStreaming}
								className={cn("w-full", "justify-between", triggerClassName)}
								data-testid={`model-picker-button${displayValue}`}>
								<div className={`truncate ${PopoverTriggerContentClassName}`}>
									{!showLabel && <Brain className="inline-block mr-1" />}
									{displayValue ?? t("settings:common.select")}
								</div>
								{showLabel && <ChevronsUpDown className="opacity-50" />}
							</Button>
						</PopoverTrigger>
					</StandardTooltip>

					<PopoverContent
						className={cn(
							"p-0",
							"w-(--radix-popover-trigger-width)",
							!open && "invisible",
							popoverContentClassName,
						)}
						align="start"
						data-testid={`model-picker-content${displayValue}`}>
						<Command>
							<div className="relative">
								<CommandInput
									ref={searchInputRef}
									value={searchValue}
									onValueChange={setSearchValue}
									placeholder={t("settings:modelPicker.searchPlaceholder")}
									className="h-9 mr-4"
									data-testid="model-input"
								/>
								{searchValue.length > 0 && (
									<div className="absolute right-2 top-0 bottom-0 flex items-center justify-center">
										<X
											className="text-vscode-input-foreground opacity-50 hover:opacity-100 size-4 p-0.5 cursor-pointer"
											onClick={onClearSearch}
										/>
									</div>
								)}
							</div>
							<CommandList>
								<CommandEmpty>
									{searchValue && (
										<div className="py-2 px-1 text-sm">
											{t("settings:modelPicker.noMatchFound")}
										</div>
									)}
								</CommandEmpty>
								<CommandGroup>
									{modelIds.map((model) => {
										const modelInfo = models?.[model]
										const creditConsumption = modelInfo?.creditConsumption
										const creditDiscount = modelInfo?.creditDiscount

										return (
											<CommandItem
												key={model}
												value={model}
												onSelect={onSelect}
												data-testid={`model-option-${model}`}
												className={cn(
													model === "Auto" ? "border-b border-vscode-dropdown-border" : "",
												)}>
												<Check
													className={cn(
														"size-4 p-0.5",
														model === displayValue ? "opacity-100" : "opacity-0",
													)}
												/>
												<span className="truncate" title={model}>
													{model}
												</span>
												{model === "Auto"
													? creditDiscount && (
															<span
																className="ml-auto text-xs text-vscode-foreground bg-vscode-statusBarItem-prominentBackground px-1.5 py-0.5 rounded border border-vscode-button-border"
																title={t("settings:autoMode.discountTitle")}>
																{t("settings:autoMode.discount", {
																	discount: `🎯 ${creditDiscount * 100}%`,
																})}
															</span>
														)
													: creditConsumption &&
														creditConsumption !== -1 && (
															<span
																className="ml-auto text-sm text-vscode-descriptionForeground"
																title={t("settings:autoMode.consumptionTitle")}>
																{creditConsumption}x credit
															</span>
														)}
											</CommandItem>
										)
									})}
								</CommandGroup>
							</CommandList>
							{searchValue && !modelIds.includes(searchValue) && (
								<div className="p-1 border-t border-vscode-input-border">
									<CommandItem data-testid="use-custom-model" value={searchValue} onSelect={onSelect}>
										{t("settings:modelPicker.useCustomModel", { modelId: searchValue })}
									</CommandItem>
								</div>
							)}
						</Command>
					</PopoverContent>
				</Popover>
			</div>
			{errorMessage && <ApiErrorMessage errorMessage={errorMessage} />}
			{selectedModelInfo?.deprecated && showInfoView && (
				<ApiErrorMessage errorMessage={t("settings:validation.modelDeprecated")} />
			)}

			{simplifySettings && showInfoView ? (
				<p className="text-xs text-vscode-descriptionForeground m-0">
					<Info className="size-3 inline mr-1" />
					{t("settings:modelPicker.simplifiedExplanation")}
				</p>
			) : (
				showInfoView && (
					<div>
						{selectedModelId && selectedModelInfo && !selectedModelInfo.deprecated && (
							<ModelInfoView
								apiProvider={apiConfiguration.apiProvider}
								selectedModelId={selectedModelId}
								modelInfo={selectedModelInfo}
								isDescriptionExpanded={isDescriptionExpanded}
								setIsDescriptionExpanded={setIsDescriptionExpanded}
								hidePricing={hidePricing}
							/>
						)}
						{!hidePricing && apiConfiguration.apiProvider !== "zgsm" && (
							<div className="text-sm text-vscode-descriptionForeground">
								<Trans
									i18nKey="settings:modelPicker.automaticFetch"
									components={{
										serviceLink: <VSCodeLink href={serviceUrl} className="text-sm" />,
										defaultModelLink: (
											<VSCodeLink onClick={() => onSelect(defaultModelId)} className="text-sm" />
										),
									}}
									values={{
										serviceName: serviceName === "zgsm" ? "Costrict" : serviceName,
										defaultModelId,
									}}
								/>
							</div>
						)}
					</div>
				)
			)}
		</>
	)
}
