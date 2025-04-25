import { useCallback } from "react"
import { getZgsmAuthUrl } from "../oauth/urls"
import { vscode } from "../utils/vscode"
import { ApiConfiguration } from "../../../src/shared/api"

export function useZgsmOAuth() {
	const generateZgsmAuthUrl = useCallback((apiConfiguration: ApiConfiguration, uriScheme?: string) => {
		const stateId = Math.random().toString(36).substring(2) + Date.now().toString(36)
		return getZgsmAuthUrl(stateId, apiConfiguration, uriScheme)
	}, [])

	const initiateZgsmLogin = useCallback(
		(apiConfiguration: ApiConfiguration, uriScheme?: string) => {
			const authUrl = generateZgsmAuthUrl(apiConfiguration, uriScheme)
			vscode.postMessage({
				type: "zgsmLogin",
				authUrl,
				apiConfiguration,
			})
		},
		[generateZgsmAuthUrl],
	)

	return {
		generateZgsmAuthUrl,
		initiateZgsmLogin,
	}
}
