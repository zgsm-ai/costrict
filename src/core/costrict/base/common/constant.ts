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

// Completion: Model settings
export const settings = {
	// fillmodel in settings
	fillmodel: true,
	// openai_model in settings
	openai_model: "fastertransformer",
	// temperature in settings
	temperature: 0.1,
}
// Completion: Preset constants
export const COMPLETION_CONST = {
	allowableLanguages: [
		"vue",
		"typescript",
		"javascript",
		"python",
		"go",
		"c",
		"c++",
		"shell",
		"bash",
		"batch",
		"lua",
		"java",
		"php",
		"ruby",
	], // Supported languages for code completion
	codeCompletionLogUploadOnce: false, // Whether to upload code completion logs only once
	suggestionDelay: 300, // Delay from user input to trigger request
	lineRejectedDelayIncrement: 1000, // Delay increment after rejection on the same line (increase wait time after rejection to reduce interference)
	lineRejectedDelayMax: 1000, // Maximum delay after rejection on the same line
	manualTriggerDelay: 50, // Delay for manual completion trigger
	feedbackInterval: 5000, // Feedback timer interval
	collectInterval: 5000, // Timer interval for collecting code snippets
}

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
			actionName: `$(zgsm-icon)$(chevron-down)`,
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

// Function to refresh the Zgsm constants when language changes
export function refreshCodelensFunc() {
	CODELENS_FUNC = getCodelensItems()
}

// Register refreshCodelensFunc to the language refresh list
registerRefreshFunction(refreshCodelensFunc)

export const configCompletion = "IntelligentCodeCompletion"
export const configCodeLens = "FunctionQuickCommands"
// OpenAI Client
export const OPENAI_CLIENT_NOT_INITIALIZED = "OpenAI client not initialized"
export const OPENAI_REQUEST_ABORTED = "Request was aborted"

// Battle Mode 相关常量
export const BATTLE_MODE_CONST = {
	// 战斗模式开关
	enabled: false, // 默认禁用

	// 错误阈值配置
	errorThresholds: {
		level1: 3, // L1 策略阈值（忽略继续）
		level2: 5, // L2 策略阈值（上下文清理）
		level3: 5, // L3 策略最小阈值（模型切换）
	},

	// 上下文清理配置
	contextCleanup: {
		keepLastUserMessage: true, // 保留最后的用户消息
		keepLastSystemMessage: true, // 保留系统消息
		maxMessagesToRemove: 10, // 最多移除的消息数量
	},

	// 模型切换配置
	modelSwitching: {
		fallbackModels: ["gpt-4o", "claude-3-5-sonnet", "gemini-1.5-pro"], // 备用模型列表
		maxSwitches: 3, // 最大切换次数
		validateBeforeSwitch: true, // 切换前验证模型可用性
	},

	// L1 策略配置
	l1Strategy: {
		maxErrorCount: 3, // 最大错误计数
		toleratedErrorTypes: ["timeout", "rate limit", "network error", "temporary error", "service unavailable"], // 可容忍的错误类型
		logToleratedErrors: true, // 记录容忍的错误
		retryDelay: 1000, // 重试延迟（毫秒）
	},

	// L2 策略配置
	l2Strategy: {
		minErrorCount: 3, // 最小错误计数
		maxErrorCount: 5, // 最大错误计数
		triggerErrorTypes: ["context window", "token limit", "memory", "too long", "size limit"], // 触发清理的错误类型
		keepLastUserMessage: true, // 保留最后的用户消息
		keepSystemMessages: true, // 保留系统消息
		maxMessagesToRemove: 10, // 最多移除的消息数量
		retryDelay: 2000, // 重试延迟（毫秒）
	},

	// L3 策略配置
	l3Strategy: {
		minErrorCount: 5, // 最小错误计数
		maxSwitches: 3, // 最大切换次数
		triggerErrorTypes: ["internal error", "model unavailable", "service error", "unavailable", "failed"], // 触发切换的错误类型
		fallbackModels: ["gpt-4o", "claude-3-5-sonnet", "gemini-1.5-pro"], // 默认备用模型
		retryDelay: 3000, // 重试延迟（毫秒）
		validateBeforeSwitch: true, // 切换前验证模型可用性
	},

	// 历史记录限制
	history: {
		maxToleratedErrors: 100, // 最大容忍错误历史记录数
		maxCleanupHistory: 50, // 最大清理历史记录数
		maxSwitchHistory: 20, // 最大切换历史记录数
	},

	// 配置验证限制
	validation: {
		minLevel1Threshold: 1, // L1 阈值最小值
		maxLevel1Threshold: 10, // L1 阈值最大值
		minLevel2Threshold: 2, // L2 阈值最小值
		maxLevel2Threshold: 20, // L2 阈值最大值
		minLevel3Threshold: 3, // L3 阈值最小值
		maxLevel3Threshold: 30, // L3 阈值最大值
		minMaxSwitches: 1, // 最大切换次数最小值
		maxMaxSwitches: 10, // 最大切换次数最大值
		minMaxMessagesToRemove: 1, // 最大移除消息数最小值
		maxMaxMessagesToRemove: 50, // 最大移除消息数最大值
	},
}

// 战斗模式状态枚举
export enum BattleModeState {
	INACTIVE = "inactive", // 非激活状态
	ACTIVE = "active", // 激活状态
	PAUSED = "paused", // 暂停状态
}

// 恢复策略级别枚举
export enum RecoveryStrategyLevel {
	Level1 = "level1", // L1: 忽略继续
	Level2 = "level2", // L2: 上下文清理
	Level3 = "level3", // L3: 模型切换
}

// 恢复动作类型枚举
export enum RecoveryAction {
	CONTINUE = "continue", // 继续执行
	RETRY = "retry", // 重试
	SWITCH_MODEL = "switch_model", // 切换模型
	ABORT = "abort", // 中止
}

// 错误类型枚举
export enum BattleModeErrorType {
	RECOVERY = "recovery", // 可恢复错误
	FATAL = "fatal", // 致命错误
}

// 战斗模式配置相关消息
export const BATTLE_MODE_MESSAGES = {
	// 启用/禁用消息
	enabled: "战斗模式已启用",
	disabled: "战斗模式已禁用",
	paused: "战斗模式已暂停",
	resumed: "战斗模式已恢复",

	// L1 策略消息
	l1Continue: "错误已容忍并忽略，继续执行",
	l1ThresholdReached: "已达到 L1 策略错误阈值，升级到 L2 策略",

	// L2 策略消息
	l2Cleanup: "已清理对话上下文后重试",
	l2ThresholdReached: "已达到 L2 策略错误阈值，升级到 L3 策略",
	l2NoCleaner: "未配置对话清理器，直接重试",

	// L3 策略消息
	l3SwitchModel: "已切换到备用模型后重试",
	l3MaxSwitchesReached: "已达到最大模型切换次数，无法继续切换",
	l3NoSwitcher: "未配置模型切换器，无法进行模型切换",
	l3NoFallbackModels: "没有可用的备用模型",

	// 错误消息
	cleanupFailed: "上下文清理失败",
	switchFailed: "模型切换失败",
	validationFailed: "配置验证失败",
	invalidConfig: "无效的战斗模式配置",
}
