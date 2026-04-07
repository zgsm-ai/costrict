import React from "react"
import { useTranslation } from "react-i18next"
import logoSvg from "../assets/logo.svg?raw"

export default function LoadingView({ loadingText }: { loadingText?: string }) {
	const { t } = useTranslation()

	return (
		<div className="absolute inset-0 flex flex-col bg-vscode-editor-background text-vscode-foreground">
			<div className="flex-1 flex items-center justify-center px-6">
				<div className="flex flex-col items-center gap-5 text-center">
					<div className="relative flex items-center justify-center">
						<div className="absolute size-20 rounded-full bg-vscode-button-background/10 animate-ping" />
						<div
							className="relative flex size-16 items-center justify-center rounded-2xl border border-vscode-panel-border bg-vscode-sideBar-background shadow-[0_0_30px_rgba(0,0,0,0.18)] overflow-hidden"
							style={{ animation: "loadingLogoFloat 1.8s ease-in-out infinite" }}>
							<div
								className="size-10 [&>svg]:w-full [&>svg]:h-full"
								style={{ animation: "loadingLogoGlow 1.8s ease-in-out infinite" }}
								dangerouslySetInnerHTML={{ __html: logoSvg }}
							/>
						</div>
					</div>

					<div className="flex flex-col items-center gap-2">
						<div className="text-base font-medium tracking-[0.18em] text-vscode-foreground/90">
							{t("common:costrictCli.brand")}
						</div>
						<div className="flex items-center gap-2 text-sm text-vscode-descriptionForeground">
							<span className="codicon codicon-loading codicon-modifier-spin text-base" />
							<span>{loadingText ?? t("common:ui.initializing_interface")}</span>
						</div>
					</div>

					<style>
						{`@keyframes loadingLogoFloat {
							0%, 100% { transform: translateY(0) scale(1); }
							50% { transform: translateY(-6px) scale(1.03); }
						}
						@keyframes loadingLogoGlow {
							0%, 100% { opacity: 0.92; filter: drop-shadow(0 0 6px rgba(56, 139, 253, 0.14)); }
							50% { opacity: 1; filter: drop-shadow(0 0 14px rgba(56, 139, 253, 0.28)); }
						}`}
					</style>
				</div>
			</div>
		</div>
	)
}
