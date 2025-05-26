/**
 * Copyright (c) 2024 - Sangfor LTD.
 *
 * All rights reserved. Code licensed under the MIT license
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 */
import * as vscode from "vscode"
import { LangName, BaseLangClass } from "./base"

export class JavascriptClass extends BaseLangClass {
	constructor() {
		super(LangName.JS)
		this.showableKinds = [
			vscode.SymbolKind.Function,
			vscode.SymbolKind.Function,
			vscode.SymbolKind.Method,
			vscode.SymbolKind.Variable,
		]
	}

	override isShowableSymbol(documentSymbol: vscode.DocumentSymbol): boolean {
		if (!super.isShowableSymbol(documentSymbol)) {
			return false
		}
		if (documentSymbol.kind !== vscode.SymbolKind.Variable) return true

		const editor = vscode.window.activeTextEditor
		const code = editor?.document.getText(documentSymbol.range)

		if (!code) {
			return false
		}

		return code.replace(/\s/g, "").includes("=>{")
	}
}
