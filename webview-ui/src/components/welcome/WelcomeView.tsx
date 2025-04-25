import { useCallback, useState } from "react"
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react"
import { useExtensionState } from "../../context/ExtensionStateContext"
import { validateApiConfiguration } from "../../utils/validate"
import { vscode } from "../../utils/vscode"
import ApiOptions from "../settings/ApiOptions"
import { Tab, TabContent } from "../common/Tab"
import { useAppTranslation } from "../../i18n/TranslationContext"
import { getRequestyAuthUrl, getOpenRouterAuthUrl } from "../../oauth/urls"
import knuthShuffle from "knuth-shuffle-seeded"
import { initiateZgsmLogin } from "../../utils/zgsmAuth"
import { zgsmProviderKey } from "../../../../src/shared/api"

const WelcomeView = () => {
	const { apiConfiguration, currentApiConfigName, setApiConfiguration, uriScheme, machineId } = useExtensionState()
	const { t } = useAppTranslation()
	const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined)

	const handleSubmit = useCallback(() => {
		const error = validateApiConfiguration(apiConfiguration)

		if (error) {
			setErrorMessage(error)
			return
		}

		setErrorMessage(undefined)

		if (apiConfiguration?.apiProvider === zgsmProviderKey) {
			// Initiate ZGSM login process
			initiateZgsmLogin(apiConfiguration, uriScheme)
		} else {
			vscode.postMessage({ type: "upsertApiConfiguration", text: currentApiConfigName, apiConfiguration })
		}
	}, [apiConfiguration, currentApiConfigName, uriScheme])

	// Using a lazy initializer so it reads once at mount
	const [imagesBaseUri] = useState(() => {
		const w = window as any
		return w.IMAGES_BASE_URI || ""
	})

	return (
		<Tab>
			<TabContent className="flex flex-col gap-5">
				<h2 className="m-0 p-0">{t("welcome:greeting")}</h2>
				<div>{t("welcome:introduction")}</div>
				<div>{t("welcome:chooseProvider")}</div>
				<div className="mb-4">
					{apiConfiguration?.apiProvider !== zgsmProviderKey && (
						<>
							<h4 className="mt-3 mb-2">{t("welcome:startRouter")}</h4>

							<div className="flex gap-4">
								{/* Define the providers */}
								{(() => {
									// Provider card configuration
									const providers = [
										{
											slug: "requesty",
											name: "Requesty",
											description: t("welcome:routers.requesty.description"),
											incentive: t("welcome:routers.requesty.incentive"),
											authUrl: getRequestyAuthUrl(uriScheme),
										},
										{
											slug: "openrouter",
											name: "OpenRouter",
											description: t("welcome:routers.openrouter.description"),
											authUrl: getOpenRouterAuthUrl(uriScheme),
										},
									]

									// Shuffle providers based on machine ID (will be consistent for the same machine)
									const orderedProviders = [...providers]
									knuthShuffle(orderedProviders, (machineId as any) || Date.now())

									// Render the provider cards
									return orderedProviders.map((provider, index) => (
										<a
											key={index}
											href={provider.authUrl}
											className="flex-1 border border-vscode-panel-border rounded p-4 flex flex-col items-center cursor-pointer transition-all hover:bg-vscode-button-hoverBackground hover:border-vscode-button-border no-underline text-inherit"
											target="_blank"
											rel="noopener noreferrer">
											<div className="w-16 h-16 flex items-center justify-center rounded mb-2 overflow-hidden bg-white relative">
												<img
													src={`${imagesBaseUri}/${provider.slug}.png`}
													alt={provider.name}
													className="w-full h-full object-contain p-2"
												/>
											</div>
											<div className="text-center">
												<div className="font-bold">{provider.name}</div>
												<div className="text-sm text-vscode-descriptionForeground">
													{provider.description}
												</div>
												{provider.incentive && (
													<div className="text-sm font-bold">{provider.incentive}</div>
												)}
											</div>
										</a>
									))
								})()}
							</div>

							<div className="text-center my-4">{t("welcome:or")}</div>
							<h4 className="mt-3 mb-2">{t("welcome:startCustom")}</h4>
						</>
					)}
					<ApiOptions
						fromWelcomeView
						apiConfiguration={apiConfiguration || {}}
						uriScheme={uriScheme}
						setApiConfigurationField={(field, value) => setApiConfiguration({ [field]: value })}
						errorMessage={errorMessage}
						setErrorMessage={setErrorMessage}
					/>
				</div>
			</TabContent>
			<div className="sticky bottom-0 bg-vscode-sideBar-background p-5">
				<div className="flex flex-col gap-1">
					<VSCodeButton onClick={handleSubmit} appearance="primary">
						{apiConfiguration?.apiProvider === zgsmProviderKey
							? t("welcome:getZgsmApiKey")
							: t("welcome:start")}
					</VSCodeButton>
					{errorMessage && <div className="text-vscode-errorForeground">{errorMessage}</div>}
				</div>
			</div>
		</Tab>
	)
}

export default WelcomeView
