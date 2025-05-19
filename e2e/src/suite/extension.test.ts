import * as assert from "assert"
import * as vscode from "vscode"

suite("zgsm Extension", () => {
	test("Commands should be registered", async () => {
		const expectedCommands = [
			"vscode-zgsm.plusButtonClicked",
			"vscode-zgsm.mcpButtonClicked",
			"vscode-zgsm.historyButtonClicked",
			"vscode-zgsm.popoutButtonClicked",
			"vscode-zgsm.settingsButtonClicked",
			"vscode-zgsm.openInNewTab",
			"vscode-zgsm.explainCode",
			"vscode-zgsm.fixCode",
			"vscode-zgsm.improveCode",
		]

		const commands = await vscode.commands.getCommands(true)

		for (const cmd of expectedCommands) {
			assert.ok(commands.includes(cmd), `Command ${cmd} should be registered`)
		}
	})
})
