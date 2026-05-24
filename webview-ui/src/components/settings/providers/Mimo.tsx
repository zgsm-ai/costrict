import { useCallback } from "react"
import { VSCodeTextField, VSCodeDropdown, VSCodeOption } from "@vscode/webview-ui-toolkit/react"

import type { ProviderSettings } from "@roo-code/types"

import { useAppTranslation } from "@src/i18n/TranslationContext"
import { VSCodeButtonLink } from "@src/components/common/VSCodeButtonLink"

import { inputEventTransform } from "../transforms"
import { cn } from "@/lib/utils"

type MimoProps = {
	apiConfiguration: ProviderSettings
	setApiConfigurationField: (field: keyof ProviderSettings, value: ProviderSettings[keyof ProviderSettings]) => void
}

export const Mimo = ({ apiConfiguration, setApiConfigurationField }: MimoProps) => {
	const { t } = useAppTranslation()

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

	return (
		<>
			<div>
				<label className="block font-medium mb-1">{t("settings:providers.mimoBaseUrl")}</label>
				<VSCodeDropdown
					value={apiConfiguration.mimoBaseUrl}
					onChange={handleInputChange("mimoBaseUrl")}
					className={cn("w-full")}>
					<VSCodeOption value="https://token-plan-sgp.xiaomimimo.com/v1" className="p-2">
						{t("settings:providers.mimoBaseUrlSingapore")}
					</VSCodeOption>
					<VSCodeOption value="https://token-plan-cn.xiaomimimo.com/v1" className="p-2">
						{t("settings:providers.mimoBaseUrlChina")}
					</VSCodeOption>
					<VSCodeOption value="https://token-plan-ams.xiaomimimo.com/v1" className="p-2">
						{t("settings:providers.mimoBaseUrlEurope")}
					</VSCodeOption>
					<VSCodeOption value="https://api.xiaomimimo.com/v1" className="p-2">
						{t("settings:providers.mimoBaseUrlPayg")}
					</VSCodeOption>
				</VSCodeDropdown>
			</div>
			<div>
				<VSCodeTextField
					value={apiConfiguration?.mimoApiKey || ""}
					type="password"
					onInput={handleInputChange("mimoApiKey")}
					placeholder={t("settings:placeholders.apiKey")}
					className="w-full">
					<label className="block font-medium mb-1">{t("settings:providers.mimoApiKey")}</label>
				</VSCodeTextField>
				<div className="text-sm text-vscode-descriptionForeground">
					{t("settings:providers.apiKeyStorageNotice")}
				</div>
				{!apiConfiguration?.mimoApiKey && (
					<VSCodeButtonLink href="https://platform.xiaomimimo.com" appearance="secondary">
						{t("settings:providers.getMimoApiKey")}
					</VSCodeButtonLink>
				)}
			</div>
		</>
	)
}
