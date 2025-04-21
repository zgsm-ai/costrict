import { authConfig, getAuthUrls } from '../config/auth';

export interface AuthConfig {
    baseUrl: string;
    realmName: string;
    clientId: string;
    clientSecret: string;
    loginUrl: string;
    logoutUrl: string;
    tokenUrl: string;
    redirectUri: string;
}

class AuthConfigManager {
    private static instance: AuthConfigManager;
    private config: AuthConfig;

    private constructor() {
        const urls = getAuthUrls();
        this.config = {
            baseUrl: authConfig.baseUrl,
            realmName: authConfig.realmName,
            clientId: authConfig.clientId,
            clientSecret: authConfig.clientSecret,
            loginUrl: urls.loginUrl,
            logoutUrl: urls.logoutUrl,
            tokenUrl: urls.tokenUrl,
            redirectUri: urls.redirectUri
        };
    }

    public static getInstance(): AuthConfigManager {
        if (!AuthConfigManager.instance) {
            AuthConfigManager.instance = new AuthConfigManager();
        }
        return AuthConfigManager.instance;
    }

    public getConfig(): AuthConfig {
        return this.config;
    }

    public updateConfig(newConfig: Partial<AuthConfig>): void {
        this.config = {
            ...this.config,
            ...newConfig
        };
    }
}

export const authConfigManager = AuthConfigManager.getInstance();
export const getAuthConfig = () => authConfigManager.getConfig();
export const updateAuthConfig = (config: Partial<AuthConfig>) => authConfigManager.updateConfig(config); 