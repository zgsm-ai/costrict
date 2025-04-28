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

export class CppLangClass extends BaseLangClass {
	constructor() {
		super(LangName.CPP)
		this.showableKinds = [vscode.SymbolKind.Function, vscode.SymbolKind.Method]
	}
}
