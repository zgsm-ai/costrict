/**
 * Copyright (c) 2024 - Sangfor LTD.
 *
 * All rights reserved. Code licensed under the MIT license
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 */
import * as vscode from 'vscode';
import { LangName, BaseLangClass } from "./base";

export class PythonLangClass extends BaseLangClass {
    constructor() {
        super(LangName.PYTHON);
        this.showableKinds = [vscode.SymbolKind.Function, vscode.SymbolKind.Method];
    }
    public isShowableSymbol(documentSymbol: vscode.DocumentSymbol): boolean {
        if (!super.isShowableSymbol(documentSymbol))
            return false;
        const editor = vscode.window.activeTextEditor;
        const code = editor?.document.getText(documentSymbol.range);
        if (code?.includes("def ")) {
            return true;
        }
        return false;
    }
}
