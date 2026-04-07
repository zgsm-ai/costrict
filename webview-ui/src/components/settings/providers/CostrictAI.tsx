import { useState, useCallback, useEffect, useRef } from "react"
import { useEvent } from "react-use"
import { Checkbox } from "vscrui"
import { VSCodeButton, VSCodeCheckbox, VSCodeLink, VSCodeTextField } from "@vscode/webview-ui-toolkit/react"

import {
	type ProviderSettings,
	type ModelInfo,
	type ReasoningEffort,
	azureOpenAiDefaultApiVersion,
	costrictModelsConfig as costrictModels,
	costrictDefaultModelId,
	OrganizationAllowList,
	ExtensionMessage,
} from "@roo-code/types"

import { useAppTranslation } from "@src/i18n/TranslationContext"
import { Button, StandardTooltip } from "@src/components/ui"

import { convertHeadersToObject } from "../utils/headers"
import { inputEventTransform, noTransform } from "../transforms"
import { ModelPicker } from "../ModelPicker"
import { R1FormatSetting } from "../R1FormatSetting"
import { ThinkingBudget } from "../ThinkingBudget"
import { SetCachedStateField } from "../types"
import { isValidUrl } from "@/utils/validate"
import { vscode } from "@/utils/vscode"
import { cn } from "@/lib/utils"
import { delay } from "lodash-es"

type OpenAICompatibleProps = {
	fromWelcomeView?: boolean
	debug?: boolean
	apiConfiguration: ProviderSettings
	setApiConfigurationField: (field: keyof ProviderSettings, value: ProviderSettings[keyof ProviderSettings]) => void
	organizationAllowList: OrganizationAllowList
	modelValidationError?: string
	useCostrictCustomConfig?: boolean
	setCachedStateField: SetCachedStateField<"useCostrictCustomConfig">
	refetchRouterModels?: () => void
}

export const CostrictAI = ({
	apiConfiguration,
	debug,
	fromWelcomeView,
	setApiConfigurationField,
	setCachedStateField,
	organizationAllowList,
	modelValidationError,
	useCostrictCustomConfig,
	refetchRouterModels,
}: OpenAICompatibleProps) => {
	const { t } = useAppTranslation()
	const [refetchingModels, setRefetchingModels] = useState(false)
	const [azureApiVersionSelected, setAzureApiVersionSelected] = useState(!!apiConfiguration?.azureApiVersion)

	// Use `ref` to track whether `includeMaxTokens` has been explicitly set by the user.
	const includeMaxTokensInitializedRef = useRef(Object.hasOwn(apiConfiguration, "includeMaxTokens"))

	const [openAiModels, setOpenAiModels] = useState<Record<string, ModelInfo> | null>(null)

	const [customHeaders, setCustomHeaders] = useState<[string, string][]>(() => {
		const headers = apiConfiguration?.openAiHeaders || {}
		return Object.entries(headers)
	})

	const handleAddCustomHeader = useCallback(() => {
		// Only update the local state to show the new row in the UI.
		setCustomHeaders((prev) => [...prev, ["", ""]])
		// Do not update the main configuration yet, wait for user input.
	}, [])

	const handleUpdateHeaderKey = useCallback((index: number, newKey: string) => {
		setCustomHeaders((prev) => {
			const updated = [...prev]

			if (updated[index]) {
				updated[index] = [newKey, updated[index][1]]
			}

			return updated
		})
	}, [])

	const handleUpdateHeaderValue = useCallback((index: number, newValue: string) => {
		setCustomHeaders((prev) => {
			const updated = [...prev]

			if (updated[index]) {
				updated[index] = [updated[index][0], newValue]
			}

			return updated
		})
	}, [])

	const handleRemoveCustomHeader = useCallback((index: number) => {
		setCustomHeaders((prev) => prev.filter((_, i) => i !== index))
	}, [])

	// Helper to convert array of tuples to object

	// Add effect to update the parent component's state when local headers change
	useEffect(() => {
		const timer = setTimeout(() => {
			const headerObject = convertHeadersToObject(customHeaders)
			setApiConfigurationField("openAiHeaders", headerObject)
		}, 300)

		return () => clearTimeout(timer)
	}, [customHeaders, setApiConfigurationField])

	useEffect(() => {
		// Set the default value only when useCostrictCustomConfig is first enabled and includeMaxTokens has never been set before.
		// Use ref to track whether includeMaxTokens has been explicitly set by the user, avoiding overriding the user's explicit selection.
		if (
			useCostrictCustomConfig &&
			!includeMaxTokensInitializedRef.current &&
			apiConfiguration?.includeMaxTokens === undefined
		) {
			setApiConfigurationField("includeMaxTokens", true)
			includeMaxTokensInitializedRef.current = true
		}
	}, [useCostrictCustomConfig, apiConfiguration?.includeMaxTokens, setApiConfigurationField])

	// Marked as initialized when the user manually modifies includeMaxTokens.
	useEffect(() => {
		if (Object.hasOwn(apiConfiguration, "includeMaxTokens")) {
			includeMaxTokensInitializedRef.current = true
		}
	}, [apiConfiguration])

	const handleInputChange = useCallback(
		<K extends keyof ProviderSettings, E>(
			field: K,
			transform: (event: E) => ProviderSettings[K] = inputEventTransform,
		) =>
			(event: E | Event) => {
				const val = transform(event as E)
				if (field === "costrictBaseUrl" && isValidUrl(val as string)) {
					setApiConfigurationField(field, (val as string)?.trim().replace(/\/$/, ""))
				} else {
					setApiConfigurationField(field, val)
				}
			},
		[setApiConfigurationField],
	)

	const onMessage = useCallback((event: MessageEvent) => {
		const message: ExtensionMessage = event.data

		switch (message.type) {
			case "costrictModels": {
				const { fullResponseData = [] } = message
				setOpenAiModels(
					Object.fromEntries(
						fullResponseData.map((item) => [item.id, { ...(item ?? costrictModels.default) }]),
					),
				)
				break
			}
		}
	}, [])

	useEvent("message", onMessage)

	return (
		<>
			<VSCodeTextField
				value={apiConfiguration?.costrictBaseUrl?.trim() || (window as any).COSTRICT_BASE_URL}
				type="url"
				onInput={handleInputChange("costrictBaseUrl")}
				placeholder={t("settings:providers.costrictDefaultBaseUrl", {
					costrictBaseUrl: (window as any).COSTRICT_BASE_URL,
				})}
				className="w-full">
				<label className="block font-medium mb-1">{t("settings:providers.costrictBaseUrl")}</label>
			</VSCodeTextField>
			{!fromWelcomeView && (
				<>
					<VSCodeLink
						className={`forced-color-adjust-none ${apiConfiguration.costrictAccessToken ? "hidden" : ""}`}
						href="#"
						onClick={(e) => {
							e.preventDefault()

							window.postMessage({
								type: "action",
								action: "cloudButtonClicked",
							})
						}}>
						{t("account:loginForFullFeatures")}
					</VSCodeLink>
					<ModelPicker
						apiConfiguration={apiConfiguration}
						setApiConfigurationField={setApiConfigurationField}
						defaultModelId={costrictDefaultModelId}
						models={openAiModels}
						modelIdKey="costrictModelId"
						serviceName="costrict"
						serviceUrl={apiConfiguration.costrictBaseUrl?.trim() || (window as any).COSTRICT_BASE_URL}
						organizationAllowList={organizationAllowList}
						errorMessage={modelValidationError}
					/>
					<Button
						variant="outline"
						disabled={refetchingModels}
						onClick={() => {
							vscode.postMessage({ type: "flushRouterModels", text: "costrict" })
							setRefetchingModels(true)
							refetchRouterModels?.()
							delay(() => {
								setRefetchingModels(false)
							}, 1000)
						}}>
						<div className="flex items-center gap-2">
							<span className={cn("codicon codicon-refresh", refetchingModels ? "animate-spin" : "")} />
							{t("settings:providers.refreshModels.label")}
						</div>
					</Button>
					{debug && (
						<div>
							<VSCodeCheckbox
								checked={useCostrictCustomConfig}
								onChange={(e: any) => {
									setCachedStateField("useCostrictCustomConfig", e.target.checked)
								}}>
								<label className="block font-medium mb-1">
									{t("settings:providers.useCostrictCustomConfig")}
								</label>
							</VSCodeCheckbox>
						</div>
					)}
				</>
			)}
			{!fromWelcomeView && useCostrictCustomConfig && debug && (
				<>
					<R1FormatSetting
						onChange={handleInputChange("openAiR1FormatEnabled", noTransform)}
						openAiR1FormatEnabled={apiConfiguration?.openAiR1FormatEnabled ?? false}
					/>
					<Checkbox
						checked={apiConfiguration?.openAiStreamingEnabled ?? true}
						onChange={handleInputChange("openAiStreamingEnabled", noTransform)}>
						{t("settings:modelInfo.enableStreaming")}
					</Checkbox>
					<div>
						<Checkbox
							checked={apiConfiguration?.includeMaxTokens ?? true}
							onChange={(checked: boolean) => {
								setApiConfigurationField("includeMaxTokens", checked)
							}}>
							{t("settings:includeMaxOutputTokens")}
						</Checkbox>
						<div className="text-sm text-vscode-descriptionForeground ml-6">
							{t("settings:includeMaxOutputTokensDescription")}
						</div>
					</div>
					<Checkbox
						checked={apiConfiguration?.openAiUseAzure ?? false}
						onChange={handleInputChange("openAiUseAzure", noTransform)}>
						{t("settings:modelInfo.useAzure")}
					</Checkbox>
					<div>
						<Checkbox
							checked={azureApiVersionSelected}
							onChange={(checked: boolean) => {
								setAzureApiVersionSelected(checked)

								if (!checked) {
									setApiConfigurationField("azureApiVersion", "")
								}
							}}>
							{t("settings:modelInfo.azureApiVersion")}
						</Checkbox>
						{azureApiVersionSelected && (
							<VSCodeTextField
								value={apiConfiguration?.azureApiVersion || ""}
								onInput={handleInputChange("azureApiVersion")}
								placeholder={`Default: ${azureOpenAiDefaultApiVersion}`}
								className="w-full mt-1"
							/>
						)}
					</div>

					{/* Custom Headers UI */}
					<div className="mb-4">
						<div className="flex justify-between items-center mb-2">
							<label className="block font-medium">{t("settings:providers.customHeaders")}</label>
							<StandardTooltip content={t("settings:common.add")}>
								<VSCodeButton appearance="icon" onClick={handleAddCustomHeader}>
									<span className="codicon codicon-add"></span>
								</VSCodeButton>
							</StandardTooltip>
						</div>
						{!customHeaders.length ? (
							<div className="text-sm text-vscode-descriptionForeground">
								{t("settings:providers.noCustomHeaders")}
							</div>
						) : (
							customHeaders.map(([key, value], index) => (
								<div key={index} className="flex items-center mb-2">
									<VSCodeTextField
										value={key}
										className="flex-1 mr-2"
										placeholder={t("settings:providers.headerName")}
										onInput={(e: any) => handleUpdateHeaderKey(index, e.target.value)}
									/>
									<VSCodeTextField
										value={value}
										className="flex-1 mr-2"
										placeholder={t("settings:providers.headerValue")}
										onInput={(e: any) => handleUpdateHeaderValue(index, e.target.value)}
									/>
									<StandardTooltip content={t("settings:common.remove")}>
										<VSCodeButton appearance="icon" onClick={() => handleRemoveCustomHeader(index)}>
											<span className="codicon codicon-trash"></span>
										</VSCodeButton>
									</StandardTooltip>
								</div>
							))
						)}
					</div>

					<div className="flex flex-col gap-1">
						<Checkbox
							checked={apiConfiguration.enableReasoningEffort ?? false}
							onChange={(checked: boolean) => {
								setApiConfigurationField("enableReasoningEffort", checked)

								if (!checked) {
									const { reasoningEffort: _, ...costrictAiCustomModelInfo } =
										apiConfiguration.costrictAiCustomModelInfo || costrictModels.default

									setApiConfigurationField("costrictAiCustomModelInfo", costrictAiCustomModelInfo)
								}
							}}>
							{t("settings:providers.setReasoningLevel")}
						</Checkbox>
						{!!apiConfiguration.enableReasoningEffort && (
							<ThinkingBudget
								apiConfiguration={{
									...apiConfiguration,
									reasoningEffort: apiConfiguration.costrictAiCustomModelInfo?.reasoningEffort,
								}}
								setApiConfigurationField={(field, value) => {
									if (field === "reasoningEffort") {
										const costrictAiCustomModelInfo =
											apiConfiguration.costrictAiCustomModelInfo || costrictModels.default

										setApiConfigurationField("costrictAiCustomModelInfo", {
											...costrictAiCustomModelInfo,
											reasoningEffort: value as ReasoningEffort,
										})
									}
								}}
								modelInfo={{
									...(apiConfiguration.costrictAiCustomModelInfo || costrictModels.default),
									supportsReasoningEffort: ["low", "medium", "high", "xhigh"],
								}}
							/>
						)}
					</div>
					<div className="flex flex-col gap-3">
						<div className="text-sm text-vscode-descriptionForeground whitespace-pre-line">
							{t("settings:providers.customModel.capabilities")}
						</div>

						<div>
							<VSCodeTextField
								value={
									apiConfiguration?.costrictAiCustomModelInfo?.maxTokens?.toString() ||
									costrictModels.default.maxTokens?.toString() ||
									""
								}
								type="text"
								style={{
									borderColor: (() => {
										const value = apiConfiguration?.costrictAiCustomModelInfo?.maxTokens

										if (!value) {
											return "var(--vscode-input-border)"
										}

										return value > 0
											? "var(--vscode-charts-green)"
											: "var(--vscode-errorForeground)"
									})(),
								}}
								onInput={handleInputChange("costrictAiCustomModelInfo", (e) => {
									const value = parseInt((e.target as HTMLInputElement).value)

									return {
										...(apiConfiguration?.costrictAiCustomModelInfo || costrictModels.default),
										maxTokens: isNaN(value) ? undefined : value,
									}
								})}
								placeholder={t("settings:placeholders.numbers.maxTokens")}
								className="w-full">
								<label className="block font-medium mb-1">
									{t("settings:providers.customModel.maxTokens.label")}
								</label>
							</VSCodeTextField>
							<div className="text-sm text-vscode-descriptionForeground">
								{t("settings:providers.customModel.maxTokens.description")}
							</div>
						</div>

						<div>
							<VSCodeTextField
								value={
									apiConfiguration?.costrictAiCustomModelInfo?.contextWindow?.toString() ||
									costrictModels.default.contextWindow?.toString() ||
									""
								}
								type="text"
								style={{
									borderColor: (() => {
										const value = apiConfiguration?.costrictAiCustomModelInfo?.contextWindow

										if (!value) {
											return "var(--vscode-input-border)"
										}

										return value > 0
											? "var(--vscode-charts-green)"
											: "var(--vscode-errorForeground)"
									})(),
								}}
								onInput={handleInputChange("costrictAiCustomModelInfo", (e) => {
									const value = (e.target as HTMLInputElement).value
									const parsed = parseInt(value)

									return {
										...(apiConfiguration?.costrictAiCustomModelInfo || costrictModels.default),
										contextWindow: isNaN(parsed) ? costrictModels.default.contextWindow : parsed,
									}
								})}
								placeholder={t("settings:placeholders.numbers.contextWindow")}
								className="w-full">
								<label className="block font-medium mb-1">
									{t("settings:providers.customModel.contextWindow.label")}
								</label>
							</VSCodeTextField>
							<div className="text-sm text-vscode-descriptionForeground">
								{t("settings:providers.customModel.contextWindow.description")}
							</div>
						</div>

						<div>
							<div className="flex items-center gap-1">
								<Checkbox
									checked={
										apiConfiguration?.costrictAiCustomModelInfo?.supportsImages ??
										costrictModels.default.supportsImages
									}
									onChange={handleInputChange("costrictAiCustomModelInfo", (checked) => {
										return {
											...(apiConfiguration?.costrictAiCustomModelInfo || costrictModels.default),
											supportsImages: checked,
										}
									})}>
									<span className="font-medium">
										{t("settings:providers.customModel.imageSupport.label")}
									</span>
								</Checkbox>
								<StandardTooltip content={t("settings:providers.customModel.imageSupport.description")}>
									<i
										className="codicon codicon-info text-vscode-descriptionForeground"
										style={{ fontSize: "12px" }}
									/>
								</StandardTooltip>
							</div>
							<div className="text-sm text-vscode-descriptionForeground pt-1">
								{t("settings:providers.customModel.imageSupport.description")}
							</div>
						</div>

						<div>
							<div className="flex items-center gap-1">
								<Checkbox
									checked={apiConfiguration?.costrictAiCustomModelInfo?.supportsPromptCache ?? false}
									onChange={handleInputChange("costrictAiCustomModelInfo", (checked) => {
										return {
											...(apiConfiguration?.costrictAiCustomModelInfo || costrictModels.default),
											supportsPromptCache: checked,
										}
									})}>
									<span className="font-medium">
										{t("settings:providers.customModel.promptCache.label")}
									</span>
								</Checkbox>
								<StandardTooltip content={t("settings:providers.customModel.promptCache.description")}>
									<i
										className="codicon codicon-info text-vscode-descriptionForeground"
										style={{ fontSize: "12px" }}
									/>
								</StandardTooltip>
							</div>
							<div className="text-sm text-vscode-descriptionForeground pt-1">
								{t("settings:providers.customModel.promptCache.description")}
							</div>
						</div>

						<div>
							<VSCodeTextField
								value={
									apiConfiguration?.costrictAiCustomModelInfo?.inputPrice?.toString() ??
									costrictModels.default.inputPrice?.toString() ??
									""
								}
								type="text"
								style={{
									borderColor: (() => {
										const value = apiConfiguration?.costrictAiCustomModelInfo?.inputPrice

										if (!value && value !== 0) {
											return "var(--vscode-input-border)"
										}

										return value >= 0
											? "var(--vscode-charts-green)"
											: "var(--vscode-errorForeground)"
									})(),
								}}
								onChange={handleInputChange("costrictAiCustomModelInfo", (e) => {
									const value = (e.target as HTMLInputElement).value
									const parsed = parseFloat(value)

									return {
										...(apiConfiguration?.costrictAiCustomModelInfo ?? costrictModels.default),
										inputPrice: isNaN(parsed) ? costrictModels.default.inputPrice : parsed,
									}
								})}
								placeholder={t("settings:placeholders.numbers.inputPrice")}
								className="w-full">
								<div className="flex items-center gap-1">
									<label className="block font-medium mb-1">
										{t("settings:providers.customModel.pricing.input.label")}
									</label>
									<StandardTooltip
										content={t("settings:providers.customModel.pricing.input.description")}>
										<i
											className="codicon codicon-info text-vscode-descriptionForeground"
											style={{ fontSize: "12px" }}
										/>
									</StandardTooltip>
								</div>
							</VSCodeTextField>
						</div>

						<div>
							<VSCodeTextField
								value={
									apiConfiguration?.costrictAiCustomModelInfo?.outputPrice?.toString() ||
									costrictModels.default.outputPrice?.toString() ||
									""
								}
								type="text"
								style={{
									borderColor: (() => {
										const value = apiConfiguration?.costrictAiCustomModelInfo?.outputPrice

										if (!value && value !== 0) {
											return "var(--vscode-input-border)"
										}

										return value >= 0
											? "var(--vscode-charts-green)"
											: "var(--vscode-errorForeground)"
									})(),
								}}
								onChange={handleInputChange("costrictAiCustomModelInfo", (e) => {
									const value = (e.target as HTMLInputElement).value
									const parsed = parseFloat(value)

									return {
										...(apiConfiguration?.costrictAiCustomModelInfo || costrictModels.default),
										outputPrice: isNaN(parsed) ? costrictModels.default.outputPrice : parsed,
									}
								})}
								placeholder={t("settings:placeholders.numbers.outputPrice")}
								className="w-full">
								<div className="flex items-center gap-1">
									<label className="block font-medium mb-1">
										{t("settings:providers.customModel.pricing.output.label")}
									</label>
									<StandardTooltip
										content={t("settings:providers.customModel.pricing.output.description")}>
										<i
											className="codicon codicon-info text-vscode-descriptionForeground"
											style={{ fontSize: "12px" }}
										/>
									</StandardTooltip>
								</div>
							</VSCodeTextField>
						</div>

						{apiConfiguration?.costrictAiCustomModelInfo?.supportsPromptCache && (
							<>
								<div>
									<VSCodeTextField
										value={
											apiConfiguration?.costrictAiCustomModelInfo?.cacheReadsPrice?.toString() ??
											"0"
										}
										type="text"
										style={{
											borderColor: (() => {
												const value =
													apiConfiguration?.costrictAiCustomModelInfo?.cacheReadsPrice

												if (!value && value !== 0) {
													return "var(--vscode-input-border)"
												}

												return value >= 0
													? "var(--vscode-charts-green)"
													: "var(--vscode-errorForeground)"
											})(),
										}}
										onChange={handleInputChange("costrictAiCustomModelInfo", (e) => {
											const value = (e.target as HTMLInputElement).value
											const parsed = parseFloat(value)

											return {
												...(apiConfiguration?.costrictAiCustomModelInfo ??
													costrictModels.default),
												cacheReadsPrice: isNaN(parsed) ? 0 : parsed,
											}
										})}
										placeholder={t("settings:placeholders.numbers.inputPrice")}
										className="w-full">
										<div className="flex items-center gap-1">
											<span className="font-medium">
												{t("settings:providers.customModel.pricing.cacheReads.label")}
											</span>
											<StandardTooltip
												content={t(
													"settings:providers.customModel.pricing.cacheReads.description",
												)}>
												<i
													className="codicon codicon-info text-vscode-descriptionForeground"
													style={{ fontSize: "12px" }}
												/>
											</StandardTooltip>
										</div>
									</VSCodeTextField>
								</div>
								<div>
									<VSCodeTextField
										value={
											apiConfiguration?.costrictAiCustomModelInfo?.cacheWritesPrice?.toString() ??
											"0"
										}
										type="text"
										style={{
											borderColor: (() => {
												const value =
													apiConfiguration?.costrictAiCustomModelInfo?.cacheWritesPrice

												if (!value && value !== 0) {
													return "var(--vscode-input-border)"
												}

												return value >= 0
													? "var(--vscode-charts-green)"
													: "var(--vscode-errorForeground)"
											})(),
										}}
										onChange={handleInputChange("costrictAiCustomModelInfo", (e) => {
											const value = (e.target as HTMLInputElement).value
											const parsed = parseFloat(value)

											return {
												...(apiConfiguration?.costrictAiCustomModelInfo ??
													costrictModels.default),
												cacheWritesPrice: isNaN(parsed) ? 0 : parsed,
											}
										})}
										placeholder={t("settings:placeholders.numbers.cacheWritePrice")}
										className="w-full">
										<div className="flex items-center gap-1">
											<label className="block font-medium mb-1">
												{t("settings:providers.customModel.pricing.cacheWrites.label")}
											</label>
											<StandardTooltip
												content={t(
													"settings:providers.customModel.pricing.cacheWrites.description",
												)}>
												<i
													className="codicon codicon-info text-vscode-descriptionForeground"
													style={{ fontSize: "12px" }}
												/>
											</StandardTooltip>
										</div>
									</VSCodeTextField>
								</div>
							</>
						)}

						<Button
							variant="secondary"
							onClick={() =>
								setApiConfigurationField("costrictAiCustomModelInfo", costrictModels.default)
							}>
							{t("settings:providers.customModel.resetDefaults")}
						</Button>
					</div>
				</>
			)}
		</>
	)
}
