import * as vscode from "vscode"

import { Package } from "../shared/package"
import { CostrictCloudWebviewProvider } from "./CostrictCloudWebviewProvider"
import { COSTRICT_CLOUD_CONFIG_SECTION, COSTRICT_CLOUD_MODE_KEY, type CostrictCloudMode } from "./config"

export function getCostrictCloudMode(): CostrictCloudMode {
	const mode = vscode.workspace
		.getConfiguration(COSTRICT_CLOUD_CONFIG_SECTION)
		.get<CostrictCloudMode>(COSTRICT_CLOUD_MODE_KEY, "normal")
	return mode === "cloud" ? "cloud" : "normal"
}

export async function activateCostrictCloudMode(
	context: vscode.ExtensionContext,
	outputChannel: vscode.OutputChannel,
): Promise<void> {
	outputChannel.appendLine("[costrict-cloud] activating isolated cloud mode")

	const provider = new CostrictCloudWebviewProvider(context, outputChannel)

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(CostrictCloudWebviewProvider.sideBarId, provider, {
			webviewOptions: { retainContextWhenHidden: true },
		}),
	)

	await vscode.commands.executeCommand(`${Package.commandIDPrefix}.activationCompleted`)
}

export function registerCostrictCloudModeCommands(
	context: vscode.ExtensionContext,
	outputChannel: vscode.OutputChannel,
): void {
	context.subscriptions.push(
		vscode.commands.registerCommand(`${Package.commandIDPrefix}.switchToCloudMode`, async () => {
			await setCostrictMode("cloud", outputChannel)
		}),
		vscode.commands.registerCommand(`${Package.commandIDPrefix}.switchToNormalMode`, async () => {
			await setCostrictMode("normal", outputChannel)
		}),
	)
}

export async function setCostrictMode(mode: CostrictCloudMode, outputChannel: vscode.OutputChannel): Promise<void> {
	await vscode.workspace
		.getConfiguration(COSTRICT_CLOUD_CONFIG_SECTION)
		.update(COSTRICT_CLOUD_MODE_KEY, mode, vscode.ConfigurationTarget.Global)

	outputChannel.appendLine(`[costrict-cloud] switched costrict.mode to ${mode}`)

	const selection = await vscode.window.showInformationMessage(
		`已切换到 ${mode === "cloud" ? "Cloud" : "Normal"} 模式，需要重启 VS Code 后生效。`,
		"重启 VS Code",
		"稍后",
	)

	if (selection === "重启 VS Code") {
		await vscode.commands.executeCommand("workbench.action.reloadWindow")
	}
}
