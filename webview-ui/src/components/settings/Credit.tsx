import { HTMLAttributes } from "react"
import { useAppTranslation } from "@/i18n/TranslationContext"
import { ChartPie } from "lucide-react"

import { TelemetrySetting } from "@roo/shared/TelemetrySetting"

import { vscode } from "@/utils/vscode"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui"

import { SectionHeader } from "./SectionHeader"
import { Section } from "./Section"

type CreditProps = HTMLAttributes<HTMLDivElement> & {
	version: string
	telemetrySetting: TelemetrySetting
	setTelemetrySetting: (setting: TelemetrySetting) => void
}

export const Credit = ({ className, ...props }: CreditProps) => {
	const { t } = useAppTranslation()

	return (
		<div className={cn("flex flex-col gap-2", className)} {...props}>
			{/* <SectionHeader description={t("settings:autoApprove.description")}> */}
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
				<Button onClick={() => vscode.postMessage({ type: "exportSettings" })} className="w-34">
					{/* <Upload className="p-0.5" /> */}
					{/* <SquareArrowOutUpRight /> */}
					{t("查看 Credit 用量")}
					{/* {t("settings:footer.settings.export")} */}
				</Button>
			</Section>
		</div>
	)
}
