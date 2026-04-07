import * as vscode from "vscode"
import { Package } from "../shared/package"
export let defaultDebug = false

export const updateDefaultDebug = (debug: boolean) => {
	defaultDebug = debug
}

export const isDebug = () => {
	const debug = vscode.workspace.getConfiguration(Package.commandIDPrefix).get<boolean>("debug", defaultDebug)
	return debug
}
