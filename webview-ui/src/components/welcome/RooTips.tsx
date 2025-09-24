import { VSCodeLink } from "@vscode/webview-ui-toolkit/react"
import { useTranslation } from "react-i18next"
import { Trans } from "react-i18next"

// import { buildDocLink } from "@src/utils/docLinks"
import { vscode } from "@/utils/vscode"
import { useCallback } from "react"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { ZgsmCodeMode } from "@roo/modes"

const tips = [
	{
		icon: "codicon-debug-all",
		click: (e?: any) => {
			e?.preventDefault()
		},
		disabled: true,
		titleKey: "rooTips.test.title",
		descriptionKey: "rooTips.test.description",
	},
	{
		icon: "codicon-book",
		click: (e: any) => {
			e.preventDefault()
			vscode.postMessage({
				type: "mode",
				text: "code",
			})
			// 调用 project-wiki 自定义指令
			vscode.postMessage({
				type: "newTask",
				text: "/project-wiki",
			})
		},
		titleKey: "rooTips.projectWiki.title",
		descriptionKey: "rooTips.projectWiki.description",
	},
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
	disabled?: boolean
	descriptionKey: string
}[]
const RooTips = () => {
	const { t } = useTranslation("chat")
	const { zgsmCodeMode, setZgsmCodeMode } = useExtensionState()
	const switchMode = useCallback(
		(slug: ZgsmCodeMode) => {
			setZgsmCodeMode(slug)
			vscode.postMessage({
				type: "zgsmCodeMode",
				text: slug,
			})
			vscode.postMessage({
				type: "mode",
				text: slug === "vibe" ? "code" : "workflow",
			})
		},
		[setZgsmCodeMode],
	)

	const providers = [
		{
			name: "Vibe",
			slug: "vibe",
			description: "Chat first, then build. Explore ideas and iterate as you discover needs.",
			// description: t("welcome:routers.openrouter.description"),
			incentive: `Great for:

Rapid exploration and testing
Building when requirements are unclear
Implementing a task`,
			switchMode: (e: React.MouseEvent<HTMLElement, MouseEvent>) => {
				e.stopPropagation()
				switchMode("vibe")
			},
		},
		{
			name: "Strict",
			slug: "workflow",
			description: "Chat first, then build. Explore ideas and iterate as you discover needs.",
			// description: t("welcome:routers.requesty.description"),
			// incentive: t("welcome:routers.requesty.incentive"),
			incentive: `Great for:
Thinking through features in-depth
Projects needing upfront planning
Building features in a structured way`,
			switchMode: (e: React.MouseEvent<HTMLElement, MouseEvent>) => {
				e.stopPropagation()
				switchMode("workflow")
			},
		},
	]
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
			<div className="flex flex-row flex-wrap items-center justify-center px-5 py-2.5 gap-4">
				{tips.map((tip) => (
					<div
						key={tip.titleKey}
						className="flex items-center gap-2 text-vscode-editor-foreground font-vscode w-[calc(50%-1rem)] max-w-[250px]">
						<span className={`codicon ${tip.icon}`}></span>
						<span>
							{tip.disabled ? (
								t(tip.titleKey)
							) : (
								<VSCodeLink className="forced-color-adjust-none" href="#" onClick={tip.click}>
									{t(tip.titleKey)}
								</VSCodeLink>
							)}
							: {t(tip.descriptionKey)}
						</span>
					</div>
				))}
			</div>
			<br />
			{providers.map((provider, index) => (
				<div
					key={`${index}${provider.slug}`}
					onClick={provider.switchMode}
					className={`flex-1 border border-vscode-panel-border hover:bg-secondary rounded-md py-3 px-4 mb-2 flex flex-row gap-3 cursor-pointer transition-all no-underline text-inherit ${zgsmCodeMode === provider.slug ? "border border-vscode-focusBorder outline outline-vscode-focusBorder focus-visible:ring-vscode-focusBorder" : ""}`}>
					<div>
						<div className="text-sm font-medium text-vscode-foreground">{provider.name}</div>
						<div>
							<div className="text-xs text-vscode-descriptionForeground">{provider.description}</div>
							{provider.incentive && <div className="text-xs mt-1">{provider.incentive}</div>}
						</div>
					</div>
				</div>
			))}
		</div>
	)
}

export default RooTips
