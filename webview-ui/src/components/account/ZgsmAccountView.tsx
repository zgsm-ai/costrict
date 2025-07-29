import { useCallback, useEffect, useRef, useState } from "react"
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react"

import type { ProviderSettings } from "@roo-code/types"
import { TelemetryEventName } from "@roo-code/types"

import { useAppTranslation } from "@src/i18n/TranslationContext"
import { vscode } from "@src/utils/vscode"
import { telemetryClient } from "@src/utils/TelemetryClient"
import { ZgsmUserInfo } from "../../../../src/core/costrict/auth"
import axios from "axios"
import { useEvent } from "react-use"
import { ExtensionMessage } from "@roo/ExtensionMessage"

type AccountViewProps = {
	apiConfiguration?: ProviderSettings
	onDone: () => void
}

export const ZgsmAccountView = ({ apiConfiguration, onDone }: AccountViewProps) => {
	const { t } = useAppTranslation()
	const [userInfo, setUserInfo] = useState<ZgsmUserInfo | null>(null)
	const [hash, setHash] = useState("")
	const [logoPic, setLogoPic] = useState("")

	const wasAuthenticatedRef = useRef(false)

	const rooLogoUri = (window as any).COSTRICT_BASE_URI + "/logo.svg"

	// Track authentication state changes to detect successful logout
	useEffect(() => {
		const token = apiConfiguration?.zgsmAccessToken

		if (token) {
			wasAuthenticatedRef.current = true

			const jwt = parseJwt(token)

			const basicInfo: ZgsmUserInfo = {
				id: jwt.id,
				name: jwt?.properties?.oauth_GitHub_username || jwt.id,
				picture: undefined,
				email: jwt.email,
				phone: jwt.phone,
				organizationName: jwt.organizationName,
				organizationImageUrl: jwt.organizationImageUrl,
			}
			setUserInfo(basicInfo)

			if (jwt.avatar) {
				imageUrlToBase64(jwt.avatar).then((base64) => {
					if (!base64) return
					// Step 3: 更新 userInfo.picture，仅更新 picture 字段
					setLogoPic(base64)
				})
			}

			hashToken(token).then((result) => {
				console.log("New Credit hash: ", result)
				setHash(result)
			})
		} else if (wasAuthenticatedRef.current && !token) {
			telemetryClient.capture(TelemetryEventName.ACCOUNT_LOGOUT_SUCCESS)
			wasAuthenticatedRef.current = false
		}
	}, [apiConfiguration?.zgsmAccessToken])

	const handleConnectClick = () => {
		// Send telemetry for account connect action
		telemetryClient.capture(TelemetryEventName.ACCOUNT_CONNECT_CLICKED)

		vscode.postMessage({ type: "zgsmLogin", apiConfiguration })
	}

	const handleLogoutClick = () => {
		// Send telemetry for account logout action
		telemetryClient.capture(TelemetryEventName.ACCOUNT_LOGOUT_CLICKED)
		vscode.postMessage({ type: "zgsmLogout" })
	}

	const handleVisitCloudWebsite = () => {
		// Send telemetry for cloud website visit
		telemetryClient.capture(TelemetryEventName.ACCOUNT_CONNECT_CLICKED)
		const cloudUrl = `${apiConfiguration?.zgsmBaseUrl?.trim() || "https://zgsm.sangfor.com"}/credit/manager?state=${hash}`

		vscode.postMessage({ type: "openExternal", url: cloudUrl })
	}

	const onMessage = useCallback(
		(event: MessageEvent) => {
			const message: ExtensionMessage = event.data

			switch (message.type) {
				case "zgsmLogined": {
					onDone()
					break
				}
			}
		},
		[onDone],
	)

	useEvent("message", onMessage)

	return (
		<div className="flex flex-col h-full p-4 bg-vscode-editor-background">
			<div className="flex justify-between items-center mb-6">
				<h1 className="text-xl font-medium text-vscode-foreground">{t("account:title")}</h1>
				<VSCodeButton appearance="primary" onClick={onDone}>
					{t("settings:common.done")}
				</VSCodeButton>
			</div>
			{apiConfiguration?.zgsmAccessToken ? (
				<>
					{userInfo && (
						<div className="flex flex-col items-center mb-6">
							<div className="w-16 h-16 mb-3 rounded-full overflow-hidden">
								{logoPic ? (
									<img
										src={logoPic}
										alt={t("account:profilePicture")}
										className="w-full h-full object-cover"
									/>
								) : (
									<div className="w-full h-full flex items-center justify-center bg-vscode-button-background text-vscode-button-foreground text-xl">
										{userInfo?.name?.charAt(0) || userInfo?.email?.charAt(0) || "?"}
									</div>
								)}
							</div>
							{userInfo.name && (
								<h2 className="text-lg font-medium text-vscode-foreground mb-0">{userInfo.name}</h2>
							)}
							{userInfo?.email && (
								<p className="text-sm text-vscode-descriptionForeground">{userInfo?.email}</p>
							)}
							{userInfo?.organizationName && (
								<div className="flex items-center gap-2 text-sm text-vscode-descriptionForeground">
									{userInfo.organizationImageUrl && (
										<img
											src={userInfo.organizationImageUrl}
											alt={userInfo.organizationName}
											className="w-4 h-4 rounded object-cover"
										/>
									)}
									<span>{userInfo.organizationName}</span>
								</div>
							)}
						</div>
					)}
					<div className="flex flex-col gap-2 mt-4">
						<VSCodeButton appearance="secondary" onClick={handleVisitCloudWebsite} className="w-full">
							{t("account:visitCloudWebsite")}
						</VSCodeButton>
						<VSCodeButton appearance="secondary" onClick={handleLogoutClick} className="w-full">
							{t("account:logOut")}
						</VSCodeButton>
					</div>
				</>
			) : (
				<>
					<div className="flex flex-col items-center mb-1 text-center">
						<div className="w-16 h-16 mb-1 flex items-center justify-center">
							<div
								className="w-12 h-12 bg-vscode-foreground"
								style={{
									WebkitMaskImage: `url('${rooLogoUri}')`,
									WebkitMaskRepeat: "no-repeat",
									WebkitMaskSize: "contain",
									maskImage: `url('${rooLogoUri}')`,
									maskRepeat: "no-repeat",
									maskSize: "contain",
								}}>
								<img src={rooLogoUri} alt="Costrict logo" className="w-12 h-12 opacity-0" />
							</div>
						</div>
					</div>

					<div className="flex flex-col mb-6 text-center">
						<h2 className="text-lg font-medium text-vscode-foreground mb-2">
							{t("account:cloudBenefitsTitle")}
						</h2>
						<p className="text-md text-vscode-descriptionForeground mb-4">
							{t("account:cloudBenefitsSubtitle")}
						</p>
						<ul className="text-sm text-vscode-descriptionForeground space-y-2 max-w-xs mx-auto">
							<li className="flex items-start">
								<span className="mr-2 text-vscode-foreground">•</span>
								{t("account:cloudBenefitHistory")}
							</li>
							<li className="flex items-start">
								<span className="mr-2 text-vscode-foreground">•</span>
								{t("account:cloudBenefitSharing")}
							</li>
							<li className="flex items-start">
								<span className="mr-2 text-vscode-foreground">•</span>
								{t("account:cloudBenefitMetrics")}
							</li>
						</ul>
					</div>

					<div className="flex flex-col gap-4">
						<VSCodeButton appearance="primary" onClick={handleConnectClick} className="w-full">
							{t("account:connect")}
						</VSCodeButton>
					</div>
				</>
			)}
		</div>
	)
}

function parseJwt(token: string) {
	const parts = token.split(".")
	if (parts.length !== 3) {
		throw new Error("Invalid JWT")
	}
	const payload = parts[1]
	const decoded = atob(payload.replace(/-/g, "+").replace(/_/g, "/")) // base64url → base64 → decode
	return JSON.parse(decoded)
}

async function hashToken(token: string) {
	const encoder = new TextEncoder()
	const data = encoder.encode(token)
	const hashBuffer = await crypto.subtle.digest("SHA-256", data)
	return Array.from(new Uint8Array(hashBuffer))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("")
}

export async function imageUrlToBase64(url: string): Promise<string | null> {
	try {
		const response = await axios.get(url, {
			responseType: "blob", // 关键！确保 axios 返回的是 Blob
		})

		const blob = response.data as Blob

		return await new Promise<string>((resolve, reject) => {
			const reader = new FileReader()
			reader.onloadend = () => resolve(reader.result as string)
			reader.onerror = () => reject("Failed to convert blob to base64")
			reader.readAsDataURL(blob) // 自动加上 data:image/png;base64,...
		})
	} catch (error) {
		console.error("Failed to convert image to base64", error)
		return null
	}
}
