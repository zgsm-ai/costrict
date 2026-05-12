import * as vscode from "vscode"
import { Package } from "./package"

export type UiMode = "classic" | "cloud"

export const UI_MODE_OPTIONS: readonly { label: string; description: string; value: UiMode }[] = [
	{ label: "Classic Mode", description: "Use the current CoStrict UI and logic", value: "classic" },
	{ label: "Cloud Mode", description: "Use the Cloud UI on next launch", value: "cloud" },
]

export const getConfiguredUiMode = (): UiMode => {
	const configured = vscode.workspace.getConfiguration(Package.commandIDPrefix).get<UiMode>("uiMode")
	return configured === "cloud" ? "cloud" : "classic"
}

export const promptToReloadForUiModeChange = async () => {
	const reloadNow = await vscode.window.showInformationMessage(
		"UI mode updated. Reload Window to apply.",
		"Reload Now",
		"Later",
	)
	if (reloadNow === "Reload Now") {
		await vscode.commands.executeCommand("workbench.action.reloadWindow")
	}
}
