/**
 * Copyright (c) 2024 - Sangfor LTD.
 *
 * All rights reserved. Code licensed under the MIT license
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 */
import * as vscode from 'vscode';
import { getLanguageClass } from "../langClass/factory";
import { ChatViewProvider } from "../chatView/chat-view-provider";
import { CODELENS_CONST, CODELENS_FUNC } from "../common/constant";
import { throttle } from "../common/util";
import { getLanguageByFilePath } from '../common/lang-util';

/**
 * Throttled function for commonCodeLensFunc
 */
const throttleCommonCodeLensFunc = throttle(commonCodeLensFunc, 2000);

/**
 * Action for handling common codelens commands
 * @param editor The document editor where the codelens is located
 * @param args: [documentSymbol, codelensItem]
 */
async function commonCodeLensFunc(editor: any, ...args: any) {
    // Show the webview page first, as there may be time-consuming operations later
    vscode.commands.executeCommand('vscode-zgsm.view.focus');
    const documentSymbol = args[1];
    const codelensItem = args[2];
    const language = getLanguageByFilePath(editor.document.uri.fsPath);
    const langClass = getLanguageClass(language);

    codelensItem.range = {
        startLine: documentSymbol.range.start.line,
        endLine: documentSymbol.range.end.line,
    };
    codelensItem.filePath = editor.document.uri.fsPath;
    codelensItem.callType = CODELENS_CONST.funcHead;
    codelensItem.language = language;
    const params = langClass.codelensGetExtraArgs(editor.document, codelensItem.range, codelensItem);
    // Send a message to let LLM complete the response action
    ChatViewProvider.getInstance().codeLensButtonSend(params);
}

/**
 * Action for handling the 'More' button in codelens
 */
async function moreCodeLensFunc(editor: any, ...args: any) {
    const codeLens = args[2];
    const options: any[] = [];

    for (const [key, codelensItem] of Object.entries(CODELENS_FUNC)) {
        if (key === codeLens.key) {
            continue;
        }
        options.push({ label: codelensItem.actionName, data: codelensItem });
    }
    const selection = await vscode.window.showQuickPick(options, {
        placeHolder: 'Select a quick command'
    });

    // Handle user selection
    if (selection) {
        args[2] = selection.data;
        throttleCommonCodeLensFunc(editor, ...args);
    }
}

/**
 * Callback function for common codelens
 */
export const codeLensCallBackCommand = {
    command: "vscode-zgsm.codelens_button",
    callback: (event: any) => throttleCommonCodeLensFunc
};

/**
 * Callback function for the 'More' button in codelens
 */
export const codeLensCallBackMoreCommand = {
    command: "vscode-zgsm.codelens_more_button",
    callback: (event: any) => moreCodeLensFunc
};