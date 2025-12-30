import { HTMLAttributes } from "react"
import React, { useCallback } from "react"
import { useAppTranslation } from "@/i18n/TranslationContext"
import { VSCodeCheckbox } from "@vscode/webview-ui-toolkit/react"
import { Trash2, Clock, ListFilter } from "lucide-react"
import { CleanupStrategy, DEFAULT_AUTO_CLEANUP_SETTINGS, AutoCleanupSettings as AutoCleanupSettingsType } from "@roo-code/types"

import { cn } from "@/lib/utils"
import { Slider, Select, SelectContent, SelectItem, SelectItemText, SelectTrigger, Input } from "@/components/ui"
import { SectionHeader } from "./SectionHeader"
import { Section } from "./Section"
import { SetCachedStateField } from "./types"

type AutoCleanupSettingsProps = HTMLAttributes<HTMLDivElement> & {
	autoCleanup?: AutoCleanupSettingsType
	setCachedStateField: SetCachedStateField<"autoCleanup">
}

export const AutoCleanupSettings = ({
	autoCleanup,
	setCachedStateField,
	className,
	...props
}: AutoCleanupSettingsProps) => {
	const { t } = useAppTranslation()

	const settings = autoCleanup ?? DEFAULT_AUTO_CLEANUP_SETTINGS
	const {
		enabled = DEFAULT_AUTO_CLEANUP_SETTINGS.enabled,
		strategy = DEFAULT_AUTO_CLEANUP_SETTINGS.strategy,
		retentionDays = DEFAULT_AUTO_CLEANUP_SETTINGS.retentionDays,
		maxHistoryCount = DEFAULT_AUTO_CLEANUP_SETTINGS.maxHistoryCount,
		excludeActive = DEFAULT_AUTO_CLEANUP_SETTINGS.excludeActive,
		cleanupOnStartup = DEFAULT_AUTO_CLEANUP_SETTINGS.cleanupOnStartup,
	} = settings

	// 更新设置到 cachedState
	const handleSettingsUpdate = useCallback((updatedSettings: Partial<typeof settings>) => {
		const newSettings = { ...settings, ...updatedSettings }
		setCachedStateField("autoCleanup", newSettings)
	}, [settings, setCachedStateField])

	return (
		<div className={cn("flex flex-col gap-2", className)} {...props}>
			<SectionHeader description={t("settings:autoCleanup.description")}>
				<div className="flex items-center gap-2">
					<Trash2 className="w-4" />
					<div>{t("settings:sections.autoCleanup")}</div>
				</div>
			</SectionHeader>

			<Section>
				{/* Enable/Disable */}
				<VSCodeCheckbox
					checked={enabled}
					onChange={(e: any) => {
						handleSettingsUpdate({ enabled: e.target.checked })
					}}
					data-testid="auto-cleanup-enabled-checkbox">
					<label className="block font-medium mb-1">
						{t("settings:autoCleanup.enabled.label")}
					</label>
				</VSCodeCheckbox>
				<div className="text-vscode-descriptionForeground text-sm mt-1 mb-3">
					{t("settings:autoCleanup.enabled.description")}
				</div>

				{enabled && (
					<>
						{/* Strategy Selection */}
						<div>
							<span className="block font-medium mb-1">
								{t("settings:autoCleanup.strategy.label")}
							</span>
							<Select
								value={strategy}
								onValueChange={(value) => handleSettingsUpdate({ strategy: value as CleanupStrategy })}
								data-testid="auto-cleanup-strategy-select">
								<SelectTrigger className="w-full">
									{ strategy === CleanupStrategy.BASED_ON_COUNT ? t("settings:autoCleanup.strategy.basedOnCount.label") : t("settings:autoCleanup.strategy.basedOnTime.label")}
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={CleanupStrategy.BASED_ON_TIME}>
										<div className="flex items-center gap-2 w-full">
											<Clock className="w-4 h-4 shrink-0" />
											<div className="flex flex-col">
												<SelectItemText>{t("settings:autoCleanup.strategy.basedOnTime.label")}</SelectItemText>
												<span className="text-xs text-vscode-descriptionForeground">
													{t("settings:autoCleanup.strategy.basedOnTime.description")}
												</span>
											</div>
										</div>
									</SelectItem>
									<SelectItem value={CleanupStrategy.BASED_ON_COUNT}>
										<div className="flex items-center gap-2 w-full">
											<ListFilter className="w-4 h-4 shrink-0" />
											<div className="flex flex-col">
												<SelectItemText>{t("settings:autoCleanup.strategy.basedOnCount.label")}</SelectItemText>
												<span className="text-xs text-vscode-descriptionForeground">
													{t("settings:autoCleanup.strategy.basedOnCount.description")}
												</span>
											</div>
										</div>
									</SelectItem>
									{/* <SelectItem value={CleanupStrategy.BASED_ON_SIZE} disabled={true}>
										<div className="flex items-center gap-2 w-full">
											<Database className="w-4 h-4 shrink-0" />
											<div className="flex flex-col">
												<SelectItemText>{t("settings:autoCleanup.strategy.basedOnSize.label")}</SelectItemText>
												<span className="text-xs text-vscode-descriptionForeground">
													{t("settings:autoCleanup.strategy.basedOnSize.description")}
												</span>
											</div>
										</div>
									</SelectItem> */}
								</SelectContent>
							</Select>
						</div>

						{/* Strategy-specific settings */}
						{strategy === CleanupStrategy.BASED_ON_TIME && (
							<div className="mt-3">
								<span className="block font-medium mb-1">
									{t("settings:autoCleanup.retentionDays.label")}
								</span>
								<div className="flex items-center gap-2">
									<Slider
										min={1}
										max={365}
										step={1}
										value={[retentionDays!]}
										onValueChange={([value]) => {
											handleSettingsUpdate({ retentionDays: value })
										}}
										data-testid="retention-days-slider"
									/>
									<span className="w-20">{retentionDays}</span>
								</div>
								<div className="text-vscode-descriptionForeground text-sm mt-1">
									{t("settings:autoCleanup.retentionDays.description")}
								</div>
							</div>
						)}

						{strategy === CleanupStrategy.BASED_ON_COUNT && (
							<div className="mt-3">
								<span className="block font-medium mb-1">
									{t("settings:autoCleanup.maxHistoryCount.label")}
								</span>
								<div className="flex items-center gap-2">
									<Input
										type="number"
										pattern="[0-9]*"
										className="w-24 bg-vscode-input-background text-vscode-input-foreground border border-vscode-input-border px-2 py-1 rounded text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
										value={maxHistoryCount}
										min={10}
										max={500}
										onChange={(e) => {
											const newValue = parseInt(e.target.value, 10)
											if (!isNaN(newValue) && newValue >= 10 && newValue <= 500) {
												handleSettingsUpdate({ maxHistoryCount: newValue })
											}
										}}
										onClick={(e) => e.currentTarget.select()}
										data-testid="max-history-count-input"
									/>
									<span>{t("settings:autoCleanup.maxHistoryCount.tasks")}</span>
								</div>
								<div className="text-vscode-descriptionForeground text-sm mt-1">
									{t("settings:autoCleanup.maxHistoryCount.description")}
								</div>
							</div>
						)}

						{/* Protect active task */}
						<div className="mt-3">
							<VSCodeCheckbox
								checked={excludeActive}
								onChange={(e: any) => {
									handleSettingsUpdate({ excludeActive: e.target.checked })
								}}
								data-testid="exclude-active-task-checkbox">
								<label className="block font-medium mb-1">
									{t("settings:autoCleanup.excludeActive.label")}
								</label>
							</VSCodeCheckbox>
							<div className="text-vscode-descriptionForeground text-sm mt-1 mb-3">
								{t("settings:autoCleanup.excludeActive.description")}
							</div>
						</div>

						{/* Cleanup on startup */}
						<div>
							<VSCodeCheckbox
								checked={cleanupOnStartup}
								onChange={(e: any) => {
									handleSettingsUpdate({ cleanupOnStartup: e.target.checked })
								}}
								data-testid="cleanup-on-startup-checkbox">
								<label className="block font-medium mb-1">
									{t("settings:autoCleanup.cleanupOnStartup.label")}
								</label>
							</VSCodeCheckbox>
							<div className="text-vscode-descriptionForeground text-sm mt-1 mb-3">
								{t("settings:autoCleanup.cleanupOnStartup.description")}
							</div>
						</div>
					</>
				)}
			</Section>
		</div>
	)
}
