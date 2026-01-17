import type { HTMLAttributes } from "react"
import React from "react"

import type { Experiments, ImageGenerationProvider, SmartMistakeDetectionConfig } from "@roo-code/types"

import { EXPERIMENT_IDS, experimentConfigsMap } from "@roo/experiments"

import { useAppTranslation } from "@src/i18n/TranslationContext"
import { cn } from "@src/lib/utils"

import { SetExperimentEnabled } from "./types"
import { SectionHeader } from "./SectionHeader"
import { Section } from "./Section"
import { SearchableSetting } from "./SearchableSetting"
import { ExperimentalFeature } from "./ExperimentalFeature"
import { ImageGenerationSettings } from "./ImageGenerationSettings"
import { CustomToolsSettings } from "./CustomToolsSettings"

type ExperimentalSettingsProps = HTMLAttributes<HTMLDivElement> & {
	experiments: Experiments
	experimentSettings?: {
		smartMistakeDetectionConfig?: {
			autoSwitchModel?: boolean
			autoSwitchModelThreshold?: number
		}
	}
	setExperimentEnabled: SetExperimentEnabled
	apiConfiguration?: any
	setApiConfigurationField?: any
	imageGenerationProvider?: ImageGenerationProvider
	openRouterImageApiKey?: string
	openRouterImageGenerationSelectedModel?: string
	setImageGenerationProvider?: (provider: ImageGenerationProvider) => void
	setOpenRouterImageApiKey?: (apiKey: string) => void
	setImageGenerationSelectedModel?: (model: string) => void
	setSmartMistakeDetectionConfig: (config: SmartMistakeDetectionConfig) => void
}

export const ExperimentalSettings = ({
	experiments,
	experimentSettings,
	setExperimentEnabled,
	apiConfiguration,
	setApiConfigurationField,
	imageGenerationProvider,
	openRouterImageApiKey,
	openRouterImageGenerationSelectedModel,
	setImageGenerationProvider,
	setOpenRouterImageApiKey,
	setImageGenerationSelectedModel,
	setSmartMistakeDetectionConfig,
	className,
	...props
}: ExperimentalSettingsProps) => {
	const { t } = useAppTranslation()

	const smartMistakeDetectionConfig = experimentSettings?.smartMistakeDetectionConfig || {
		autoSwitchModel: false,
		autoSwitchModelThreshold: 3,
	}

	return (
		<div className={cn("flex flex-col gap-2", className)} {...props}>
			<SectionHeader>{t("settings:sections.experimental")}</SectionHeader>

			<Section>
				{Object.entries(experimentConfigsMap)
					.filter(([key]) => key in EXPERIMENT_IDS)
					// Hide MULTIPLE_NATIVE_TOOL_CALLS - feature is on hold
					.filter(([key]) => key !== "MULTIPLE_NATIVE_TOOL_CALLS")
					// Hide CHAT_SEARCH - moved to UI settings
					.filter(([key]) => key !== "CHAT_SEARCH")
					.map((config) => {
						// Use the same translation key pattern as ExperimentalFeature
						const experimentKey = config[0]
						const label = t(`settings:experimental.${experimentKey}.name`)

						if (config[0] === "MULTI_FILE_APPLY_DIFF") {
							return (
								<SearchableSetting
									key={config[0]}
									settingId={`experimental-${config[0].toLowerCase()}`}
									section="experimental"
									label={label}>
									<ExperimentalFeature
										experimentKey={config[0]}
										enabled={experiments[EXPERIMENT_IDS.MULTI_FILE_APPLY_DIFF] ?? false}
										onChange={(enabled) =>
											setExperimentEnabled(EXPERIMENT_IDS.MULTI_FILE_APPLY_DIFF, enabled)
										}
									/>
								</SearchableSetting>
							)
						}
						if (
							config[0] === "IMAGE_GENERATION" &&
							setImageGenerationProvider &&
							setOpenRouterImageApiKey &&
							setImageGenerationSelectedModel
						) {
							return (
								<SearchableSetting
									key={config[0]}
									settingId={`experimental-${config[0].toLowerCase()}`}
									section="experimental"
									label={label}>
									<ImageGenerationSettings
										enabled={experiments[EXPERIMENT_IDS.IMAGE_GENERATION] ?? false}
										onChange={(enabled) =>
											setExperimentEnabled(EXPERIMENT_IDS.IMAGE_GENERATION, enabled)
										}
										imageGenerationProvider={imageGenerationProvider}
										openRouterImageApiKey={openRouterImageApiKey}
										openRouterImageGenerationSelectedModel={openRouterImageGenerationSelectedModel}
										setImageGenerationProvider={setImageGenerationProvider}
										setOpenRouterImageApiKey={setOpenRouterImageApiKey}
										setImageGenerationSelectedModel={setImageGenerationSelectedModel}
									/>
								</SearchableSetting>
							)
						}
						if (config[0] === "ALWAYS_INCLUDE_FILE_DETAILS") {
							return (
								<ExperimentalFeature
									key={config[0]}
									experimentKey={config[0]}
									enabled={
										experiments[EXPERIMENT_IDS[config[0] as keyof typeof EXPERIMENT_IDS]] ??
										apiConfiguration?.apiProvider === "zgsm"
									}
									onChange={(enabled) =>
										setExperimentEnabled(
											EXPERIMENT_IDS[config[0] as keyof typeof EXPERIMENT_IDS],
											enabled,
										)
									}
								/>
							)
						}
						if (config[0] === "SMART_MISTAKE_DETECTION") {
							return (
								apiConfiguration?.apiProvider === "zgsm" && (
									<SearchableSetting
										key={config[0]}
										settingId={`experimental-${config[0].toLowerCase()}`}
										section="experimental"
										label={label}>
										<div className="flex flex-col gap-2">
											<ExperimentalFeature
												experimentKey={config[0]}
												enabled={
													experiments[
														EXPERIMENT_IDS[config[0] as keyof typeof EXPERIMENT_IDS]
													] ?? apiConfiguration?.apiProvider === "zgsm"
												}
												onChange={(enabled) =>
													setExperimentEnabled(
														EXPERIMENT_IDS[config[0] as keyof typeof EXPERIMENT_IDS],
														enabled,
													)
												}
											/>
											{experiments[EXPERIMENT_IDS.SMART_MISTAKE_DETECTION] && (
												<div className="pl-6 flex flex-col gap-2">
													<ExperimentalFeature
														experimentKey="AUTO_SWITCH_MODEL"
														enabled={smartMistakeDetectionConfig.autoSwitchModel ?? false}
														onChange={(enabled) => {
															setSmartMistakeDetectionConfig?.({
																autoSwitchModel: enabled,
																autoSwitchModelThreshold:
																	smartMistakeDetectionConfig.autoSwitchModelThreshold ??
																	3,
															})
														}}
													/>
													{smartMistakeDetectionConfig.autoSwitchModel && (
														<div className="pl-6 flex items-center gap-2">
															<label className="text-sm text-vscode-foreground">
																切换阈值:
															</label>
															<input
																type="number"
																min="1"
																max="10"
																value={
																	smartMistakeDetectionConfig.autoSwitchModelThreshold ??
																	3
																}
																onChange={(e) => {
																	const value = parseInt(e.target.value)
																	if (!isNaN(value) && value >= 1 && value <= 10) {
																		setSmartMistakeDetectionConfig?.({
																			autoSwitchModel:
																				smartMistakeDetectionConfig.autoSwitchModel ??
																				false,
																			autoSwitchModelThreshold: value,
																		})
																	}
																}}
																className="w-16 px-2 py-1 text-sm bg-vscode-input-background border border-vscode-input-border rounded text-vscode-foreground focus:outline-none focus:border-vscode-focusBorder"
															/>
															<span className="text-sm text-vscode-descriptionForeground">
																次连续错误后切换
															</span>
														</div>
													)}
												</div>
											)}
										</div>
									</SearchableSetting>
								)
							)
						}

						if (config[0] === "COMMIT_REVIEW") {
							return (
								<ExperimentalFeature
									key={config[0]}
									experimentKey={config[0]}
									enabled={
										experiments[EXPERIMENT_IDS[config[0] as keyof typeof EXPERIMENT_IDS]] ??
										apiConfiguration?.apiProvider === "zgsm"
									}
									onChange={(enabled) =>
										setExperimentEnabled(
											EXPERIMENT_IDS[config[0] as keyof typeof EXPERIMENT_IDS],
											enabled,
										)
									}
								/>
							)
						}

						if (config[0] === "CUSTOM_TOOLS") {
							return (
								<SearchableSetting
									key={config[0]}
									settingId={`experimental-${config[0].toLowerCase()}`}
									section="experimental"
									label={label}>
									<CustomToolsSettings
										enabled={experiments[EXPERIMENT_IDS.CUSTOM_TOOLS] ?? false}
										onChange={(enabled) =>
											setExperimentEnabled(EXPERIMENT_IDS.CUSTOM_TOOLS, enabled)
										}
									/>
								</SearchableSetting>
							)
						}
						return (
							<SearchableSetting
								key={config[0]}
								settingId={`experimental-${config[0].toLowerCase()}`}
								section="experimental"
								label={label}>
								<ExperimentalFeature
									experimentKey={config[0]}
									enabled={
										experiments[EXPERIMENT_IDS[config[0] as keyof typeof EXPERIMENT_IDS]] ?? false
									}
									onChange={(enabled) =>
										setExperimentEnabled(
											EXPERIMENT_IDS[config[0] as keyof typeof EXPERIMENT_IDS],
											enabled,
										)
									}
								/>
							</SearchableSetting>
						)
					})}
			</Section>
		</div>
	)
}
