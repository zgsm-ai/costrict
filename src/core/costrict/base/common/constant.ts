/**
 * Copyright (c) 2024 - Sangfor LTD.
 *
 * All rights reserved. Code licensed under the MIT license
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 */

import { t } from "../../../../i18n"
import { registerRefreshFunction } from "../../../../i18n/costrict-i18n"
import { getCommand } from "../../../../utils/commands"

// VSCode related
export const VSCODE_CONST = {
	checkSpin: "$(check~spin)", // Checkmark icon
	xSpin: "$(x~spin)", // X icon
	loadingSpin: "$(loading~spin)", // Loading spinner icon
}

// Webview theme related
export const WEBVIEW_THEME_CONST = {
	1: "vs",
	2: "vs-dark",
	3: "vs-dark",
	4: "vs",
}

export const SELECTION_BG_COLOR = {
	0: "rgba(38, 79, 120, 1)", // Default
	1: "rgba(173, 214, 255, 1)",
	2: "rgba(38, 79, 120, 1)",
	3: "rgba(38, 79, 120, 1)",
	4: "rgba(173, 214, 255, 1)",
}

// Constants related to codelens buttons
export const CODELENS_CONST = {
	rightMenu: "rightMenu",
	funcHead: "funcHead",
	// Supported programming languages
	allowableLanguages: ["typescript", "javascript", "python", "go", "c", "c++", "lua", "java", "php", "ruby"],
	// codeLensLanguages: ["c", "c++", "go", "python"],    // Supported programming languages for codeLens
}

/**
 * Codelens menu item
 */
export interface CodelensItem {
	key: string
	actionName: string
	tooltip: string
	command: string
}

// Create a function to get the codelens items
export function getCodelensItems() {
	return {
		explain: {
			key: "explain",
			actionName: t("common:command.explain.name"),
			tooltip: t("common:command.explain.tip"),
			command: getCommand("codelens_button"),
			actionType: "ZGSM_EXPLAIN",
			inputPrompt: t("common:command.explain.input_prompt"),
			inputPlaceholder: t("common:command.explain.input_placeholder"),
		} as CodelensItem,
		addComment: {
			key: "addComment",
			actionName: t("common:command.add_comment.name"),
			tooltip: t("common:command.add_comment.tip"),
			command: getCommand("codelens_button"),
			actionType: "ZGSM_ADD_COMMENT",
			inputPrompt: t("common:command.add_comment.input_prompt"),
			inputPlaceholder: t("common:command.add_comment.input_placeholder"),
		} as CodelensItem,
		addTests: {
			key: "addTests",
			actionName: t("common:command.add_tests.name"),
			tooltip: t("common:command.add_tests.tip"),
			command: getCommand("codelens_button"),
			actionType: "ZGSM_ADD_TEST",
			inputPrompt: t("common:command.add_tests.input_prompt"),
			inputPlaceholder: t("common:command.add_tests.input_placeholder"),
		} as CodelensItem,
		codeReview: {
			key: "codeReview",
			actionName: t("common:command.code_review.name"),
			tooltip: t("common:command.code_review.tip"),
			command: getCommand("codelens_button"),
			actionType: "ZGSM_CODE_REVIEW",
			inputPrompt: t("common:command.code_review.input_prompt"),
			inputPlaceholder: t("command.code_review.input_placeholder"),
		} as CodelensItem,
		addDebugCode: {
			key: "addDebugCode",
			actionName: t("common:command.add_debug_code.name"),
			tooltip: t("common:command.add_debug_code.tip"),
			command: getCommand("codelens_button"),
			actionType: "ZGSM_ADD_DEBUG_CODE",
			inputPrompt: t("common:command.add_debug_code.input_prompt"),
			inputPlaceholder: t("common:command.add_debug_code.input_placeholder"),
		} as CodelensItem,
		addStrongerCode: {
			key: "addStrongerCode",
			actionName: t("common:command.add_stronger_code.name"),
			tooltip: t("common:command.add_stronger_code.tip"),
			command: getCommand("codelens_button"),
			actionType: "ZGSM_ADD_STRONG_CODE",
			inputPrompt: t("common:command.add_stronger_code.input_prompt"),
			inputPlaceholder: t("common:command.add_stronger_code.input_placeholder"),
		} as CodelensItem,
		simplifyCode: {
			key: "simplifyCode",
			actionName: t("common:command.simplify_code.name"),
			tooltip: t("common:command.simplify_code.tip"),
			command: getCommand("codelens_button"),
			actionType: "ZGSM_SIMPLIFY_CODE",
			inputPrompt: t("common:command.simplify_code.input_prompt"),
			inputPlaceholder: t("common:command.simplify_code.input_placeholder"),
		} as CodelensItem,
		performanceOptimization: {
			key: "performanceOptimization",
			actionName: t("common:command.performance_optimization.name"),
			tooltip: t("common:command.performance_optimization.tip"),
			command: getCommand("codelens_button"),
			actionType: "ZGSM_PERFORMANCE",
			inputPrompt: t("common:command.performance_optimization.input_prompt"),
			inputPlaceholder: t("common:command.performance_optimization.input_placeholder"),
		} as CodelensItem,
		shenmaInstructSet: {
			key: "shenmaInstructSet",
			actionName: `$(costrict-icon)$(chevron-down)`,
			tooltip: t("common:command.shenma_instruct_set.tip"),
			command: getCommand("codelens_more_button"),
			actionType: "ZGSM_EXPLAIN",
			inputPrompt: t("common:command.shenma_instruct_set.input_prompt"),
			inputPlaceholder: t("common:command.shenma_instruct_set.input_placeholder"),
		} as CodelensItem,
	} as {
		[key: string]: any
	}
}

// Initialize the constant
export let CODELENS_FUNC = getCodelensItems()

// Function to refresh the Costrict constants when language changes
export function refreshCodelensFunc() {
	CODELENS_FUNC = getCodelensItems()
}

// Register refreshCodelensFunc to the language refresh list
registerRefreshFunction(refreshCodelensFunc)

export const configCodeLens = "FunctionQuickCommands"
