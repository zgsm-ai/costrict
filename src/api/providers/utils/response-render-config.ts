import * as vscode from "vscode"

export const renderModes = {
	fast: {
		limit: 2,
		interval: 50,
	},
	medium: {
		limit: 5,
		interval: 100,
	},
	slow: {
		limit: 10,
		interval: 150,
	},
}

export function getApiResponseRenderMode() {
	const apiResponseRenderMode = vscode.workspace
		.getConfiguration("zgsm")
		.get<string>("apiResponseRenderMode", "medium") as "fast" | "medium" | "slow"

	return renderModes[apiResponseRenderMode] || renderModes["medium"]
}
