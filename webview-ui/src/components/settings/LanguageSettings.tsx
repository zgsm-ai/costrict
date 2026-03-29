import { HTMLAttributes } from "react"
import { useAppTranslation } from "@/i18n/TranslationContext"

import type { Language } from "@roo-code/types"

import { COSTRICT_LANGUAGES as LANGUAGES } from "@roo/language"

import { cn } from "@src/lib/utils"
import {
	SearchableSelect /* Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue */,
} from "@src/components/ui"

import { SetCachedStateField } from "./types"
import { SectionHeader } from "./SectionHeader"
import { Section } from "./Section"
import { SearchableSetting } from "./SearchableSetting"

type LanguageSettingsProps = HTMLAttributes<HTMLDivElement> & {
	language: string
	setCachedStateField: SetCachedStateField<"language">
}

export const LanguageSettings = ({ language, setCachedStateField, className, ...props }: LanguageSettingsProps) => {
	const { t } = useAppTranslation()

	return (
		<div className={cn("flex flex-col gap-2", className)} {...props}>
			<SectionHeader>{t("settings:sections.language")}</SectionHeader>

			<Section>
				<SearchableSetting
					settingId="language-select"
					section="language"
					label={t("settings:sections.language")}>
					<SearchableSelect
						value={language}
						onValueChange={(value) => setCachedStateField("language", value as Language)}
						options={Object.entries(LANGUAGES).map(([code, name]) => ({ value: code, label: name }))}
						placeholder={t("settings:common.select")}
						searchPlaceholder={""}
						emptyMessage={""}
						disabledSearch
						className="w-full"
						data-testid="provider-select"
					/>
				</SearchableSetting>
			</Section>
		</div>
	)
}
