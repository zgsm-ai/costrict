import { HTMLAttributes } from "react"
import { useAppTranslation } from "@/i18n/TranslationContext"
import { ChartPie } from "lucide-react"
import { cn } from "@/lib/utils"
import { SectionHeader } from "./SectionHeader"
import { Section } from "./Section"
import { VSCodeButtonLink } from "../common/VSCodeButtonLink"
import { ProviderSettings } from "@roo/schemas"

type CreditProps = HTMLAttributes<HTMLDivElement> & {
	apiConfiguration: ProviderSettings
}

export const Credit = ({ apiConfiguration, className, ...props }: CreditProps) => {
	const { t } = useAppTranslation()
	// const href
	const href = `${apiConfiguration.zgsmBaseUrl || apiConfiguration.zgsmDefaultBaseUrl}/?state=${apiConfiguration.zgsmTokenHash || ""}`
	return (
		<div className={cn("flex flex-col gap-2", className)} {...props}>
			<SectionHeader
				description={t(
					"诸葛神码官方提供了多种高级模型，不同模型的每次请求消耗的Credit不同，当Credit消耗完后，该模型将不可用。",
				)}>
				<div className="flex items-center gap-2">
					<ChartPie className="w-4" />
					<div>{t("settings:sections.credit")}</div>
				</div>
			</SectionHeader>
			<Section>
				{JSON.stringify(apiConfiguration)}
				{href}
				<VSCodeButtonLink href={href} target="_blank" type="button" disabled={!apiConfiguration.zgsmTokenHash}>
					{t("查看 Credit 用量")}
				</VSCodeButtonLink>
			</Section>
		</div>
	)
}
