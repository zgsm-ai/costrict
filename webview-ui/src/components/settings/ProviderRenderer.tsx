import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { ModelPicker } from "./ModelPicker"

import {
	type ProviderSettings,
	type ModelInfo,
	costrictModelsConfig as costrictModels,
	costrictDefaultModelId,
	openRouterDefaultModelId,
	requestyDefaultModelId,
	// unboundDefaultModelId,
	litellmDefaultModelId,
	openAiModelInfoSaneDefaults,
	OrganizationAllowList,
	ExtensionMessage,
	RouterModels,
} from "@roo-code/types"
import { useDebounce, useEvent } from "react-use"
import { vscode } from "@/utils/vscode"
import { convertHeadersToObject } from "./utils/headers"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem, StandardTooltip } from "@src/components/ui"
import { useAppTranslation } from "@/i18n/TranslationContext"
import { useSelectedModel } from "../ui/hooks/useSelectedModel"
import { Brain, Info, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { getCorrectedCostrictModelId } from "./utils/correctModelSelection"
import { useRooPortal } from "@/components/ui/hooks/useRooPortal"
export interface ProviderRendererProps {
	isEditMode?: boolean
	isStreaming?: boolean
	className?: string
	selectedProvider: string
	apiConfiguration: ProviderSettings
	organizationAllowList: OrganizationAllowList
	routerModels: RouterModels
	setApiConfigurationField: <K extends keyof ProviderSettings>(field: K, value: ProviderSettings[K]) => void
	selectedProviderModels: { value: string; label: string }[]
}

const ProviderRenderer: React.FC<ProviderRendererProps> = ({
	isEditMode = false,
	isStreaming = false,
	className = "",
	apiConfiguration,
	setApiConfigurationField,
	organizationAllowList,
	selectedProvider,
	routerModels,
	selectedProviderModels,
}) => {
	const [openAiModels, setOpenAiModels] = useState<Record<string, ModelInfo> | null>(null)

	// Dedicated costrict model list — separate from openAiModels so a costrict refresh
	// (incl. the unconditional login refresh) never overwrites the openai dropdown.
	const [costrictModelList, setCostrictModelList] = useState<Record<string, ModelInfo> | null>(null)
	const [isRefreshing, setIsRefreshing] = useState(false)
	const [autoSwitchNotice, setAutoSwitchNotice] = useState<{ from: string; to: string } | null>(null)

	// Last NON-EMPTY costrict server list; the "old list" baseline for correction.
	const previousCostrictModelsRef = useRef<Record<string, ModelInfo> | null>(null)
	// Mirrors apiConfiguration.costrictModelId; kept fresh by the effect below AND synchronously
	// by the wrapped setter, so a just-typed custom model can't be mis-corrected by a racing refresh.
	const selectedModelIdRef = useRef<string | undefined>(apiConfiguration.costrictModelId)
	const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	// Becomes true once apiConfiguration has actually caught up to the corrected model id.
	// Guards the "dismiss on user re-pick" effect against firing during the async config round-trip.
	const noticeSettledRef = useRef(false)
	// Anchor the notice just above the model selector chip (computed from its bounding rect).
	const anchorRef = useRef<HTMLDivElement>(null)
	const [noticePos, setNoticePos] = useState<{ left: number; bottom: number } | null>(null)

	useEffect(() => {
		selectedModelIdRef.current = apiConfiguration.costrictModelId
	}, [apiConfiguration.costrictModelId])

	// Wrapped setter: synchronously syncs the ref for costrictModelId before delegating.
	const setApiConfigurationFieldWithRef = useCallback(
		<K extends keyof ProviderSettings>(field: K, value: ProviderSettings[K]) => {
			if (field === "costrictModelId") {
				selectedModelIdRef.current = value as ProviderSettings["costrictModelId"]
			}
			setApiConfigurationField(field, value)
		},
		[setApiConfigurationField],
	)
	const setFieldRef = useRef(setApiConfigurationFieldWithRef)
	useEffect(() => {
		setFieldRef.current = setApiConfigurationFieldWithRef
	}, [setApiConfigurationFieldWithRef])

	// Container for the inline notice. Lives inside ChatView's hidden wrapper, so the notice
	// escapes the toolbar's overflow-clip yet stays hidden when the chat tab is not active.
	const noticePortalContainer = useRooPortal("costrict-portal")

	// Auto-dismiss the inline notice after a few seconds.
	useEffect(() => {
		if (!autoSwitchNotice) {
			return
		}
		const timer = setTimeout(() => setAutoSwitchNotice(null), 6000)
		return () => clearTimeout(timer)
	}, [autoSwitchNotice])

	// Position the notice just above the model selector chip when it appears.
	useEffect(() => {
		if (!autoSwitchNotice) {
			setNoticePos(null)
			return
		}
		const el = anchorRef.current
		if (!el) {
			return
		}
		const rect = el.getBoundingClientRect()
		setNoticePos({ left: rect.left, bottom: window.innerHeight - rect.top + 6 })
	}, [autoSwitchNotice])

	// Dismiss the notice once the user picks a different model than the one we corrected to.
	// We must first wait for apiConfiguration to "settle" to the corrected id — the correction
	// updates the config asynchronously (round-trip via upsertApiConfiguration), so right after
	// the notice is set the prop still holds the OLD id, which must NOT count as a user re-pick.
	useEffect(() => {
		if (!autoSwitchNotice) {
			noticeSettledRef.current = false
			return
		}
		if (apiConfiguration.costrictModelId === autoSwitchNotice.to) {
			noticeSettledRef.current = true
		} else if (noticeSettledRef.current) {
			// Config had reached the corrected id and has now changed again → genuine user re-pick.
			setAutoSwitchNotice(null)
		}
	}, [apiConfiguration.costrictModelId, autoSwitchNotice])

	useEffect(() => {
		return () => {
			if (refreshTimeoutRef.current) {
				clearTimeout(refreshTimeoutRef.current)
			}
		}
	}, [])

	const handleRefreshModels = useCallback(() => {
		// Costrict round-trip: host flushes the cache, refetches, and pushes `costrictModels` back.
		vscode.postMessage({ type: "flushRouterModels", text: "costrict" })
		setIsRefreshing(true)
		if (refreshTimeoutRef.current) {
			clearTimeout(refreshTimeoutRef.current)
		}
		// Safety fallback: stop spinning even if no response arrives.
		refreshTimeoutRef.current = setTimeout(() => setIsRefreshing(false), 10000)
	}, [])

	// Login refresh: ProviderRenderer is always mounted (ChatView is never unmounted), so it
	// reliably catches the host's post-login `costrictLogined`. Fire unconditionally — refreshing
	// the costrict list only touches `costrictModelList`, never the openai dropdown.
	useEffect(() => {
		const onLogined = (event: MessageEvent) => {
			if (event.data?.type === "costrictLogined") {
				handleRefreshModels()
			}
		}
		window.addEventListener("message", onLogined)
		return () => window.removeEventListener("message", onLogined)
	}, [handleRefreshModels])

	const onMessage = useCallback((event: MessageEvent) => {
		const message: ExtensionMessage = event.data

		switch (message.type) {
			case "costrictModels": {
				const { fullResponseData = [] } = message
				const newModels = Object.fromEntries(
					fullResponseData.map((item) => [item.id, { ...(item ?? costrictModels.default) }]),
				) as Record<string, ModelInfo>
				const newModelIds = Object.keys(newModels)

				// Selection correction: compare against the dedicated costrict baseline.
				// The pure rule (and its rationale) lives in ./utils/correctModelSelection.
				const oldModelIds = Object.keys(previousCostrictModelsRef.current ?? {})
				const selectedModelId = selectedModelIdRef.current
				const corrected = getCorrectedCostrictModelId(oldModelIds, newModelIds, selectedModelId)
				if (corrected && selectedModelId) {
					setFieldRef.current("costrictModelId", corrected)
					setAutoSwitchNotice({ from: selectedModelId, to: corrected })
				}

				// Preserve the last NON-EMPTY costrict list as the baseline for the next refresh.
				if (newModelIds.length > 0) {
					previousCostrictModelsRef.current = newModels
				}

				setCostrictModelList(newModels)
				setIsRefreshing(false)
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

	const [showSelect, setShowSelect] = useState(false)

	useEffect(() => {
		const handlePageChange = (event: MessageEvent) => {
			// check messsage type only close with action
			if (event.data && event.data.type === "action") {
				setShowSelect(false)
			}
		}
		window.addEventListener("message", handlePageChange)

		return () => {
			window.removeEventListener("message", handlePageChange)
		}
	}, [])

	useDebounce(
		() => {
			if (selectedProvider === "costrict") {
				// Use our custom headers state to build the headers object.
				const headerObject = convertHeadersToObject(customHeaders)

				vscode.postMessage({
					type: "requestRouterModels",
					values: {
						baseUrl: apiConfiguration?.costrictBaseUrl?.trim() || (window as any).COSTRICT_BASE_URL,
						apiKey: apiConfiguration?.costrictAccessToken,
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
	const providerConfig = useMemo(
		() => ({
			costrict: {
				modelIdKey: "costrictModelId",
				serviceName: "costrict",
				defaultModelId: apiConfiguration.costrictModelId || costrictDefaultModelId,
				serviceUrl: apiConfiguration.costrictBaseUrl?.trim() || (window as any).COSTRICT_BASE_URL,
				models: costrictModelList ?? {},
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
			// unbound: {
			// 	modelIdKey: "unboundModelId",
			// 	serviceName: "Unbound",
			// 	defaultModelId: unboundDefaultModelId,
			// 	serviceUrl: "https://api.getunbound.ai/models",
			// 	models: routerModels?.unbound ?? {},
			// },
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
		}),
		[
			apiConfiguration.costrictModelId,
			apiConfiguration.costrictBaseUrl,
			costrictModelList,
			openAiModels,
			routerModels,
		],
	)

	const config = providerConfig[selectedProvider as keyof typeof providerConfig] || {}

	const { t } = useAppTranslation()

	const { id: selectedModelId } = useSelectedModel(apiConfiguration)
	const defaultModelId =
		(apiConfiguration.apiProvider === "costrict"
			? apiConfiguration.costrictModelId
			: apiConfiguration.apiModelId) || config.defaultModelId
	const tooltip = showSelect
		? ""
		: defaultModelId
			? `${t("settings:modelPicker.label")}: ${defaultModelId}`
			: t("chat:selectModel")
	return (
		<>
			<div
				ref={anchorRef}
				className={cn(className, config?.modelIdKey || selectedProviderModels.length > 0 ? "" : "hidden")}>
				{config?.modelIdKey ? (
					<ModelPicker
						isChatBox={true}
						modelPickerId={isEditMode ? "modelPickerEdit" : "modelPicker"}
						apiConfiguration={apiConfiguration}
						setApiConfigurationField={setApiConfigurationFieldWithRef}
						defaultModelId={defaultModelId}
						models={config?.models ?? {}}
						modelIdKey={config.modelIdKey as any}
						serviceName={config.serviceName}
						serviceUrl={config.serviceUrl}
						organizationAllowList={organizationAllowList}
						showInfoView={false}
						showLabel={false}
						isStreaming={isStreaming}
						onRefreshModels={selectedProvider === "costrict" ? handleRefreshModels : undefined}
						isRefreshingModels={isRefreshing}
						triggerClassName="rounded-md max-w-80 px-[6px] text-xs h-6 opacity-90 hover:opacity-100 hover:bg-[rgba(255,255,255,0.03)] hover:border-[rgba(255,255,255,0.15)] cursor-pointer transition-all duration-150"
						popoverContentClassName="min-w-80 max-w-9/10 overflow-hidden text-xs"
						tooltip={tooltip}
					/>
				) : (
					selectedProviderModels.length > 0 && (
						<StandardTooltip content={tooltip}>
							<div>
								<Select
									open={showSelect}
									disabled={isStreaming}
									value={selectedModelId === "custom-arn" ? "custom-arn" : selectedModelId}
									onValueChange={(value) => {
										setApiConfigurationField(
											apiConfiguration.apiProvider === "costrict"
												? "costrictModelId"
												: "apiModelId",
											value,
										)

										// Clear custom ARN if not using custom ARN option.
										if (value !== "custom-arn" && selectedProvider === "bedrock") {
											setApiConfigurationField("awsCustomArn", "")
										}
									}}
									onOpenChange={(open) => {
										setShowSelect(open)
									}}>
									<SelectTrigger
										className={cn(
											"rounded-md w-full h-6 px-1.5 opacity-90 hover:opacity-100 bg-vscode-input-background hover:border-[rgba(255,255,255,0.15)]",
										)}
										showIcon={false}>
										<span className=" overflow-hidden text-ellipsis whitespace-nowrap">
											<Brain className="inline-block mr-1" />
											<SelectValue placeholder={t("settings:common.select")} />
										</span>
									</SelectTrigger>
									<SelectContent className="min-w-80 max-w-9/10 overflow-hidden">
										{selectedProviderModels.map((option) => (
											<SelectItem key={option.value} value={option.value}>
												{option.label}
											</SelectItem>
										))}
										{selectedProvider === "bedrock" && (
											<SelectItem value="custom-arn">
												{t("settings:labels.useCustomArn")}
											</SelectItem>
										)}
									</SelectContent>
								</Select>
							</div>
						</StandardTooltip>
					)
				)}
			</div>
			{autoSwitchNotice &&
				noticePortalContainer &&
				noticePos &&
				createPortal(
					<div
						role="status"
						style={{ position: "fixed", left: noticePos.left, bottom: noticePos.bottom, zIndex: 50 }}
						className="flex max-w-80 items-center gap-2 rounded-md border border-vscode-dropdown-border bg-vscode-input-background px-3 py-2 text-xs text-vscode-foreground shadow-lg">
						<Info className="size-3.5 shrink-0" />
						<span className="flex-1 whitespace-normal">
							{t("chat:modelAutoSwitched", { from: autoSwitchNotice.from, to: autoSwitchNotice.to })}
						</span>
						<X
							className="size-3.5 shrink-0 cursor-pointer opacity-70 hover:opacity-100"
							onClick={() => setAutoSwitchNotice(null)}
						/>
					</div>,
					noticePortalContainer,
				)}
		</>
	)
}

export default ProviderRenderer
