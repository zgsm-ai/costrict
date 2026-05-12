import * as vscode from "vscode"
import { isJetbrainsPlatform } from "../../../utils/platform"

const isJetbrains = isJetbrainsPlatform()

export const renderModes = {
	noLimit: {
		limit: 1,
		interval: 5,
	},
	fast: {
		limit: 2,
		interval: isJetbrains ? 25 : 10,
	},
	medium: {
		limit: 3,
		interval: isJetbrains ? 50 : 20,
	},
	slow: {
		limit: 4,
		interval: isJetbrains ? 100 : 40,
	},
}

export function getApiResponseRenderMode() {
	if (isJetbrains) {
		return renderModes.fast
	}
	const apiResponseRenderMode = vscode.workspace
		.getConfiguration("costrict")
		.get<string>("apiResponseRenderMode", "noLimit") as "fast" | "medium" | "slow" | "noLimit"

	return renderModes[apiResponseRenderMode] || renderModes["noLimit"]
}
