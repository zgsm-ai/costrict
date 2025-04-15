/**
 * Copyright (c) 2024 - Sangfor LTD.
 *
 * All rights reserved. Code licensed under the MIT license
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 */
// Completion: Model settings
export const settings = {
    // fillmodel in settings
    fillmodel: true,
    // openai_model in settings
    openai_model: "fastertransformer",
    // temperature in settings
    temperature: 0.1,
};
// Completion: Preset constants
export const COMPLETION_CONST = {
    allowableLanguages: ['vue', 'typescript', 'javascript', 'python', 'go',
        'c', 'c++', 'shell', 'bash', 'batch', 'lua', 'java', 'php', 'ruby'],    // Supported languages for code completion
    codeCompletionLogUploadOnce: false, // Whether to upload code completion logs only once
    suggestionDelay: 300,               // Delay from user input to trigger request
    lineRejectedDelayIncrement: 1000,   // Delay increment after rejection on the same line (increase wait time after rejection to reduce interference)
    lineRejectedDelayMax: 3000,         // Maximum delay after rejection on the same line
    manualTriggerDelay: 50,             // Delay for manual completion trigger
    feedbackInterval: 3000,             // Feedback timer interval
    collectInterval: 3000,              // Timer interval for collecting code snippets
};

// Extension ID corresponds to publisher.name in package.json
export const EXTENSION_ID = "zgsm-ai.zgsm";

// VSCode related
export const VSCODE_CONST = {
    checkSpin: '$(check~spin)',  // Checkmark icon
    xSpin: '$(x~spin)',  // X icon
    loadingSpin: '$(loading~spin)',  // Loading spinner icon
};

// Webview theme related
export const WEBVIEW_THEME_CONST = {
    1: 'vs',
    2: 'vs-dark',
    3: 'vs-dark',
    4: 'vs'
};

export const SELECTION_BG_COLOR = {
    0: 'rgba(38, 79, 120, 1)',  // Default
    1: 'rgba(173, 214, 255, 1)',
    2: 'rgba(38, 79, 120, 1)',
    3: 'rgba(38, 79, 120, 1)',
    4: 'rgba(173, 214, 255, 1)'
};

// Constants related to codelens buttons
export const CODELENS_CONST = {
    rightMenu: "rightMenu",
    funcHead: "funcHead",
    // Supported programming languages
    allowableLanguages: ['typescript', 'javascript', 'python', 'go',
        'c', 'c++', 'lua', 'java', 'php', 'ruby']
    // codeLensLanguages: ["c", "c++", "go", "python"],    // Supported programming languages for codeLens
};

/**
 * Codelens menu item
 */
export interface CodelensItem {
    key: string;
    actionName: string;
    tooltip: string;
    command: string;
}
/**
 * Codelens button
 * The key, actionName here correspond to those in package.json, ensure consistency when modifying
 */
export const CODELENS_FUNC: { [key: string]: CodelensItem } = {
    explain: {
        key: 'explain',
        actionName: 'Explain Code',
        tooltip: "Explain code implementation",
        // for Roo Code
        command: "vscode-zgsm.codelens_button",
        actionType: "ZGSM_EXPLAIN",
        inputPrompt: "What would you like ZGSM to explain?",
        inputPlaceholder: "E.g. How does the error handling work?",
    } as CodelensItem,
    addComment: {
        key: 'addComment',
        actionName: 'Add Comments',
        tooltip: "Add comments to this function",
        // for Roo Code
        command: "vscode-zgsm.codelens_button",
        actionType: "ZGSM_ADD_COMMENT",
        inputPrompt: "What would you like ZGSM to do?",
        inputPlaceholder: "E.g. Add comments to the code",
    } as CodelensItem,
    addTests: {
        key: 'addTests',
        actionName: 'Generate Unit Tests',
        tooltip: "Generate unit tests for this function",
        // for Roo Code
        command: "vscode-zgsm.codelens_button",
        actionType: "ZGSM_ADD_TEST",
        inputPrompt: "What would you like ZGSM to do?",
        inputPlaceholder: "E.g. Generate unit tests for this function",
    } as CodelensItem,
    codeReview: {
        key: 'codeReview',
        actionName: 'Code Review',
        tooltip: "Check for code quality issues and provide suggestions",
        // for Roo Code
        command: "vscode-zgsm.codelens_button",
        actionType: "ZGSM_CODE_REVIEW",
        inputPrompt: "What would you like ZGSM to do?",
        inputPlaceholder: "E.g. Check for code quality issues and provide suggestions to the code",
    } as CodelensItem,
    addDebugCode: {
        key: 'addDebugCode',
        actionName: 'Add Debug Code',
        tooltip: "Enhance troubleshooting capabilities by adding logs and debug code to key logic steps",
        // for Roo Code
        command: "vscode-zgsm.codelens_button",
        actionType: "ZGSM_ADD_DEBUG_CODE",
        inputPrompt: "What would you like ZGSM to do?",
        inputPlaceholder: "E.g. Enhance troubleshooting capabilities by adding logs and debug code to key logic steps to the code",
    } as CodelensItem,
    addStrongerCode: {
        key: 'addStrongerCode',
        actionName: 'Add Error Handling',
        tooltip: "Enhance robustness by adding exception handling and parameter validation",
        // for Roo Code
        command: "vscode-zgsm.codelens_button",
        actionType: "ZGSM_ADD_STRONG_CODE",
        inputPrompt: "What would you like ZGSM to do?",
        inputPlaceholder: "E.g. Enhance robustness by adding exception handling and parameter validation to the code",
    } as CodelensItem,
    simplifyCode: {
        key: 'simplifyCode',
        actionName: 'Simplify Code',
        tooltip: "Remove ineffective code",
        // for Roo Code
        command: "vscode-zgsm.codelens_button",
        actionType: "ZGSM_SIMPLIFY_CODE",
        inputPrompt: "What would you like ZGSM to do?",
        inputPlaceholder: "E.g. Remove ineffective part of the code",
    } as CodelensItem,
    performanceOptimization: {
        key: 'performanceOptimization',
        actionName: 'Performance Optimization',
        tooltip: "Improve code performance, provide modification suggestions, focus on efficiency issues",
        // for Roo Code
        command: "vscode-zgsm.codelens_button",
        actionType: "ZGSM_PERFORMANCE",
        inputPrompt: "What would you like ZGSM to do?",
        inputPlaceholder: "E.g. Improve code performance, provide modification suggestions, focus on efficiency issues to the following code",
    } as CodelensItem,
    shenmaInstructSet: {
        key: 'shenmaInstructSet',
        actionName: `$(zhuge-shenma-icon)$(chevron-down)`,
        tooltip: "Shenma Instruction Set",
        // for Roo Code
        command: "vscode-zgsm.codelens_more_button",
        actionType: "ZGSM_EXPLAIN",
        inputPrompt: "What would you like ZGSM to do?",
        inputPlaceholder: "E.g. Add comments to the code",
    } as CodelensItem
};


export const codeLensDiffCodeTempFileDir = "codeLensDiffCodeTempFileDir";
export const noDirtyFile = "no dirty file";

export const configShenmaName = "ZhugeShenma";
export const configCompletion = "IntelligentCodeCompletion";
export const configCodeLens = "FunctionQuickCommands";

// User Authentication
export const AUTH_TYPE = `zgsm-auth0`;
export const AUTH_NAME = `Auth0`;
export const SESSIONS_SECRET_KEY = `${AUTH_TYPE}.sessions`;
export const ACCESS_TOKEN_KEY = `${AUTH_TYPE}.accessToken`;