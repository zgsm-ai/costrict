/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Copyright (c) 2024 - Sangfor LTD.
 *
 * All rights reserved. Code licensed under the MIT license
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 */
import * as vscode from "vscode"
import { CodelensItem } from "../common/constant"

/**
 * Language class interface, which processes codelens differently based on the programming language
 */
export interface LangClass {
	// Check if the quick function menu needs to be displayed
	checkCodelensEnabled(): boolean
	// Retrieve the list of symbols that can display codelens based on the programming language (coarse filtering)
	getShowableSymbols(docSymbols: vscode.DocumentSymbol[]): vscode.DocumentSymbol[]
	// Check whether a symbol is allowed to display codelens
	isShowableSymbol(docSymbol: vscode.DocumentSymbol): boolean
	// Inspect if a symbol can display a specific codelens menu item (fine filtering)
	checkItemShowable(item: CodelensItem, documentSymbol: vscode.DocumentSymbol): boolean
	// Retrieve extra arguments for codelens menu items
	codelensGetExtraArgs(document: vscode.TextDocument, range: any, codelensArgs: any): any
}
