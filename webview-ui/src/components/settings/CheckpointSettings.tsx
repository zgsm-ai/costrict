import { HTMLAttributes } from "react"
import { useAppTranslation } from "@/i18n/TranslationContext"
import { VSCodeCheckbox, VSCodeLink } from "@vscode/webview-ui-toolkit/react"
import { Trans } from "react-i18next"
import { buildDocLink } from "@src/utils/docLinks"
import { Slider, Input, StandardTooltip } from "@/components/ui"
import { AutoCleanupSettings as AutoCleanupSettingsType } from "@roo-code/types"

import { SetCachedStateField } from "./types"
import { SectionHeader } from "./SectionHeader"
import { Section } from "./Section"
import { SearchableSetting } from "./SearchableSetting"
import { AutoCleanupSettings } from "./AutoCleanupSettings"
import {
	DEFAULT_CHECKPOINT_TIMEOUT_SECONDS,
	MAX_CHECKPOINT_TIMEOUT_SECONDS,
	MIN_CHECKPOINT_TIMEOUT_SECONDS,
} from "@roo-code/types"
import { vscode } from "@/utils/vscode"

type CheckpointSettingsProps = HTMLAttributes<HTMLDivElement> & {
	enableCheckpoints?: boolean
	checkpointTimeout?: number
	customStoragePath?: string
	autoCleanup?: AutoCleanupSettingsType
	setCachedStateField: SetCachedStateField<
		"enableCheckpoints" | "checkpointTimeout" | "customStoragePath" | "autoCleanup"
	>
}

export const CheckpointSettings = ({
	enableCheckpoints,
	checkpointTimeout,
	customStoragePath,
	autoCleanup,
	setCachedStateField,
	...props
}: CheckpointSettingsProps) => {
	const { t } = useAppTranslation()
	const trimmedCustomStoragePath = customStoragePath?.trim() ?? ""
	const hasCustomStoragePath = trimmedCustomStoragePath.length > 0

	return (
		<div {...props}>
			<SectionHeader>{t("settings:sections.checkpoints")}</SectionHeader>

			<Section>
				<SearchableSetting
					settingId="checkpoints-enable"
					section="checkpoints"
					label={t("settings:checkpoints.enable.label")}>
					<VSCodeCheckbox
						checked={enableCheckpoints}
						onChange={(e: any) => {
							setCachedStateField("enableCheckpoints", e.target.checked)
						}}>
						<span className="font-medium">{t("settings:checkpoints.enable.label")}</span>
					</VSCodeCheckbox>
					<div className="text-vscode-descriptionForeground text-sm mt-1">
						<Trans i18nKey="settings:checkpoints.enable.description">
							<VSCodeLink
								href={buildDocLink("features/checkpoints", "settings_checkpoints")}
								style={{ display: "inline" }}>
								{" "}
							</VSCodeLink>
						</Trans>
					</div>
				</SearchableSetting>

				{enableCheckpoints && (
					<SearchableSetting
						settingId="checkpoints-timeout"
						section="checkpoints"
						label={t("settings:checkpoints.timeout.label")}
						className="mt-4">
						<label className="block text-sm font-medium mb-2">
							{t("settings:checkpoints.timeout.label")}
						</label>
						<div className="flex items-center gap-2">
							<Slider
								min={MIN_CHECKPOINT_TIMEOUT_SECONDS}
								max={MAX_CHECKPOINT_TIMEOUT_SECONDS}
								step={1}
								defaultValue={[checkpointTimeout ?? DEFAULT_CHECKPOINT_TIMEOUT_SECONDS]}
								onValueChange={([value]) => {
									setCachedStateField("checkpointTimeout", value)
								}}
								className="flex-1"
								data-testid="checkpoint-timeout-slider"
							/>
							<span className="w-12 text-center">
								{checkpointTimeout ?? DEFAULT_CHECKPOINT_TIMEOUT_SECONDS}
							</span>
						</div>
						<div className="text-vscode-descriptionForeground text-sm mt-1">
							{t("settings:checkpoints.timeout.description")}
						</div>
					</SearchableSetting>
				)}
			</Section>

			<Section className="mt-6">
				<SearchableSetting
					settingId="checkpoints-custom-storage-path"
					section="checkpoints"
					label={t("settings:checkpoints.customStoragePath.label")}>
					<label className="block text-sm font-medium mb-2">
						{t("settings:checkpoints.customStoragePath.label")}
					</label>
					<div className="relative">
						<Input
							type="text"
							value={customStoragePath ?? ""}
							placeholder={t("settings:checkpoints.customStoragePath.dialogTitle")}
							readOnly
							className={`w-full rounded-full cursor-pointer ${hasCustomStoragePath ? "pr-16" : "pr-10"}`}
							onClick={() => vscode.postMessage({ type: "browseForCustomStoragePath" })}
							data-testid="checkpoint-custom-storage-path-input"
						/>
						{hasCustomStoragePath && (
							<StandardTooltip content={t("settings:checkpoints.customStoragePath.clear")}>
								<button
									type="button"
									className="absolute right-9 top-1/2 -translate-y-1/2 text-vscode-descriptionForeground hover:text-vscode-foreground transition-colors cursor-pointer"
									onClick={(e) => {
										e.stopPropagation()
										setCachedStateField("customStoragePath", "")
									}}
									aria-label={t("settings:checkpoints.customStoragePath.clear")}
									data-testid="checkpoint-custom-storage-path-clear">
									<span className="codicon codicon-close text-sm" />
								</button>
							</StandardTooltip>
						)}
						<StandardTooltip content={t("settings:checkpoints.customStoragePath.browse")}>
							<button
								type="button"
								className="absolute right-3 top-1/2 -translate-y-1/2 text-vscode-descriptionForeground hover:text-vscode-foreground transition-colors cursor-pointer"
								onClick={() => vscode.postMessage({ type: "browseForCustomStoragePath" })}
								aria-label={t("settings:checkpoints.customStoragePath.browse")}
								data-testid="checkpoint-custom-storage-path-browse">
								<span className="codicon codicon-folder-opened text-sm" />
							</button>
						</StandardTooltip>
					</div>
					<div className="text-vscode-descriptionForeground text-sm mt-2">
						{t("settings:checkpoints.customStoragePath.description")}
					</div>
				</SearchableSetting>
			</Section>

			<AutoCleanupSettings autoCleanup={autoCleanup} setCachedStateField={setCachedStateField} className="mt-8" />
		</div>
	)
}
