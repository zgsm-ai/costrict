import * as path from "path"
import Mocha from "mocha"
import { glob } from "glob"
import * as vscode from "vscode"

import { type RooCodeAPI, Package, RooCodeSettings } from "@roo-code/types"

import { waitFor } from "./utils"

declare global {
	var api: RooCodeAPI
}

export async function run() {
	const extension = vscode.extensions.getExtension<RooCodeAPI>(`${Package.publisher}.${Package.name}`)

	if (!extension) {
		throw new Error("Extension not found")
	}

	const api = extension.isActive ? extension.exports : await extension.activate()
	await api.setConfiguration({
		apiProvider: "zgsm" as const,
		zgsmBaseUrl: "https://zgsm.sangfor.com",
		zgsmApiKey: process.env.OPENROUTER_API_KEY!, // Replaced with "zgsm" but key is still used
		zgsmModelId: "deepseek-v3",
		zgsmDefaultBaseUrl: "https://zgsm.sangfor.com",
		zgsmDefaultModelId: "deepseek-v3",
		zgsmSite: "https://costrict.ai",
		zgsmLoginUrl: "/realms/gw/protocol/openid-connect/auth",
		zgsmLogoutUrl: "/realms/gw/protocol/openid-connect/logout",
		zgsmTokenUrl: "/realms/gw/protocol/openid-connect/token",
		zgsmCompletionUrl: "/code-completion/api/v1",
		zgsmDownloadUrl: "/downloads",
		zgsmRedirectUri: "/login/ok",
		zgsmClientId: "vscode",
		isZgsmApiKeyValid: true,
	} as unknown as RooCodeSettings)

	await vscode.commands.executeCommand(`${Package.name}.SidebarProvider.focus`)
	await waitFor(() => api.isReady())

	// Expose the API to the tests.
	globalThis.api = api

	// Add all the tests to the runner.
	const mocha = new Mocha({ ui: "tdd", timeout: 300_000 })
	const cwd = path.resolve(__dirname, "..")
	;(await glob("**/**.test.js", { cwd })).forEach((testFile) => mocha.addFile(path.resolve(cwd, testFile)))

	// Let's go!
	return new Promise<void>((resolve, reject) =>
		mocha.run((failures) => (failures === 0 ? resolve() : reject(new Error(`${failures} tests failed.`)))),
	)
}
