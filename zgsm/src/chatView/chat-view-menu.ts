/**
 * Copyright (c) 2024 - Sangfor LTD.
 *
 * All rights reserved. Code licensed under the MIT license
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 */
import * as vscode from "vscode"

import { CODELENS_FUNC } from "../common/constant"
import { registerCodeActionPair } from "../../../src/activate/registerCodeActions"
import { COMMAND_IDS } from "../../../src/core/CodeActionProvider"

/**
 * Menu items for the chat view
 */
export interface ChatMenuItem {
	command: string
	key: string
	actionName: string
	category: string
}

/**
 * Right-click menu items for the chat view
 */
export const rightMenus: ChatMenuItem[] = [
	{
		command: "vscode-zgsm.explain",
		key: CODELENS_FUNC.explain.key,
		actionName: CODELENS_FUNC.explain.actionName,
		category: "zhuge-shenma",
	},
	{
		command: "vscode-zgsm.addComment",
		key: CODELENS_FUNC.addComment.key,
		actionName: CODELENS_FUNC.addComment.actionName,
		category: "zhuge-shenma",
	},
	{
		command: "vscode-zgsm.codeReview",
		key: CODELENS_FUNC.codeReview.key,
		actionName: CODELENS_FUNC.codeReview.actionName,
		category: "zhuge-shenma",
	},
	{
		command: "vscode-zgsm.addDebugCode",
		key: CODELENS_FUNC.addDebugCode.key,
		actionName: CODELENS_FUNC.addDebugCode.actionName,
		category: "zhuge-shenma",
	},
	{
		command: "vscode-zgsm.addStrongerCode",
		key: CODELENS_FUNC.addStrongerCode.key,
		actionName: CODELENS_FUNC.addStrongerCode.actionName,
		category: "zhuge-shenma",
	},
	{
		command: "vscode-zgsm.simplifyCode",
		key: CODELENS_FUNC.simplifyCode.key,
		actionName: CODELENS_FUNC.simplifyCode.actionName,
		category: "zhuge-shenma",
	},
	{
		command: "vscode-zgsm.performanceOptimization",
		key: CODELENS_FUNC.performanceOptimization.key,
		actionName: CODELENS_FUNC.performanceOptimization.actionName,
		category: "zhuge-shenma",
	},
]

export const registerZGSMCodeActions = (context: vscode.ExtensionContext) => {
	registerCodeActionPair(
		context,
		COMMAND_IDS.ZGSM_EXPLAIN,
		"ZGSM_EXPLAIN",
		"What would you like Shenma to explain?",
		"E.g. How does the error handling work?",
	)

	registerCodeActionPair(
		context,
		COMMAND_IDS.ZGSM_ADD_COMMENT,
		"ZGSM_ADD_COMMENT",
		"What would you like Shenma to do?",
		"E.g. Add comments to the code",
	)

	registerCodeActionPair(
		context,
		COMMAND_IDS.ZGSM_CODE_REVIEW,
		"ZGSM_CODE_REVIEW",
		"What would you like Shenma to do?",
		"E.g. Check for code quality issues and provide suggestions to the code",
	)

	registerCodeActionPair(
		context,
		COMMAND_IDS.ZGSM_ADD_DEBUG_CODE,
		"ZGSM_ADD_DEBUG_CODE",
		"What would you like Shenma to do?",
		"E.g. Enhance troubleshooting capabilities by adding logs and debug code to key logic steps to the code",
	)

	registerCodeActionPair(
		context,
		COMMAND_IDS.ZGSM_ADD_STRONG_CODE,
		"ZGSM_ADD_STRONG_CODE",
		"What would you like Shenma to do?",
		"E.g. Enhance robustness by adding exception handling and parameter validation to the code",
	)

	registerCodeActionPair(
		context,
		COMMAND_IDS.ZGSM_SIMPLIFY_CODE,
		"ZGSM_SIMPLIFY_CODE",
		"What would you like Shenma to do?",
		"E.g. Remove ineffective part of the code",
	)

	registerCodeActionPair(
		context,
		COMMAND_IDS.ZGSM_PERFORMANCE,
		"ZGSM_PERFORMANCE",
		"What would you like Shenma to do?",
		"E.g. Improve code performance, provide modification suggestions, focus on efficiency issues to the following code",
	)
}
