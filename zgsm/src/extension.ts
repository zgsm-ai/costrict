/**
 * Copyright (c) 2024 - Sangfor LTD.
 *
 * All rights reserved. Code licensed under the MIT license
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 */
import * as vscode from "vscode";
import Auth0AuthenticationProvider from './common/authProvider';
import { rightMenus } from "./chatView/chat-view-menu";
import { ChatViewProvider } from "./chatView/chat-view-provider";
import { shortKeyCut } from "./codeCompletion/completionCommands";
import { CompletionStatusBar } from "./codeCompletion/completionStatusBar";
import { AICompletionProvider } from './codeCompletion/completionProvider';
import { codeLensCallBackCommand, codeLensCallBackMoreCommand } from "./codeLens/codeLensCallBackFunc";
import { MyCodeLensProvider } from "./codeLens/codeLensProvider";
import { CODELENS_CONST, CODELENS_FUNC, configCompletion, configCodeLens, configShenmaName } from "./common/constant";
import { initEnv, updateEnv } from "./common/env";
import { Logger } from "./common/log-util";
import { setupExtensionUpdater, doExtensionOnce, updateCodelensConfig, updateCompletionConfig, initLangSetting } from "./common/services";
import { getFullLineCode, printLogo } from "./common/vscode-util";
import { getLanguageByFilePath, loadLocalLanguageExtensions } from "./common/lang-util";
import { getLanguageClass } from "./langClass/factory";

/**
 * Initialization entry
 */
async function initialize() {
    printLogo();
    initEnv();
    initLangSetting();

    loadLocalLanguageExtensions();
}

/**
 * Register the command for each menu item
 */
function registerMenuCommands(context: vscode.ExtensionContext, cvProvider: ChatViewProvider) {
    for (const rightMenu of rightMenus) {
        const myCommand = vscode.commands.registerCommand(rightMenu.command, async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                return;
            }
            const selectedCode = editor.document.getText(editor.selection);
            if (!selectedCode) {
                return;
            }
            Logger.log('You clicked', rightMenu);
            vscode.commands.executeCommand('vscode-zgsm.view.focus');

            let params: any = CODELENS_FUNC[rightMenu.key];
            const filePath = editor.document.uri.fsPath;
            const language = getLanguageByFilePath(filePath);
            const langClass = getLanguageClass(language);
            const startLine = editor.selection.start.line;
            const endLine = editor.selection.end.line;
            params.category = rightMenu.category;
            params.filePath = filePath;
            params.language = language;
            params.code = getFullLineCode(editor, startLine, endLine);
            params.callType = CODELENS_CONST.rightMenu;
            params.range = {
                startLine: startLine,
                endLine: endLine,
            };
            params = langClass.codelensGetExtraArgs(editor.document, params.range, params);
            setTimeout(() => {
                cvProvider?.codeLensButtonSend(params);
            }, cvProvider?.webView ? 0 : 1000);
        });
        context.subscriptions.push(myCommand);
    }
}

/**
 * Entry function when the extension is activated
 */
export async function activate(context: vscode.ExtensionContext) {
    initialize();

    const authProvider = Auth0AuthenticationProvider.getInstance(context);
    authProvider.checkToken();

    setupExtensionUpdater(context);
    doExtensionOnce(context);
    CompletionStatusBar.create(context);
    const cvProvider = ChatViewProvider.getInstance(context);

    // Register webview
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(
        "vscode-zgsm.view",
        cvProvider,
        {
            webviewOptions: {
                retainContextWhenHidden: true,
            },
        }
    ));

    context.subscriptions.push(
        // Register codelens related commands
        vscode.commands.registerTextEditorCommand(
            codeLensCallBackCommand.command,
            codeLensCallBackCommand.callback(context)
        ),
        // Shenma instruction set
        vscode.commands.registerTextEditorCommand(
            codeLensCallBackMoreCommand.command,
            codeLensCallBackMoreCommand.callback(context)
        ),
        // Register function header menu
        vscode.languages.registerCodeLensProvider('*', new MyCodeLensProvider())
    );

    // Listen for configuration changes
    const configChanged = vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration(configShenmaName)) { // Zhuge Shenma settings changed, mainly URL settings for various services
            updateEnv();
            cvProvider.updateConfig();
        }
        if (e.affectsConfiguration(configCompletion)) { // Code completion settings changed
            updateCompletionConfig();
        }
        if (e.affectsConfiguration(configCodeLens)) {   // Function Quick Commands settings changed
            updateCodelensConfig();
        }
        CompletionStatusBar.initByConfig();
    });
    context.subscriptions.push(configChanged);

    context.subscriptions.push(
        // Code completion service
        vscode.languages.registerInlineCompletionItemProvider(
            { pattern: "**" }, new AICompletionProvider(context)
        ),
        // Shortcut command to trigger auto-completion manually
        vscode.commands.registerCommand(shortKeyCut.command, () => { shortKeyCut.callback(context); }),
    );
    // Register the command for the right-click menu
    registerMenuCommands(context, cvProvider);
    // Register the 'Start Chat' command
    context.subscriptions.push(vscode.commands.registerCommand('vscode-zgsm.chat', () => {
        vscode.commands.executeCommand('vscode-zgsm.view.focus');
    }));
    // Register the 'Logout' command
    context.subscriptions.push(vscode.commands.registerCommand('vscode-zgsm.view.logout', () => {
        cvProvider.logout();
    }));
    // Register the command for clearing sessions
    context.subscriptions.push(vscode.commands.registerCommand("vscode-zgsm.clearSession", () => {
        context.globalState.update("chatgpt-session-token", null);
    }));
    // Register the 'User Manual' command
    context.subscriptions.push(vscode.commands.registerCommand('vscode-zgsm.view.userHelperDoc', () => {
        cvProvider.userHelperDocPanel();
    }));
    // Register the 'Report Issue' command
    context.subscriptions.push(vscode.commands.registerCommand('vscode-zgsm.view.issue', () => {
        cvProvider.userFeedbackIssue();
    }));
    CompletionStatusBar.initByConfig();
}

// eslint-disable-next-line @typescript-eslint/no-empty-function
export function deactivate() { }