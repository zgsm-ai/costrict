import { VSCodeLink } from "@vscode/webview-ui-toolkit/react"
import { useTranslation } from "react-i18next"
import { Trans } from "react-i18next"

// import { buildDocLink } from "@src/utils/docLinks"
import { vscode } from "@/utils/vscode"

const tips = [
	{
		icon: "codicon-account",
		// href: buildDocLink("basic-usage/using-modes", "tips"),
		click: (e?: any) => {
			e?.preventDefault()
			window.postMessage({
				type: "action",
				action: "promptsButtonClicked",
			})
			setTimeout(() => {
				window.postMessage({
					type: "action",
					action: "openCreateModeDialog",
				})
			}, 16)
		},
		titleKey: "rooTips.customizableModes.title",
		descriptionKey: "rooTips.customizableModes.description",
	},
	{
		icon: "codicon-list-tree",
		// href: buildDocLink("features/boomerang-tasks", "tips"),
		click: (e: any) => {
			e.preventDefault()
			vscode.postMessage({
				type: "mode",
				text: "orchestrator",
			})
			window.postMessage({
				type: "action",
				action: "promptsButtonClicked",
			})
		},
		titleKey: "rooTips.boomerangTasks.title",
		descriptionKey: "rooTips.boomerangTasks.description",
	},
] as {
	icon: string
	href?: string
	click: (e?: any) => void
	titleKey: string
	descriptionKey: string
}[]

const RooTips = () => {
	const { t } = useTranslation("chat")

	return (
		<div>
			<p className="text-vscode-editor-foreground leading-tight font-vscode-font-family text-center text-balance max-w-[380px] mx-auto my-0">
				<Trans
					i18nKey="chat:about"
					components={{
						DocsLink: (
							<a href="https://costrict.ai/" target="_blank" rel="noopener noreferrer">
								the docs
							</a>
						),
					}}
				/>
			</p>
			<div className="flex flex-col items-center justify-center px-5 py-2.5 gap-4">
				{tips.map((tip) => (
					<div
						key={tip.titleKey}
						className="flex items-center gap-2 text-vscode-editor-foreground font-vscode max-w-[250px]">
						<span className={`codicon ${tip.icon}`}></span>
						<span>
							<VSCodeLink className="forced-color-adjust-none" href="#" onClick={tip.click}>
								{t(tip.titleKey)}
							</VSCodeLink>
							: {t(tip.descriptionKey)}
						</span>
					</div>
				))}
			</div>
		</div>
	)
}

export default RooTips
