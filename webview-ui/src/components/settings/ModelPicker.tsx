import { useMemo, useState, useCallback, useEffect, useRef, useLayoutEffect } from "react"
import { VSCodeLink } from "@vscode/webview-ui-toolkit/react"
import { Trans } from "react-i18next"
import { ChevronsUpDown, Check, X, ChevronUp } from "lucide-react"

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
	| "glamaModelId"
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
	| "ioIntelligenceModelId"
	| "vercelAiGatewayModelId"
>

interface ModelPickerProps {
	defaultModelId: string
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
	organizationAllowList: OrganizationAllowList
	errorMessage?: string
	showInfoView?: boolean
	showLabel?: boolean
	triggerClassName?: string
	popoverContentClassName?: string
	PopoverTriggerContentClassName?: string
	buttonIconType?: "upDown" | "up"
	tooltip?: string
	onOpenChange?: (open: boolean) => Promise<boolean> | boolean
	isLoadingModels?: boolean
	shouldAutoOpenAfterLoad?: boolean
}

export const ModelPicker = ({
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
	triggerClassName = "",
	popoverContentClassName = "",
	PopoverTriggerContentClassName = "",
	buttonIconType = "upDown",
	tooltip,
	onOpenChange: externalOnOpenChange,
	isLoadingModels = false,
	shouldAutoOpenAfterLoad = false,
}: ModelPickerProps) => {
	const { t } = useAppTranslation()

	const [open, setOpen] = useState(false)
	const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false)
	const isInitialized = useRef(false)
	const searchInputRef = useRef<HTMLInputElement>(null)
	const selectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
	const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null)
	const [pendingOpen, setPendingOpen] = useState(false)

	const modelIds = useMemo(() => {
		const filteredModels = filterModels(models, apiConfiguration.apiProvider, organizationAllowList)

		return Object.keys(filteredModels ?? {}).sort((a, b) => a.localeCompare(b))
	}, [models, apiConfiguration.apiProvider, organizationAllowList])

	const { id: selectedModelId, info: selectedModelInfo } = useSelectedModel(apiConfiguration)

	const [searchValue, setSearchValue] = useState(
		(apiConfiguration.apiProvider === "zgsm" ? "" : selectedModelId) || "",
	)

	const onSelect = useCallback(
		(modelId: string) => {
			if (!modelId) {
				return
			}

			setOpen(false)
			setApiConfigurationField(modelIdKey, modelId)

			// Clear any existing timeout
			if (selectTimeoutRef.current) {
				clearTimeout(selectTimeoutRef.current)
			}

			// Delay to ensure the popover is closed before setting the search value.
			selectTimeoutRef.current = setTimeout(
				() => setSearchValue(apiConfiguration.apiProvider === "zgsm" ? "" : modelId),
				100,
			)
		},
		[apiConfiguration.apiProvider, modelIdKey, setApiConfigurationField],
	)

	const onOpenChange = useCallback(
		async (open: boolean) => {
			if (open && externalOnOpenChange) {
				const result = await externalOnOpenChange(open)
				if (result === false) {
					setPendingOpen(true)
					return
				}
			}

			setOpen(open)
			setPendingOpen(false)

			// Abandon the current search if the popover is closed.
			if (!open) {
				// Clear any existing timeout
				if (closeTimeoutRef.current) {
					clearTimeout(closeTimeoutRef.current)
				}

				// Clear the search value when closing instead of prefilling it
				closeTimeoutRef.current = setTimeout(
					() => () => setSearchValue(apiConfiguration.apiProvider === "zgsm" ? "" : selectedModelId),
					100,
				)
			}
		},
		[apiConfiguration.apiProvider, selectedModelId, externalOnOpenChange],
	)

	// automatically expand when data loading is complete and an expansion request is pending
	useEffect(() => {
		if (pendingOpen && !isLoadingModels && shouldAutoOpenAfterLoad) {
			setPendingOpen(false)
			setOpen(true)
		}
	}, [pendingOpen, isLoadingModels, shouldAutoOpenAfterLoad])

	const onClearSearch = useCallback(() => {
		setSearchValue("")
		searchInputRef.current?.focus()
	}, [])

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

			const popoverElement = document.querySelector('[data-testid="model-picker-content"]')
			if (popoverElement && !popoverElement.contains(event.target as Node)) {
				const triggerButton = document.querySelector('[data-testid="model-picker-button"]')
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
	}, [open])

	// Use the shared ESC key handler hook
	useEscapeKey(open, () => setOpen(false))

	return (
		<>
			<div>
				{showLabel && <label className="block font-medium mb-1">{t("settings:modelPicker.label")}</label>}
				<Popover open={open} onOpenChange={onOpenChange}>
					{tooltip ? (
						<StandardTooltip content={tooltip}>
							<PopoverTrigger asChild>
								<Button
									variant="combobox"
									role="combobox"
									aria-expanded={open}
									className={cn("w-full", "justify-between", triggerClassName)}
									data-testid="model-picker-button"
									disabled={isLoadingModels}>
									<div className={`truncate ${PopoverTriggerContentClassName}`}>
										{isLoadingModels
											? t("settings:common.loading")
											: (selectedModelId ?? t("settings:common.select"))}
									</div>
									{buttonIconType === "upDown" ? (
										<ChevronsUpDown className="opacity-50 !w-[12px]" />
									) : (
										<ChevronUp
											className={cn(
												"pointer-events-none opacity-80 !w-[12px] flex-shrink-0 size-3 transition-transform duration-200",
												open && "rotate-180",
											)}
										/>
									)}
								</Button>
							</PopoverTrigger>
						</StandardTooltip>
					) : (
						<PopoverTrigger asChild>
							<Button
								variant="combobox"
								role="combobox"
								aria-expanded={open}
								className={cn("w-full", "justify-between", triggerClassName)}
								data-testid="model-picker-button"
								disabled={isLoadingModels}>
								<div className={PopoverTriggerContentClassName}>
									{isLoadingModels
										? t("settings:common.loading")
										: (selectedModelId ?? t("settings:common.select"))}
								</div>
								{buttonIconType === "upDown" ? (
									<ChevronsUpDown className="opacity-50 !w-[12px]" />
								) : (
									<ChevronUp
										className={cn(
											"pointer-events-none opacity-80 !w-[12px] flex-shrink-0 size-3 transition-transform duration-200",
											open && "rotate-180",
										)}
									/>
								)}
							</Button>
						</PopoverTrigger>
					)}
					<PopoverContent
						className={cn(
							"p-0",
							"w-[var(--radix-popover-trigger-width)]",
							!open && "invisible",
							popoverContentClassName,
						)}
						data-testid="model-picker-content">
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
									{modelIds.map((model) => (
										<CommandItem
											key={model}
											value={model}
											onSelect={onSelect}
											data-testid={`model-option-${model}`}
											className={
												model === "Auto" ? "border-b border-vscode-dropdown-border" : ""
											}>
											<span className="truncate" title={model}>
												{model}
											</span>
											<Check
												className={cn(
													"size-4 p-0.5 ml-auto",
													model === selectedModelId ? "opacity-100" : "opacity-0",
												)}
											/>
										</CommandItem>
									))}
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
			{selectedModelId && selectedModelInfo && showInfoView && (
				<ModelInfoView
					apiProvider={apiConfiguration.apiProvider}
					selectedModelId={selectedModelId}
					modelInfo={selectedModelInfo}
					isDescriptionExpanded={isDescriptionExpanded}
					setIsDescriptionExpanded={setIsDescriptionExpanded}
				/>
			)}
			{apiConfiguration.apiProvider !== "zgsm" && showInfoView && (
				<div className="text-sm text-vscode-descriptionForeground">
					<Trans
						i18nKey="settings:modelPicker.automaticFetch"
						components={{
							serviceLink: <VSCodeLink href={serviceUrl} className="text-sm" />,
							defaultModelLink: (
								<VSCodeLink onClick={() => onSelect(defaultModelId)} className="text-sm" />
							),
						}}
						values={{ serviceName, defaultModelId }}
					/>
				</div>
			)}
		</>
	)
}
