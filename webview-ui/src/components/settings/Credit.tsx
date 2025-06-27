import { HTMLAttributes, useEffect, useState } from "react"
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
	const [hash, setHash] = useState("")

	useEffect(() => {
		const computeHash = async () => {
			const result = await hashToken(apiConfiguration.zgsmApiKey || "")

			console.log("New Credit hash: ", result)

			setHash(result)
		}
		computeHash()
	}, [apiConfiguration.zgsmApiKey])

	const href = `${apiConfiguration.zgsmBaseUrl || apiConfiguration.zgsmDefaultBaseUrl}/credit/manager?state=${hash}`

	return (
		<div className={cn("flex flex-col gap-2", className)} {...props}>
			<SectionHeader description={t("settings:sections.credit.description")}>
				<div className="flex items-center gap-2">
					<ChartPie className="w-4" />
					<div>{t("settings:sections.credit.title")}</div>
				</div>
			</SectionHeader>
			<Section>
				<VSCodeButtonLink href={href} target="_blank" type="button" disabled={!hash}>
					{t("settings:sections.credit.homepage")}
				</VSCodeButtonLink>
			</Section>
		</div>
	)
}

async function hashToken(token: string) {
	const encoder = new TextEncoder()
	const data = encoder.encode(token)
	const hashBuffer = await crypto.subtle.digest("SHA-256", data)
	return Array.from(new Uint8Array(hashBuffer))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("")
}
