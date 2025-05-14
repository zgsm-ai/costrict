import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useAppTranslation } from "@/i18n/TranslationContext"
import { Trans } from "react-i18next"
import { getRequestyAuthUrl, getOpenRouterAuthUrl, getGlamaAuthUrl } from "../../oauth/urls"
import { useDebounce, useEvent } from "react-use"
import { LanguageModelChatSelector } from "vscode"
import { Checkbox } from "vscrui"
import { VSCodeLink, VSCodeRadio, VSCodeRadioGroup, VSCodeTextField } from "@vscode/webview-ui-toolkit/react"
import { ExternalLinkIcon } from "@radix-ui/react-icons"

import {
	type ProviderName,
	type ProviderSettings,
	openRouterDefaultModelId,
	requestyDefaultModelId,
	requestyDefaultModelInfo,
	ApiProvider,
	allModels,
	zgsmProviderKey,
	zgsmModels,
} from "../../../../src/shared/api"
import { ExtensionMessage } from "../../../../src/shared/ExtensionMessage"

import {
	Anthropic,
	Bedrock,
	Chutes,
	DeepSeek,
	Gemini,
	Glama,
	Groq,
	LMStudio,
	LiteLLM,
	Mistral,
	Ollama,
	OpenAI,
	OpenAICompatible,
	OpenRouter,
	Requesty,
	Unbound,
	Vertex,
	VSCodeLM,
	XAI,
} from "./providers"

import { MODELS_BY_PROVIDER, PROVIDERS, REASONING_MODELS } from "./constants"
import { inputEventTransform, noTransform } from "./transforms"
import { ModelInfoView } from "./ModelInfoView"
import { ApiErrorMessage } from "./ApiErrorMessage"
import { ThinkingBudget } from "./ThinkingBudget"
import { R1FormatSetting } from "./R1FormatSetting"
import { OpenRouterBalanceDisplay } from "./OpenRouterBalanceDisplay"
import { RequestyBalanceDisplay } from "./RequestyBalanceDisplay"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { generateZgsmAuthUrl } from "../../../../src/shared/zgsmAuthUrl"
import { AxiosError } from "axios"
interface ApiOptionsProps {
	uriScheme: string | undefined
	apiConfiguration: ProviderSettings
	setApiConfigurationField: <K extends keyof ProviderSettings>(field: K, value: ProviderSettings[K]) => void
	fromWelcomeView?: boolean
	errorMessage: string | undefined
	setErrorMessage: React.Dispatch<React.SetStateAction<string | undefined>>
	baseUrlErrorMessage?: string | undefined
	setBaseUrlErrorMessage?: React.Dispatch<React.SetStateAction<string | undefined>>
}

const ApiOptions = ({
	uriScheme,
	apiConfiguration,
	setApiConfigurationField,
	fromWelcomeView,
	errorMessage,
	setErrorMessage,
	baseUrlErrorMessage,
	setBaseUrlErrorMessage,
}: ApiOptionsProps) => {
	const { currentApiConfigName } = useExtensionState()
	const { t } = useAppTranslation()

	const [customHeaders, setCustomHeaders] = useState<[string, string][]>(() => {
		const headers = apiConfiguration?.openAiHeaders || {}
		return Object.entries(headers)
	})

	useEffect(() => {
		const propHeaders = apiConfiguration?.openAiHeaders || {}

		if (JSON.stringify(customHeaders) !== JSON.stringify(Object.entries(propHeaders))) {
			setCustomHeaders(Object.entries(propHeaders))
		}
	}, [apiConfiguration?.openAiHeaders, customHeaders])

	// Helper to convert array of tuples to object (filtering out empty keys).

	const [openAiModels, setOpenAiModels] = useState<Record<string, ModelInfo> | null>(null)
	const [zgsmModels, setZgsmModels] = useState<Record<string, ModelInfo> | null>(null)

			// Only update if the processed object is different from the current config.
			if (JSON.stringify(currentConfigHeaders) !== JSON.stringify(newHeadersObject)) {
				setApiConfigurationField("openAiHeaders", newHeadersObject)
			}
		},
		300,
		[customHeaders, apiConfiguration?.openAiHeaders, setApiConfigurationField],
	)
	const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false)

	const [modelErrInfo, setModelErrInfo] = useState({})

	const countRef = useRef(modelErrInfo)
	useEffect(() => {
		countRef.current = modelErrInfo
	}, [modelErrInfo])

	const noTransform = <T,>(value: T) => value

	const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false)

	const handleInputChange = useCallback(
		<K extends keyof ProviderSettings, E>(
			field: K,
			transform: (event: E) => ProviderSettings[K] = inputEventTransform,
		) =>
			(event: E | Event) => {
				setApiConfigurationField(field, transform(event as E))
			},
		[setApiConfigurationField],
	)

	const {
		provider: selectedProvider,
		id: selectedModelId,
		info: selectedModelInfo,
	} = useSelectedModel(apiConfiguration)

	const { data: routerModels, refetch: refetchRouterModels } = useRouterModels()

	// Update `apiModelId` whenever `selectedModelId` changes.
	useEffect(() => {
		if (selectedModelId) {
			setApiConfigurationField("apiModelId", selectedModelId)
		}
	}, [selectedModelId, setApiConfigurationField])

	// Debounced refresh model updates, only executed 250ms after the user
	// stops typing.
	useDebounce(
		() => {
			if (selectedProvider === "openai") {
				// Use our custom headers state to build the headers object.
				const headerObject = convertHeadersToObject(customHeaders)

				vscode.postMessage({
					type: "requestOpenAiModels",
					values: {
						baseUrl: apiConfiguration?.openAiBaseUrl,
						apiKey: apiConfiguration?.openAiApiKey,
						customHeaders: {}, // Reserved for any additional headers
						openAiHeaders: headerObject,
					},
				})
			} else if (selectedProvider === zgsmProviderKey) {
				vscode.postMessage({
					type: "refreshZgsmModels",
					values: {
						baseUrl: `${apiConfiguration?.zgsmBaseUrl || apiConfiguration.zgsmDefaultBaseUrl}`,
						apiKey: apiConfiguration?.zgsmApiKey,
						hostHeader: apiConfiguration?.openAiHostHeader,
					},
				})
			} else if (selectedProvider === "ollama") {
				vscode.postMessage({ type: "requestOllamaModels", text: apiConfiguration?.ollamaBaseUrl })
			} else if (selectedProvider === "lmstudio") {
				vscode.postMessage({ type: "requestLmStudioModels", text: apiConfiguration?.lmStudioBaseUrl })
			} else if (selectedProvider === "vscode-lm") {
				vscode.postMessage({ type: "requestVsCodeLmModels" })
			} else if (selectedProvider === "litellm") {
				vscode.postMessage({ type: "requestRouterModels" })
			}
		},
		250,
		[
			selectedProvider,
			apiConfiguration?.requestyApiKey,
			apiConfiguration?.openAiBaseUrl,
			apiConfiguration?.openAiApiKey,
			apiConfiguration?.ollamaBaseUrl,
			apiConfiguration?.lmStudioBaseUrl,
			apiConfiguration?.litellmBaseUrl,
			apiConfiguration?.litellmApiKey,
			customHeaders,
		],
	)

	useEffect(() => {
		const apiValidationResult =
			validateApiConfiguration(apiConfiguration) || validateModelId(apiConfiguration, routerModels)

		setErrorMessage(apiValidationResult)
	}, [apiConfiguration, routerModels, setErrorMessage])

	const { data: openRouterModelProviders } = useOpenRouterModelProviders(apiConfiguration?.openRouterModelId, {
		enabled:
			selectedProvider === "openrouter" &&
			!!apiConfiguration?.openRouterModelId &&
			apiConfiguration.openRouterModelId in openRouterModels,
	})

	const onMessage = useCallback(
		(event: MessageEvent) => {
			const message: ExtensionMessage = event.data

			switch (message.type) {
				case "openRouterModels": {
					const updatedModels = message.openRouterModels ?? {}
					setOpenRouterModels({ [openRouterDefaultModelId]: openRouterDefaultModelInfo, ...updatedModels })
					break
				}
				case "glamaModels": {
					const updatedModels = message.glamaModels ?? {}
					setGlamaModels({ [glamaDefaultModelId]: glamaDefaultModelInfo, ...updatedModels })
					break
				}
				case "unboundModels": {
					const updatedModels = message.unboundModels ?? {}
					setUnboundModels({ [unboundDefaultModelId]: unboundDefaultModelInfo, ...updatedModels })
					break
				}
				case "requestyModels": {
					const updatedModels = message.requestyModels ?? {}
					setRequestyModels({ [requestyDefaultModelId]: requestyDefaultModelInfo, ...updatedModels })
					break
				}
				case "openAiModels": {
					const updatedModels = message.openAiModels ?? []
					setOpenAiModels(
						Object.fromEntries(updatedModels.map((item) => [item, openAiModelInfoSaneDefaults])),
					)
					break
				}
				case "zgsmModels": {
					const updatedModels = message.zgsmModels ?? []
					if (message.zgsmDefaultModelId) {
						apiConfiguration.zgsmDefaultModelId !== message.zgsmDefaultModelId &&
							setApiConfigurationField("zgsmDefaultModelId", message.zgsmDefaultModelId)
						setApiConfigurationField(
							"zgsmModelId",
							apiConfiguration?.apiProvider === zgsmProviderKey
								? apiConfiguration.zgsmModelId || apiConfiguration.zgsmDefaultModelId
								: message.zgsmDefaultModelId,
						)
					}
					if (message?.errorObj?.status === 401) {
						setModelErrInfo({ ...message.errorObj })
					}

					setZgsmModels(Object.fromEntries(updatedModels.map((item) => [item, allModels[item]])))
					break
				}
				case "ollamaModels":
					{
						const newModels = message.ollamaModels ?? []
						setOllamaModels(newModels)
					}
					break
				case "lmStudioModels":
					{
						const newModels = message.lmStudioModels ?? []
						setLmStudioModels(newModels)
					}
					break
				case "vsCodeLmModels":
					{
						const newModels = message.vsCodeLmModels ?? []
						setVsCodeLmModels(newModels)
					}
					break
			}
		},
		[
			apiConfiguration?.apiProvider,
			apiConfiguration.zgsmModelId,
			apiConfiguration.zgsmDefaultModelId,
			setApiConfigurationField,
		],
	)

	useEvent("message", onMessage)

	const selectedProviderModelOptions = useMemo(
		() =>
			MODELS_BY_PROVIDER[selectedProvider]
				? Object.keys(MODELS_BY_PROVIDER[selectedProvider]).map((modelId) => ({
						value: modelId,
						label: modelId,
					}))
				: [],
		[selectedProvider],
	)

	// Base URL for provider documentation
	// const DOC_BASE_URL = "https://docs.roocode.com/providers"

	// Custom URL path mappings for providers with different slugs
	// const providerUrlSlugs: Record<string, string> = {
	// 	"openai-native": "openai",
	// 	openai: "openai-compatible",
	// }

	// Helper function to get provider display name from PROVIDERS constant
	// const getProviderDisplayName = (providerKey: string): string | undefined => {
	// 	const provider = PROVIDERS.find((p) => p.value === providerKey)
	// 	return provider?.label
	// }

	// Helper function to get the documentation URL and name for the currently selected provider
	const getSelectedProviderDocUrl = (): { url: string; name: string } | undefined => {
		// const displayName = getProviderDisplayName(selectedProvider)

		// zgsm todo: update docs url
		return undefined
		// if (!displayName) {
		// 	return undefined
		// }

		// // Get the URL slug - use custom mapping if available, otherwise use the provider key
		// const urlSlug = providerUrlSlugs[selectedProvider] || selectedProvider

		// return {
		// 	url: `${DOC_BASE_URL}/${urlSlug}`,
		// 	name: displayName,
		// }
	}
	return (
		<div className="flex flex-col gap-3">
			<div className="flex flex-col gap-1 relative">
				<div className="flex justify-between items-center">
					<label className="block font-medium mb-1">{t("settings:providers.apiProvider")}</label>
					{docs && (
						<div className="text-xs text-vscode-descriptionForeground">
							<VSCodeLink href={docs.url} className="hover:text-vscode-foreground" target="_blank">
								{t("settings:providers.providerDocumentation", { provider: docs.name })}
							</VSCodeLink>
						</div>
					)}
				</div>
				<Select value={selectedProvider} onValueChange={(value) => onProviderChange(value as ProviderName)}>
					<SelectTrigger className="w-full">
						<SelectValue placeholder={t("settings:common.select")} />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value={zgsmProviderKey}>{t("settings:providers.zgsm")}</SelectItem>
						<SelectSeparator />
						{PROVIDERS.filter((p) => p.value !== zgsmProviderKey).map(({ value, label }) => (
							<SelectItem key={value} value={value}>
								{label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			{errorMessage && <ApiErrorMessage errorMessage={errorMessage} />}
			{selectedProvider === zgsmProviderKey && (
				<>
					<VSCodeTextField
						value={apiConfiguration?.zgsmBaseUrl || ""}
						type="url"
						onInput={(e: any) => {
							const value = e.target._currentValue
							handleInputChange("zgsmBaseUrl")(e)

							if (value) return
							// if value is empty, clear the error message and send empty baseUrl
							setBaseUrlErrorMessage && setBaseUrlErrorMessage(undefined)
							vscode.postMessage({
								type: "upsertApiConfiguration",
								text: currentApiConfigName,
								apiConfiguration: {
									...apiConfiguration,
									zgsmBaseUrl: "",
								},
							})
						}}
						onChange={(event: any) => {
							const value = event.target._currentValue
							if (!value) return

							vscode.postMessage({
								type: "upsertApiConfiguration",
								text: currentApiConfigName,
								apiConfiguration: {
									...apiConfiguration,
									zgsmBaseUrl: value,
								},
							})
						}}
						placeholder={t("settings:providers.zgsmDefaultBaseUrl", {
							zgsmBaseUrl: `${apiConfiguration.zgsmDefaultBaseUrl}`,
						})}
						className="w-full">
						<label className="block font-medium mb-1">{t("settings:providers.zgsmBaseUrl")}</label>
					</VSCodeTextField>
					{baseUrlErrorMessage && <ApiErrorMessage errorMessage={baseUrlErrorMessage} />}
					<div className="text-sm text-vscode-descriptionForeground mt-1">{t("welcome:baseUrlTip")}</div>
					{apiConfiguration.zgsmApiKey && (
						<ModelPicker
							apiConfiguration={apiConfiguration}
							setApiConfigurationField={setApiConfigurationField}
							defaultModelId={`${apiConfiguration.zgsmModelId || apiConfiguration.zgsmDefaultModelId}`}
							defaultModelInfo={openAiModelInfoSaneDefaults}
							models={zgsmModels}
							modelIdKey="zgsmModelId"
							modelInfoKey="openAiCustomModelInfo"
							serviceName="OpenAI"
							serviceUrl={`${apiConfiguration?.zgsmBaseUrl || apiConfiguration.zgsmDefaultBaseUrl}`}
							onOpenModelPicker={() => {
								if ((countRef.current as AxiosError)?.status === 401) {
									vscode.postMessage({
										type: "openExternalRelogin",
										url: generateZgsmAuthUrl(apiConfiguration, uriScheme),
									})
								}
							}}
						/>
					)}
					{!fromWelcomeView && (
						<>
							<VSCodeButtonLink
								href={generateZgsmAuthUrl(apiConfiguration, uriScheme)}
								style={{ width: "100%" }}
								appearance="primary">
								{t(
									!apiConfiguration?.zgsmApiKey
										? "settings:providers.getZgsmApiKey"
										: "settings:providers.getZgsmApiKeyAgain",
								)}
							</VSCodeButtonLink>
						</>
					)}
				</>
			)}
			{selectedProvider === "openrouter" && (
				<OpenRouter
					apiConfiguration={apiConfiguration}
					setApiConfigurationField={setApiConfigurationField}
					routerModels={routerModels}
					selectedModelId={selectedModelId}
					uriScheme={uriScheme}
					fromWelcomeView={fromWelcomeView}
				/>
			)}

			{selectedProvider === "requesty" && (
				<Requesty
					apiConfiguration={apiConfiguration}
					setApiConfigurationField={setApiConfigurationField}
					routerModels={routerModels}
					refetchRouterModels={refetchRouterModels}
				/>
			)}

			{selectedProvider === "glama" && (
				<Glama
					apiConfiguration={apiConfiguration}
					setApiConfigurationField={setApiConfigurationField}
					routerModels={routerModels}
					uriScheme={uriScheme}
				/>
			)}

			{selectedProvider === "unbound" && (
				<Unbound
					apiConfiguration={apiConfiguration}
					setApiConfigurationField={setApiConfigurationField}
					routerModels={routerModels}
				/>
			)}

			{selectedProvider === "anthropic" && (
				<Anthropic apiConfiguration={apiConfiguration} setApiConfigurationField={setApiConfigurationField} />
			)}

			{selectedProvider === "openai-native" && (
				<OpenAI apiConfiguration={apiConfiguration} setApiConfigurationField={setApiConfigurationField} />
			)}

			{selectedProvider === "mistral" && (
				<Mistral apiConfiguration={apiConfiguration} setApiConfigurationField={setApiConfigurationField} />
			)}

			{selectedProvider === "bedrock" && (
				<Bedrock
					apiConfiguration={apiConfiguration}
					setApiConfigurationField={setApiConfigurationField}
					selectedModelInfo={selectedModelInfo}
				/>
			)}

			{selectedProvider === "vertex" && (
				<Vertex apiConfiguration={apiConfiguration} setApiConfigurationField={setApiConfigurationField} />
			)}

			{selectedProvider === "gemini" && (
				<Gemini apiConfiguration={apiConfiguration} setApiConfigurationField={setApiConfigurationField} />
			)}

			{selectedProvider === "openai" && (
				<OpenAICompatible
					apiConfiguration={apiConfiguration}
					setApiConfigurationField={setApiConfigurationField}
				/>
			)}

			{selectedProvider === "lmstudio" && (
				<LMStudio apiConfiguration={apiConfiguration} setApiConfigurationField={setApiConfigurationField} />
			)}

			{selectedProvider === "deepseek" && (
				<DeepSeek apiConfiguration={apiConfiguration} setApiConfigurationField={setApiConfigurationField} />
			)}

			{selectedProvider === "vscode-lm" && (
				<VSCodeLM apiConfiguration={apiConfiguration} setApiConfigurationField={setApiConfigurationField} />
			)}

			{selectedProvider === "ollama" && (
				<Ollama apiConfiguration={apiConfiguration} setApiConfigurationField={setApiConfigurationField} />
			)}

			{selectedProvider === "xai" && (
				<XAI apiConfiguration={apiConfiguration} setApiConfigurationField={setApiConfigurationField} />
			)}

			{selectedProvider === "groq" && (
				<Groq apiConfiguration={apiConfiguration} setApiConfigurationField={setApiConfigurationField} />
			)}

			{selectedProvider === "chutes" && (
				<Chutes apiConfiguration={apiConfiguration} setApiConfigurationField={setApiConfigurationField} />
			)}

			{selectedProvider === "litellm" && (
				<LiteLLM
					apiConfiguration={apiConfiguration}
					setApiConfigurationField={setApiConfigurationField}
					routerModels={routerModels}
				/>
			)}

			{selectedProvider === "human-relay" && (
				<>
					<div className="text-sm text-vscode-descriptionForeground">
						{t("settings:providers.humanRelay.description")}
					</div>
					<div className="text-sm text-vscode-descriptionForeground">
						{t("settings:providers.humanRelay.instructions")}
					</div>
				</>
			)}

			{selectedProviderModels.length > 0 && (
				<>
					<div>
						<label className="block font-medium mb-1">{t("settings:providers.model")}</label>
						<Select
							value={selectedModelId === "custom-arn" ? "custom-arn" : selectedModelId}
							onValueChange={(value) => {
								setApiConfigurationField("apiModelId", value)

								// Clear custom ARN if not using custom ARN option.
								if (value !== "custom-arn" && selectedProvider === "bedrock") {
									setApiConfigurationField("awsCustomArn", "")
								}
							}}>
							<SelectTrigger className="w-full">
								<SelectValue placeholder={t("settings:common.select")} />
							</SelectTrigger>
							<SelectContent>
								{selectedProviderModels.map((option) => (
									<SelectItem key={option.value} value={option.value}>
										{option.label}
									</SelectItem>
								))}
								{selectedProvider === "bedrock" && (
									<SelectItem value="custom-arn">{t("settings:labels.useCustomArn")}</SelectItem>
								)}
							</SelectContent>
						</Select>
					</div>

					{selectedProvider === "bedrock" && selectedModelId === "custom-arn" && (
						<BedrockCustomArn
							apiConfiguration={apiConfiguration}
							setApiConfigurationField={setApiConfigurationField}
						/>
					)}

					<ModelInfoView
						apiProvider={selectedProvider}
						selectedModelId={selectedModelId}
						modelInfo={selectedModelInfo}
						isDescriptionExpanded={isDescriptionExpanded}
						setIsDescriptionExpanded={setIsDescriptionExpanded}
					/>

					<ThinkingBudget
						key={`${selectedProvider}-${selectedModelId}`}
						apiConfiguration={apiConfiguration}
						setApiConfigurationField={setApiConfigurationField}
						modelInfo={selectedModelInfo}
					/>
				</>
			)}

			{REASONING_MODELS.has(selectedModelId) && (
				<ReasoningEffort
					apiConfiguration={apiConfiguration}
					setApiConfigurationField={setApiConfigurationField}
				/>
			)}

			{!fromWelcomeView && (
				<>
					<DiffSettingsControl
						diffEnabled={apiConfiguration.diffEnabled}
						fuzzyMatchThreshold={apiConfiguration.fuzzyMatchThreshold}
						onChange={(field, value) => setApiConfigurationField(field, value)}
					/>
					<TemperatureControl
						value={apiConfiguration.modelTemperature}
						onChange={handleInputChange("modelTemperature", noTransform)}
						maxValue={2}
					/>
					<RateLimitSecondsControl
						value={apiConfiguration.rateLimitSeconds || 0}
						onChange={(value) => setApiConfigurationField("rateLimitSeconds", value)}
					/>
				</>
			)}
		</div>
	)
}

const getZgsmSelectedModelInfo = (models: Record<string, ModelInfo>, modelId: string): ModelInfo => {
	if (!modelId) {
		return {} as ModelInfo
	}

	const ids = Object.keys(models)

	let mastchKey = ids.find((id) => modelId && id.includes(modelId))

	if (!mastchKey) {
		if (modelId.startsWith("claude-")) {
			mastchKey = anthropicDefaultModelId
		} else if (modelId.startsWith("deepseek-")) {
			mastchKey = deepSeekDefaultModelId
		} else if (modelId.startsWith("gpt-")) {
			mastchKey = openAiNativeDefaultModelId
		} else if (modelId.startsWith("gemini-")) {
			mastchKey = geminiDefaultModelId
		} else if (modelId.startsWith("mistral-")) {
			mastchKey = mistralDefaultModelId
		}
	}

	return mastchKey ? models[mastchKey] : zgsmModels["default"]
}

export function normalizeApiConfiguration(apiConfiguration?: ApiConfiguration) {
	const provider = apiConfiguration?.apiProvider || zgsmProviderKey
	const modelId = provider === zgsmProviderKey ? apiConfiguration?.zgsmModelId : apiConfiguration?.apiModelId

	const getProviderData = (models: Record<string, ModelInfo>, defaultId: string) => {
		let selectedModelId: string
		let selectedModelInfo: ModelInfo

		if (provider === "zgsm") {
			selectedModelId = modelId || defaultId
			selectedModelInfo = getZgsmSelectedModelInfo(models, selectedModelId)
		} else if (modelId && modelId in models) {
			selectedModelId = modelId
			selectedModelInfo = models[modelId]
		} else {
			selectedModelId = defaultId
			selectedModelInfo = models[defaultId]
		}

		return { selectedProvider: provider, selectedModelId, selectedModelInfo }
	}

	switch (provider) {
		case zgsmProviderKey:
			return getProviderData(allModels, `${apiConfiguration?.zgsmDefaultModelId}`)
		case "anthropic":
			return getProviderData(anthropicModels, anthropicDefaultModelId)
		case "bedrock":
			// Special case for custom ARN
			if (modelId === "custom-arn") {
				return {
					selectedProvider: provider,
					selectedModelId: "custom-arn",
					selectedModelInfo: {
						maxTokens: 5000,
						contextWindow: 128_000,
						supportsPromptCache: false,
						supportsImages: true,
					},
				}
			}
			return getProviderData(bedrockModels, bedrockDefaultModelId)
		case "vertex":
			return getProviderData(vertexModels, vertexDefaultModelId)
		case "gemini":
			return getProviderData(geminiModels, geminiDefaultModelId)
		case "deepseek":
			return getProviderData(deepSeekModels, deepSeekDefaultModelId)
		case "openai-native":
			return getProviderData(openAiNativeModels, openAiNativeDefaultModelId)
		case "mistral":
			return getProviderData(mistralModels, mistralDefaultModelId)
		case "openrouter":
			return {
				selectedProvider: provider,
				selectedModelId: apiConfiguration?.openRouterModelId || openRouterDefaultModelId,
				selectedModelInfo: apiConfiguration?.openRouterModelInfo || openRouterDefaultModelInfo,
			}
		case "glama":
			return {
				selectedProvider: provider,
				selectedModelId: apiConfiguration?.glamaModelId || glamaDefaultModelId,
				selectedModelInfo: apiConfiguration?.glamaModelInfo || glamaDefaultModelInfo,
			}
		case "unbound":
			return {
				selectedProvider: provider,
				selectedModelId: apiConfiguration?.unboundModelId || unboundDefaultModelId,
				selectedModelInfo: apiConfiguration?.unboundModelInfo || unboundDefaultModelInfo,
			}
		case "requesty":
			return {
				selectedProvider: provider,
				selectedModelId: apiConfiguration?.requestyModelId || requestyDefaultModelId,
				selectedModelInfo: apiConfiguration?.requestyModelInfo || requestyDefaultModelInfo,
			}
		case "openai":
			return {
				selectedProvider: provider,
				selectedModelId: apiConfiguration?.openAiModelId || "",
				selectedModelInfo: apiConfiguration?.openAiCustomModelInfo || openAiModelInfoSaneDefaults,
			}
		case "ollama":
			return {
				selectedProvider: provider,
				selectedModelId: apiConfiguration?.ollamaModelId || "",
				selectedModelInfo: openAiModelInfoSaneDefaults,
			}
		case "lmstudio":
			return {
				selectedProvider: provider,
				selectedModelId: apiConfiguration?.lmStudioModelId || "",
				selectedModelInfo: openAiModelInfoSaneDefaults,
			}
		case "vscode-lm":
			return {
				selectedProvider: provider,
				selectedModelId: apiConfiguration?.vsCodeLmModelSelector
					? `${apiConfiguration.vsCodeLmModelSelector.vendor}/${apiConfiguration.vsCodeLmModelSelector.family}`
					: "",
				selectedModelInfo: {
					...openAiModelInfoSaneDefaults,
					supportsImages: false, // VSCode LM API currently doesn't support images.
				},
			}
		default:
			return getProviderData(anthropicModels, anthropicDefaultModelId)
	}
}

export default memo(ApiOptions)
