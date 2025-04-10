/**
 * Copyright (c) 2024 - Sangfor LTD.
 *
 * All rights reserved. Code licensed under the MIT license
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 */
import { CODELENS_FUNC } from "../common/constant";

/**
 * Menu items for the chat view
 */
export interface ChatMenuItem {
    command: string;
    key: string;
    actionName: string;
    category: string;
}

/**
 * Right-click menu items for the chat view
 */
export const rightMenus: ChatMenuItem[] = [
    {
        'command': 'vscode-zgsm.explain',
        'key': CODELENS_FUNC.explain.key,
        'actionName': CODELENS_FUNC.explain.actionName,
        'category': 'zhuge-shenma',
    },
    {
        'command': 'vscode-zgsm.addComment',
        'key': CODELENS_FUNC.addComment.key,
        'actionName': CODELENS_FUNC.addComment.actionName,
        'category': 'zhuge-shenma'
    },
    {
        'command': 'vscode-zgsm.codeReview',
        'key': CODELENS_FUNC.codeReview.key,
        'actionName': CODELENS_FUNC.codeReview.actionName,
        'category': 'zhuge-shenma'
    },
    {
        'command': 'vscode-zgsm.addDebugCode',
        'key': CODELENS_FUNC.addDebugCode.key,
        'actionName': CODELENS_FUNC.addDebugCode.actionName,
        'category': 'zhuge-shenma'
    },
    {
        'command': 'vscode-zgsm.addStrongerCode',
        'key': CODELENS_FUNC.addStrongerCode.key,
        'actionName': CODELENS_FUNC.addStrongerCode.actionName,
        'category': 'zhuge-shenma'
    },
    {
        'command': 'vscode-zgsm.simplifyCode',
        'key': CODELENS_FUNC.simplifyCode.key,
        'actionName': CODELENS_FUNC.simplifyCode.actionName,
        'category': 'zhuge-shenma'
    },
    {
        'command': 'vscode-zgsm.performanceOptimization',
        'key': CODELENS_FUNC.performanceOptimization.key,
        'actionName': CODELENS_FUNC.performanceOptimization.actionName,
        'category': 'zhuge-shenma'
    },
];