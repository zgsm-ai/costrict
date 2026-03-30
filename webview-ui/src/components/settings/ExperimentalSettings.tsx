import type { HTMLAttributes } from "react"
import React from "react"
import { VSCodeCheckbox } from "@vscode/webview-ui-toolkit/react"

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
	setExperimentEnabled: SetExperimentEnabled
	apiConfiguration?: any
	setApiConfigurationField?: any
	experimentSettings?: {
		smartMistakeDetectionConfig?: SmartMistakeDetectionConfig
	}
	setSmartMistakeDetectionConfig?: (config: SmartMistakeDetectionConfig) => void
	imageGenerationProvider?: ImageGenerationProvider
	openRouterImageApiKey?: string
	openRouterImageGenerationSelectedModel?: string
	setImageGenerationProvider?: (provider: ImageGenerationProvider) => void
	setOpenRouterImageApiKey?: (apiKey: string) => void
	setImageGenerationSelectedModel?: (model: string) => void
}

export const ExperimentalSettings = ({
	experiments,
	setExperimentEnabled,
	apiConfiguration,
	setApiConfigurationField,
	experimentSettings,
	setSmartMistakeDetectionConfig,
	imageGenerationProvider,
	openRouterImageApiKey,
	openRouterImageGenerationSelectedModel,
	setImageGenerationProvider,
	setOpenRouterImageApiKey,
	setImageGenerationSelectedModel,
	className,
	...props
}: ExperimentalSettingsProps) => {
	const { t } = useAppTranslation()

	return (
		<div className={cn("flex flex-col gap-2", className)} {...props}>
			<SectionHeader>{t("settings:sections.experimental")}</SectionHeader>

			<Section>
				{Object.entries(experimentConfigsMap)
					.filter(([key]) => key in EXPERIMENT_IDS)
					// Hide CHAT_SEARCH - moved to UI settings
					.filter(([key]) => key !== "CHAT_SEARCH")
					.filter(([key]) => key !== "POWER_STEERING")
					.map((config) => {
						// Use the same translation key pattern as ExperimentalFeature
						const experimentKey = config[0]
						const label = t(`settings:experimental.${experimentKey}.name`)

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
						if (config[0] === "USE_KPT_TREE") {
							return (
								<ExperimentalFeature
									key={config[0]}
									experimentKey={config[0]}
									enabled={
										experiments[EXPERIMENT_IDS[config[0] as keyof typeof EXPERIMENT_IDS]] ??
										apiConfiguration?.apiProvider === "costrict"
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
							const smartMistakeEnabled =
								experiments[EXPERIMENT_IDS[config[0] as keyof typeof EXPERIMENT_IDS]] ??
								apiConfiguration?.apiProvider === "costrict"
							const smartMistakeDetectionConfig = experimentSettings?.smartMistakeDetectionConfig ?? {}
							return (
								apiConfiguration?.apiProvider === "costrict" && (
									<SearchableSetting
										key={config[0]}
										settingId={`experimental-${config[0].toLowerCase()}`}
										section="experimental"
										label={label}>
										<ExperimentalFeature
											experimentKey={config[0]}
											enabled={smartMistakeEnabled}
											onChange={(enabled) =>
												setExperimentEnabled(
													EXPERIMENT_IDS[config[0] as keyof typeof EXPERIMENT_IDS],
													enabled,
												)
											}
										/>
										{smartMistakeEnabled && (
											<div className="ml-6 mt-1">
												<div>
													<div className="flex items-center gap-2">
														<VSCodeCheckbox
															checked={
																smartMistakeDetectionConfig.autoSwitchModel ?? false
															}
															onChange={(e: any) =>
																setSmartMistakeDetectionConfig?.({
																	...smartMistakeDetectionConfig,
																	autoSwitchModel: e.target.checked,
																})
															}>
															<span className="font-medium">
																{t(
																	"settings:experimental.SMART_MISTAKE_DETECTION.AUTO_SWITCH_MODEL.name",
																)}
															</span>
														</VSCodeCheckbox>
													</div>
													<p className="text-vscode-descriptionForeground text-sm mt-0">
														{t(
															"settings:experimental.SMART_MISTAKE_DETECTION.AUTO_SWITCH_MODEL.description",
														)}
													</p>
												</div>
											</div>
										)}{" "}
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
										apiConfiguration?.apiProvider === "costrict"
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
