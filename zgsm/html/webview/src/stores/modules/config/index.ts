import { callBackIde } from "@/utils/ide";
import { maskPhoneNumber } from "@/utils/common";
import { defineStore } from 'pinia';

/**
 * Configuration information obtained from the IDE
 */
interface IdeConfig {
    chatUrl: string;
    ide: string;
    extVersion: string;
    ideVersion: string;
    hostIp?: string;
    model?: string;
}

/**
 * Interface for user information
 */
export interface UserInfo {
    avatar: string;         // User avatar
    avatar_color: string;   // Avatar color
    name: string;           // User's full name
    username: string;       // Username
    display_name: string;   // Display name (default is username, can be modified)
    description: string;    // User description
    is_admin: boolean;      // Whether the user is an administrator
    token: string;          // Token (access_token)
}

// Interface for application configuration
interface AppConfig {
    chatUrl: string;        // URL of the ZGSM chat service
    model: string;          // Model name
}

// Client settings
interface ClientConfig {
    ide: string;            // Name of the IDE
    extVersion: string;     // Version number of the ZGSM plugin
    ideVersion: string;     // Version number of the IDE
    hostIp: string;         // IP address of the client host
}

// Interface for configuration state
export interface ConfigState {
    userInfo: UserInfo;     // User information
    appConfig: AppConfig;   // Application configuration
    clientConfig: ClientConfig; // Client configuration
    spinning: boolean;      // Loading state
}

// Define the Pinia store
export const useConfigStore = defineStore('auth-store', {
    // State initialization
    state: (): ConfigState => ({
        userInfo: {} as UserInfo, // Initialize user information
        appConfig: {} as AppConfig, // Initialize application configuration
        clientConfig: {} as ClientConfig, // Initialize client configuration
        spinning: true // Initialize the loading state
    }),

    actions: {
        // Get the configuration
        getConfig() {
            // Get the configuration through the IDE callback
            callBackIde('ide.getConfig', {}, (data: IdeConfig) => {
                // Merge the new configuration into the current configuration
                this.appConfig.chatUrl = data.chatUrl;
                this.appConfig.model = data.model ?? "";
                this.clientConfig.ide = data.ide;
                this.clientConfig.ideVersion = data.ideVersion;
                this.clientConfig.extVersion = data.extVersion;
                this.clientConfig.hostIp = data.hostIp ?? "";
                console.log("getConfig data", data,
                    "app:", this.appConfig, "client:", this.clientConfig, "user:", this.userInfo);
            });
        },
        // Update the server address configuration
        updateConfig(config: Partial<AppConfig>) {
            if (config.chatUrl) {
                this.appConfig.chatUrl = config.chatUrl;
            }
            console.log("updateConfig", config)
        },
        // Get the theme color configuration
        getThemeColor() {
            callBackIde('ide.getThemeColor', null, (data: any) => {
                this.changeTheme(data);
            });
        },
        // Update the theme color
        changeTheme(data: any) {
            // There is a problem with the color scheme returned by the JetBrains light theme. Handle it specially here.
            if (data.currentThemeName && data.currentThemeName.toLowerCase() === 'light') {
                data = {
                    currentThemeName: 'light',
                    textColor: 'rgb(0, 0, 0)',
                    editorBgColor: 'rgb(255, 255, 255)',
                    buttonColor: 'rgb(0, 0, 0)',
                    buttonBgColor: 'rgb(242, 242, 242)',
                    inputColor: 'rgb(0, 0, 0)',
                    inputBgColor: 'rgb(242, 242, 242)',
                    dropdownColor: 'rgb(0, 0, 0)',
                    dropdownBgColor: 'rgb(242, 242, 242)',
                    scrollColor: 'rgb(163, 184, 204)',
                    scrollBgColor: 'rgb(242, 242, 242)',
                    borderColor: 'rgb(196, 196, 196)'
                };
            }
            document.documentElement.style.setProperty('--text-color', this.formatColor(data['textColor']));
            document.documentElement.style.setProperty('--bg-color', this.formatColor(data['editorBgColor']));
            document.documentElement.style.setProperty('--btn-color', this.formatColor(data['buttonColor']));
            document.documentElement.style.setProperty('--btn-bg-color', this.formatColor(data['buttonBgColor'], 'buttonBgColor'));
            document.documentElement.style.setProperty('--input-color', this.formatColor(data['inputColor']));
            document.documentElement.style.setProperty('--input-bg-color', this.formatColor(data['inputBgColor'], 'inputBgColor'));
            document.documentElement.style.setProperty('--dropdown-color', this.formatColor(data['dropdownColor']));
            document.documentElement.style.setProperty('--dropdown-bg-color', this.formatColor(data['dropdownBgColor']));
            document.documentElement.style.setProperty('--scroll-color', this.formatColor(data['scrollColor']));
            document.documentElement.style.setProperty('--scroll-bg-color', this.formatColor(data['scrollBgColor']));
            document.documentElement.style.setProperty('--border-color', this.formatColor(data['borderColor']));
        },
        // Extract the color
        formatColor(colorStr: string, key?: string) {
            const rgbValues = colorStr ? colorStr.match(/\d+/g) || [] : [];
            // Convert RGB values to integers
            const r = parseInt(rgbValues[0]);
            const g = parseInt(rgbValues[1]);
            const b = parseInt(rgbValues[2]);
            if (['buttonBgColor', 'inputBgColor', 'borderColor'].includes(key || '')) {
                if (r === 255 && g === 255 && b === 255) {
                    return `rgb(${242}, ${242}, ${242})`;
                } else if (r === 0 && g === 0 && b === 0) {
                    return `rgb(${48}, ${48}, ${48})`;
                }
            }
            // Assemble into RGB format
            const rgbStr = `rgb(${r}, ${g}, ${b})`;
            return rgbStr;
        },
        // Update user information
        setUser(data: Partial<UserInfo>) {
            this.userInfo.username = data.username || '';
            this.userInfo.token = data.token || '';
            if (!this.userInfo.display_name) {
                this.userInfo.display_name = maskPhoneNumber(this.userInfo.username);
            }
            console.log("setUser: ", data, "=>", this.userInfo)
        },

        // Turn off the loading state
        closeSpinning() {
            this.spinning = false;
        }
    },
});