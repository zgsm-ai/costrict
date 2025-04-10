/**
 * Copyright (c) 2024 - Sangfor LTD.
 *
 * All rights reserved. Code licensed under the MIT license
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 */
import * as vscode from 'vscode';
import { LangClass } from './LangClass';
import { envSetting } from '../common/env';
import { CodelensItem } from '../common/constant';

/**
 * Programming language name
 */
export class LangName {
    public static OTHER = 'other';
    public static CPP = 'c++';
    public static C = 'c';
    public static GO = 'go';
    public static PYTHON = 'python';
}

/**
 * Base class for programming languages
 */
export class BaseLangClass implements LangClass {
    public name = LangName.OTHER;
    public showableKinds = [vscode.SymbolKind.Class, vscode.SymbolKind.Function];

    constructor(langName: string) {
        this.name = langName;
    }
    // Check if the function quick menu should be displayed
    public checkCodelensEnabled(): boolean {
        return true;
    }
    // Check if a symbol should be displayed in the codelens
    public isShowableSymbol(docSymbol: vscode.DocumentSymbol): boolean {
        return this.showableKinds.includes(docSymbol.kind);
    }
    // Check if a symbol should display a specific codelens menu item
    public checkItemShowable(item: CodelensItem, docSymbol: vscode.DocumentSymbol): boolean {
        return true;
    }
    // Base method to get showable symbols for codelens
    public getShowableSymbols(docSymbols: vscode.DocumentSymbol[]): vscode.DocumentSymbol[] {
        const showableSymbols: vscode.DocumentSymbol[] = [];
        for (const docSymbol of docSymbols) {
            if (docSymbol.kind !== vscode.SymbolKind.Module && docSymbol.kind !== vscode.SymbolKind.Class)
                continue;
            if (!docSymbol.children)
                continue;
            docSymbol.children.forEach((docSymbol: any) =>
                (this.isShowableSymbol(docSymbol) ? showableSymbols.push(docSymbol) : null));
        }
        docSymbols.forEach((docSymbol: any) =>
            (this.isShowableSymbol(docSymbol) ? showableSymbols.push(docSymbol) : null));
        return showableSymbols;
    }
    /**
     * Get additional parameters for the codelens menu item message
     */
    public codelensGetExtraArgs(document: vscode.TextDocument, range: any, codelensArgs: any) {
        const rangeFull = new vscode.Range(
            range.startLine, 0,
            range.endLine, Number.MAX_VALUE
        );
        // Extract text from the document based on the range
        codelensArgs.code = document.getText(rangeFull);
        return codelensArgs;
    }
}