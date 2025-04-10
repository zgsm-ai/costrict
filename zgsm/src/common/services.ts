/**
 * Copyright (c) 2024 - Sangfor LTD.
 *
 * All rights reserved. Code licensed under the MIT license
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 */
import * as vscode from 'vscode';
import { getExtensionsLatestVersion } from "./api";
import { EXTENSION_ID, configCompletion, configCodeLens } from "./constant";
import { envSetting, updateEnv } from "./env";
import { Logger } from "./log-util";
import { LangSetting, LangSwitch, LangDisables, getLanguageByFilePath, loadRemoteLanguageExtensions } from './lang-util';
import { DateFormat, formatTime, formatTimeDifference } from './util';
import { getCompleteConfig } from './vscode-util';

/**
 * Set up a timer to periodically check for extension updates and programming language settings
 */
export function setupExtensionUpdater(context: vscode.ExtensionContext) {
    setTimeout(() => {
        loadRemoteLanguageExtensions();
        updateExtensions(context);
    }, 3000);
    setInterval(() => {
        loadRemoteLanguageExtensions();     // Load language extension data
        updateExtensions(context);          // Check for extension updates
    }, 1000 * 60 * 60);
}

const ZGSM_IGNORE_VERSION = "zgsmIgnoreVersion";
const ZGSM_LASTTIME_CHECKED = "zgsmLastChecked";

/**
 * Update the extension
 */
async function updateExtensions(context: vscode.ExtensionContext): Promise<void> {
    if (!isTimeToCheck(context)) {
        return;
    }
    // Get extension information
    const extension = vscode.extensions.getExtension(EXTENSION_ID);
    if (!extension) {
        return;
    }
    const extensionName = extension.packageJSON.name;
    if (extensionName !== "zgsm") {
        return;
    }
    const extensionVersion = extension.packageJSON.version as string;
    const zgsmLatestVersion = await getLatestVersion(extensionVersion);
    if (isIgnoreVersion(context, zgsmLatestVersion)) {
        return;
    }

    if (zgsmLatestVersion === extensionVersion) {
        Logger.log(`Extension ${extensionName} (${extensionVersion}) is already the latest version`);
        return;
    }
    Logger.log(`Extension ${extensionName} has an available update (${extensionVersion})`);
    vscode.window.showInformationMessage(
        `Zhuge Shenma plugin has a version update (${zgsmLatestVersion}), come and upgrade to experience new features,\nRestart the software is required after the update to take effect.`,
        { modal: false }, 'Confirm', 'Ignore'
    ).then((result) => {
        if (result === 'Confirm') {        // User clicked the "Confirm" button
            Logger.log(`User clicked the "Confirm" button`);
            try {
                vscode.commands.executeCommand('workbench.extensions.search', EXTENSION_ID);
            } catch (err) {
                Logger.error(err);
            }
        } else if (result === 'Ignore') { // User clicked the "Ignore" button
            Logger.log(`Ignore version ${zgsmLatestVersion} update`);
            context.globalState.update(ZGSM_IGNORE_VERSION, zgsmLatestVersion);
        }
    });
}

/**
 * Check if it's time to check for updates again
 */
function isTimeToCheck(context: vscode.ExtensionContext): boolean {
    const globalState = context.globalState;
    const zgsmLastChecked = globalState.get(ZGSM_LASTTIME_CHECKED);
    const currentTime = Date.now();
    if (!zgsmLastChecked) {
        globalState.update(ZGSM_LASTTIME_CHECKED, currentTime);
    } else {
        const lastChecked = formatTime(new Date(zgsmLastChecked as number), DateFormat.LITE);
        const timeDiff = currentTime - (zgsmLastChecked as number);
        const timeDiffStr = formatTimeDifference(timeDiff);
        const maxIntervalStr = formatTimeDifference(envSetting.updateExtensionsTimeInterval);
        if (timeDiff > envSetting.updateExtensionsTimeInterval) {
            Logger.info(`Last check time for zgsm-ai.zgsm extension: ${lastChecked}, waiting time ${timeDiffStr} exceeded ${maxIntervalStr}, need to check again`);
            // Check for updates every 12 hours
            globalState.update(ZGSM_LASTTIME_CHECKED, currentTime);
            return true;
        }
        Logger.info(`Last check time for zgsm-ai.zgsm extension: ${lastChecked}, waiting time ${timeDiffStr} is less than ${maxIntervalStr}, no need to update`);
    }
    return false;
}

/**
 * Check if the version is ignored
 */
function isIgnoreVersion(context: vscode.ExtensionContext, extensionVersion: string): boolean {
    const globalState = context.globalState;
    const zgsmIgnoreVersion = globalState.get(ZGSM_IGNORE_VERSION) as string;
    if (zgsmIgnoreVersion === extensionVersion) {
        Logger.info(`zgsm-ai.zgsm extension update ignored version ${ZGSM_IGNORE_VERSION}: ${zgsmIgnoreVersion} `);
        return true;
    }
    return false;
}

/**
 * Get the latest version number
 */
async function getLatestVersion(extensionVersion: string): Promise<string> {
    const zgsmLatestVersionData = await getExtensionsLatestVersion();
    let zgsmLatestVersion = "";
    if (zgsmLatestVersionData) {
        zgsmLatestVersion = zgsmLatestVersionData.version;
    } else {
        // Avoid version being empty due to request exceptions
        zgsmLatestVersion = extensionVersion;
    }
    Logger.log('request success zgsmLatestVersion:', zgsmLatestVersion);
    return zgsmLatestVersion;
}

/**
 * Ensure that the Zhuge Shenma extension only performs actions once
 */
export function doExtensionOnce(context: vscode.ExtensionContext) {
    const isFirstTime = context.globalState.get('isFirstTime');
    if (!isFirstTime) {
        // Record the flag when the plugin is started for the first time
        context.globalState.update('isFirstTime', true);
        vscode.workspace.getConfiguration(configCompletion).update('enabled', true, vscode.ConfigurationTarget.Global);
    }

    const shortCutKeySupport = context.globalState.get('shortCutKeySupport');
    if (!shortCutKeySupport) {
        // Show a message box for code auto-completion
        vscode.window.showInformationMessage('Zhuge Shenma (code auto-completion) now supports manual triggering, use the shortcut key ALT+A to quickly experience', "Got it");
        context.globalState.update("shortCutKeySupport", true);
    }
}

/**
 * Update settings related to [Function Quick Menu]
 */
export function updateCodelensConfig() {
    const config = vscode.workspace.getConfiguration(configCodeLens);
    const disables: LangDisables = config.get("disableLanguages") || {};
    const enabled = config.get("enabled");

    if (enabled) {
        LangSetting.codelensEnabled = true;
    } else {
        LangSetting.codelensEnabled = false;
    }
    LangSetting.setCodelensDisables(disables);
}

/**
 * Update settings related to [Intelligent Code Completion]
 */
export function updateCompletionConfig() {
    const config = vscode.workspace.getConfiguration(configCompletion);
    const disables: LangDisables = config.get("disableLanguages") || {};
    const enabled = config.get("enabled");

    if (enabled) {
        LangSetting.completionEnabled = true;
    } else {
        LangSetting.completionEnabled = false;
    }
    LangSetting.setCompletionDisables(disables);
}

/**
 * Initialize language settings
 */
export function initLangSetting() {
    updateCodelensConfig();
    updateCompletionConfig();
    // Save the disables once during initialization, which can write all supported languages of the extension to the configuration items for easy user settings later.
    let config = vscode.workspace.getConfiguration(configCompletion);
    let disables = LangSetting.getCompletionDisables();
    config.update('disableLanguages', disables, vscode.ConfigurationTarget.Global);

    config = vscode.workspace.getConfiguration(configCodeLens);
    disables = LangSetting.getCodelensDisables();
    config.update('disableLanguages', disables, vscode.ConfigurationTarget.Global);
}

/**
 * Definition of showInformationMessage button commands
 */
type ButtonCommand = {
    funcName: string,
    setupGlobal: (button: any, value: boolean|LangSwitch) => void,
    setupLanguage: (button: any, value: boolean|LangSwitch) => void
};

/**
 * Definition of showInformationMessage buttons
 */
interface ButtonDefined {
    text: string;
    lang: string;
    value: LangSwitch | boolean;
    command: (button: any, value: boolean|LangSwitch) => void;
}

/**
 * Create a button array for a specific feature (completion/function quick menu)
 */
function createButtons(
    lang: string, cmd: ButtonCommand, enabled: boolean, sw: LangSwitch
): ButtonDefined[] {
    let buttons: ButtonDefined[] = [];
    if (enabled) {
        buttons.push({
            text: "Disable" + cmd.funcName,
            lang: lang,
            value: false,
            command: cmd.setupGlobal,
        });
        if (sw === LangSwitch.Disabled) {
            buttons.push({
                text: "Enable" + lang + cmd.funcName,
                lang: lang,
                value: LangSwitch.Enabled,
                command: cmd.setupLanguage,
            });
        } else {
            buttons.push({
                text: "Disable" + lang + cmd.funcName,
                lang: lang,
                value: LangSwitch.Disabled,
                command: cmd.setupLanguage,
            });
        }
    } else {
        buttons.push({
            text: "Enable Quick Menu",
            lang: lang,
            value: true,
            command: cmd.setupGlobal,
        });
    }
    return buttons;
}

/**
 * Get the set of languages that have disabled completion
 */
function getDisableLanguages(
    config: vscode.WorkspaceConfiguration,
    name: string = "disableLanguages"
): LangDisables {
    let disables: LangDisables = config.get(name) || {};
    // Convert all keys and values to lowercase
    disables = Object.entries(disables).reduce((acc: any, [key, value]) => {
        acc[key.toLowerCase()] = value.toLowerCase();
        return acc;
    }, {} as LangDisables);
    return disables;
}

/**
 * Set the language feature switch in user settings
 */
function setupLangSwitch(
    button: any, value: boolean|LangSwitch, config: vscode.WorkspaceConfiguration
) {
    const language = (button as ButtonDefined).lang;
    if (value === LangSwitch.Unsupported) {
        Logger.info(`The current language ${language} does not support code completion`);
        return;
    }
    const disables = getDisableLanguages(config, "disableLanguages");
    if (value === LangSwitch.Disabled) {
        disables[language] = "true";
    } else {
        disables[language] = "false";
    }
    config.update('disableLanguages', disables, vscode.ConfigurationTarget.Global);
}

/**
 * Function quick menu button settings
 */
const codelensCommand: ButtonCommand = {
    funcName: "Menu",
    setupGlobal: (button: any, value: boolean|LangSwitch) => {
        const config = vscode.workspace.getConfiguration(configCodeLens);
        config.update("enabled", value as boolean, vscode.ConfigurationTarget.Global);
        LangSetting.codelensEnabled = value as boolean;
    },
    setupLanguage: (button: any, value: boolean|LangSwitch) => {
        const config = vscode.workspace.getConfiguration(configCodeLens);
        setupLangSwitch(button, value, config);
    }
};

/**
 * Completion button settings
 */
const completionCommand: ButtonCommand = {
    funcName: "Completion",
    setupGlobal: (button: any, value: boolean|LangSwitch) => {
        const config = vscode.workspace.getConfiguration(configCompletion);
        config.update("enabled", value as boolean, vscode.ConfigurationTarget.Global);
        LangSetting.completionEnabled = value as boolean;
    },
    setupLanguage: (button: any, value: boolean|LangSwitch) => {
        const config = vscode.workspace.getConfiguration(configCompletion);
        setupLangSwitch(button, value, config);
    }
};

/**
 * Status bar click event function
 */
export function setupLangSwitchs() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return;
    }
    const language = getLanguageByFilePath(editor.document.uri.fsPath);
    const completionSwitch = LangSetting.getCompletionDisable(language);
    const codelensSwitch = LangSetting.getCodelensDisable(language);

    let buttons = createButtons(language, codelensCommand,
        LangSetting.codelensEnabled, codelensSwitch);
    buttons = buttons.concat(...createButtons(language, completionCommand,
        LangSetting.completionEnabled, completionSwitch));

    let buttonTexts: string[] = [];
    buttons.forEach((button) => {
        buttonTexts.push(button.text);
    });

    vscode.window.showInformationMessage('Enable/Disable "Function Quick Menu" and "Intelligent Code Completion"',
        { modal: false },
        ...buttonTexts
    ).then((button) => {
        for (let i = 0; i < buttons.length; i++) {
            if (button === buttons[i].text) {
                buttons[i].command(buttons[i], buttons[i].value);
            }
        }
    });
}