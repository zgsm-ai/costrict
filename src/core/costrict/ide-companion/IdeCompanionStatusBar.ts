/**
 * IDE Companion 状态栏
 * 显示服务器状态和连接数
 */

import * as vscode from "vscode"
// import { IDEServer } from "./IdeCompanionServer"
// import { getCommand } from "../../../utils/commands"
import type { IDEServer } from "./ide-server"

export class IdeCompanionStatusBar {
	private statusBarItem: vscode.StatusBarItem

	constructor(
		private readonly server: IDEServer,
		context: vscode.ExtensionContext,
	) {
		// 创建状态栏项
		this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100)
		// this.statusBarItem.command = getCommand("ideCompanion.showMenu")
		context.subscriptions.push(this.statusBarItem)

		// 初始更新
		this.updateStatusBar()

		// 监听状态变化
		server.onStatusChange(() => {
			this.updateStatusBar()
		})

		// 显示状态栏
		this.statusBarItem.show()
	}

	/**
	 * 更新状态栏
	 */
	private updateStatusBar(): void {
		const status = this.server.getStatus()

		if (status.running) {
			this.statusBarItem.text = `$(check) IDE Companion (${status.connections})`
			this.statusBarItem.tooltip = `CoStrict IDE Companion\nPort: ${status.port}\nConnection count: ${status.connections}`
			this.statusBarItem.backgroundColor = undefined
		} else {
			this.statusBarItem.text = `$(circle-slash) IDE Companion`
			this.statusBarItem.tooltip = "CoStrict IDE Companion (Stopped)\n\nClick to start"
			this.statusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground")
		}
	}

	// /**
	//  * 显示快速操作菜单
	//  */
	// public async showMenu(): Promise<void> {
	// 	const status = this.server.getStatus()

	// 	const items: vscode.QuickPickItem[] = []

	// 	if (status.running) {
	// 		items.push(
	// 			{
	// 				label: "$(info) Show Status",
	// 				description: `Port: ${status.port}, Connections: ${status.connections}`,
	// 			},
	// 			{
	// 				label: "$(debug-restart) Restart Server",
	// 				description: "Restart the IDE Companion server",
	// 			},
	// 			{
	// 				label: "$(stop-circle) Stop Server",
	// 				description: "Stop the IDE Companion server",
	// 			},
	// 		)
	// 	} else {
	// 		items.push({
	// 			label: "$(play) Start Server",
	// 			description: "Start the IDE Companion server",
	// 		})
	// 	}

	// 	items.push({
	// 		label: "$(gear) Open Settings",
	// 		description: "Configure IDE Companion",
	// 	})

	// 	const selected = await vscode.window.showQuickPick(items, {
	// 		placeHolder: "IDE Companion Actions",
	// 	})

	// 	if (!selected) {
	// 		return
	// 	}

	// 	// 执行对应的命令
	// 	if (selected.label.includes("Start")) {
	// 		await vscode.commands.executeCommand("costrict.ideCompanion.start")
	// 	} else if (selected.label.includes("Stop")) {
	// 		await vscode.commands.executeCommand("costrict.ideCompanion.stop")
	// 	} else if (selected.label.includes("Restart")) {
	// 		await vscode.commands.executeCommand("costrict.ideCompanion.restart")
	// 	} else if (selected.label.includes("Status")) {
	// 		await vscode.commands.executeCommand("costrict.ideCompanion.showStatus")
	// 	} else if (selected.label.includes("Settings")) {
	// 		await vscode.commands.executeCommand("workbench.action.openSettings", "costrict.ideCompanion")
	// 	}
	// }

	/**
	 * 清理资源
	 */
	public dispose(): void {
		this.statusBarItem.dispose()
	}
}
