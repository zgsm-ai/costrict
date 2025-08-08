import React, { useCallback, useEffect, useState } from "react"
import { ModelPicker } from "./ModelPicker"

import {
	type ProviderSettings,
	type ModelInfo,
	zgsmModels,
	zgsmDefaultModelId,
	openRouterDefaultModelId,
	requestyDefaultModelId,
	glamaDefaultModelId,
	unboundDefaultModelId,
	litellmDefaultModelId,
	OrganizationAllowList,
	openAiModelInfoSaneDefaults,
} from "@roo-code/types"
import { ExtensionMessage } from "@roo/ExtensionMessage"
import { useDebounce, useEvent } from "react-use"
import { vscode } from "@/utils/vscode"
import { convertHeadersToObject } from "./utils/headers"
import { RouterModels } from "@roo/api"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@src/components/ui"
import { useAppTranslation } from "@/i18n/TranslationContext"
import { useSelectedModel } from "../ui/hooks/useSelectedModel"
import { ChevronUp } from "lucide-react"
export interface ProviderRendererProps {
	selectedProvider: string
	apiConfiguration: ProviderSettings
	organizationAllowList: OrganizationAllowList
	routerModels: RouterModels
	setApiConfigurationField: <K extends keyof ProviderSettings>(field: K, value: ProviderSettings[K]) => void
	selectedProviderModels: { value: string; label: string }[]
}

const ProviderRenderer: React.FC<ProviderRendererProps> = ({
	apiConfiguration,
	setApiConfigurationField,
	organizationAllowList,
	selectedProvider,
	routerModels,
	selectedProviderModels,
}) => {
	const [openAiModels, setOpenAiModels] = useState<Record<string, ModelInfo> | null>(null)

	const onMessage = useCallback((event: MessageEvent) => {
		const message: ExtensionMessage = event.data

		switch (message.type) {
			case "zgsmModels": {
				const updatedModels = message.openAiModels ?? []
				setOpenAiModels(Object.fromEntries(updatedModels.map((item) => [item, zgsmModels.default])))
				break
			}
			case "openAiModels": {
				const updatedModels = message.openAiModels ?? []
				setOpenAiModels(Object.fromEntries(updatedModels.map((item) => [item, openAiModelInfoSaneDefaults])))
				break
			}
		}
	}, [])

	useEvent("message", onMessage)

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

	useDebounce(
		() => {
			if (selectedProvider === "zgsm") {
				// Use our custom headers state to build the headers object.
				const headerObject = convertHeadersToObject(customHeaders)

				vscode.postMessage({
					type: "requestZgsmModels",
					values: {
						baseUrl: apiConfiguration?.zgsmBaseUrl?.trim(),
						apiKey: apiConfiguration?.zgsmAccessToken,
						customHeaders: {}, // Reserved for any additional headers
						openAiHeaders: headerObject,
					},
				})
			} else if (selectedProvider === "openai") {
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
			} else if (selectedProvider === "ollama") {
				vscode.postMessage({ type: "requestOllamaModels" })
			} else if (selectedProvider === "lmstudio") {
				vscode.postMessage({ type: "requestLmStudioModels" })
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

	// Define provider configuration mapping
	const providerConfig = {
		zgsm: {
			modelIdKey: "zgsmModelId",
			serviceName: "zgsm",
			defaultModelId: zgsmDefaultModelId,
			serviceUrl: apiConfiguration.zgsmBaseUrl?.trim() || "",
			models: openAiModels ?? {},
		},
		openrouter: {
			modelIdKey: "openRouterModelId",
			serviceName: "OpenRouter",
			defaultModelId: openRouterDefaultModelId,
			serviceUrl: "https://openrouter.ai/models",
			models: routerModels?.openrouter ?? {},
		},
		requesty: {
			modelIdKey: "requestyModelId",
			serviceName: "Requesty",
			defaultModelId: requestyDefaultModelId,
			serviceUrl: "https://requesty.ai",
			models: routerModels?.requesty ?? {},
		},
		glama: {
			modelIdKey: "glamaModelId",
			serviceName: "Glama",
			defaultModelId: glamaDefaultModelId,
			serviceUrl: "https://glama.ai/models",
			models: routerModels?.glama ?? {},
		},
		unbound: {
			modelIdKey: "unboundModelId",
			serviceName: "Unbound",
			defaultModelId: unboundDefaultModelId,
			serviceUrl: "https://api.getunbound.ai/models",
			models: routerModels?.unbound ?? {},
		},
		openai: {
			modelIdKey: "openAiModelId",
			serviceName: "OpenAI",
			defaultModelId: "gpt-4o",
			serviceUrl: "https://platform.openai.com",
			models: openAiModels ?? {},
		},
		litellm: {
			modelIdKey: "litellmModelId",
			serviceName: "LiteLLM",
			defaultModelId: litellmDefaultModelId,
			serviceUrl: "https://docs.litellm.ai/",
			models: routerModels?.litellm ?? {},
		},
	}

	const config = providerConfig[selectedProvider as keyof typeof providerConfig] || {}

	const { t } = useAppTranslation()

	const { id: selectedModelId } = useSelectedModel(apiConfiguration)

	return config?.modelIdKey ? (
		<ModelPicker
			apiConfiguration={apiConfiguration}
			setApiConfigurationField={setApiConfigurationField}
			defaultModelId={config.defaultModelId}
			models={config?.models ?? {}}
			modelIdKey={config.modelIdKey as any}
			serviceName={config.serviceName}
			serviceUrl={config.serviceUrl}
			organizationAllowList={organizationAllowList}
			showInfoView={false}
			showLabel={false}
			triggerClassName="rounded-md w-30 h-6"
			popoverContentClassName="min-w-80 max-w-9/10 overflow-hidden"
			PopoverTriggerContentClassName="w-[80%] overflow-hidden truncate whitespace-nowrap"
			buttonIconType="up"
		/>
	) : (
		selectedProviderModels.length > 0 && (
			<>
				<div>
					<Select
						value={selectedModelId === "custom-arn" ? "custom-arn" : selectedModelId}
						onValueChange={(value) => {
							setApiConfigurationField("apiModelId", value)

							// Clear custom ARN if not using custom ARN option.
							if (value !== "custom-arn" && selectedProvider === "bedrock") {
								setApiConfigurationField("awsCustomArn", "")
							}
						}}
						onOpenChange={(open) => {
							if (open) {
								document.body.style.padding = "0 20px"
							}
						}}>
						<SelectTrigger
							className="rounded-md w-30 h-6"
							icon={<ChevronUp />}
							onMouseDown={() => {
								document.body.style.padding = "0 20px"
							}}>
							<div className="w-[80%] overflow-hidden truncate whitespace-nowrap">
								<SelectValue placeholder={t("settings:common.select")} />
							</div>
						</SelectTrigger>
						<SelectContent className="min-w-80 max-w-9/10 overflow-hidden">
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
			</>
		)
	)
}

export default ProviderRenderer
