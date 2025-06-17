import { useAppTranslation } from "@/i18n/TranslationContext"
import logo from "@/assets/logo.svg"

const WelcomePage = () => {
	const { t } = useAppTranslation()

	return (
		<div className="welcome-page-container flex flex-col items-center justify-start h-full w-full bg-vscode-sideBar-background text-vscode-foreground pt-[100px] px-[10px]">
			<div className="welcome-page flex flex-col items-center w-full max-w-[500px] text-center">
				<div className="image-placeholder w-[60px] h-[60px] mb-6 flex items-center justify-center">
					<img src={logo} alt="logo" className="w-[60px] h-[60px]" />
				</div>

				<div className="title text-[16px] font-semibold text-vscode-editorInfo-foreground">
					{t("codereview:welcomePage.title")}
				</div>
				<div className="subtitle text-[13px] text-vscode-editor-foreground mb-[28px] leading-relaxed">
					{t("codereview:welcomePage.subtitle")}
				</div>

				<div className="tips-card bg-vscode-editorWidget-background rounded-md w-full text-left border border-vscode-inputOption-activeBorder bg-vscode-list-activeSelectionBackground pb-1">
					<div className="tips-header flex items-center font-medium text-sm p-4 pb-2">
						<i className="codicon codicon-lightbulb mr-2 text-lg"></i>
						<span>Tips</span>
					</div>
					<div className="tips-content text-[13px] text-vscode-descriptionForeground bg-vscode-sideBar-background mx-1 px-3 py-4">
						<span className="block mb-2 leading-normal">{t("codereview:welcomePage.tips1")}</span>
						<span className="block leading-normal">{t("codereview:welcomePage.tips2")}</span>
					</div>
				</div>
			</div>
		</div>
	)
}

export default WelcomePage
