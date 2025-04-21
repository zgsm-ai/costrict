import { authentication, AuthenticationProvider, AuthenticationProviderAuthenticationSessionsChangeEvent, AuthenticationSession, Disposable, Event, EventEmitter, ExtensionContext } from 'vscode';
import axios from 'axios';
import { ZgsmOAuthHandler } from './zgsm-oauth';
import { updateApiKey } from '../../../zgsm/src/common/env';

const ZGSM_AUTH_TYPE = 'zgsm';
const ZGSM_AUTH_NAME = 'Zhuge Shenma';
const ZGSM_SESSIONS_KEY = 'zgsm.sessions';
const ZGSM_TOKEN_KEY = 'zgsm.token';

export interface ZgsmAuthConfig {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    loginUrl: string;
    tokenUrl: string;
    logoutUrl: string;
}

export class ZgsmAuthProvider implements AuthenticationProvider, Disposable {
    private static instance: ZgsmAuthProvider;
    private _sessionChangeEmitter = new EventEmitter<AuthenticationProviderAuthenticationSessionsChangeEvent>();
    private _disposable: Disposable;
    private _oauthHandler: ZgsmOAuthHandler;

    constructor(
        private readonly context: ExtensionContext,
        private readonly config: ZgsmAuthConfig
    ) {
        this._disposable = Disposable.from(
            authentication.registerAuthenticationProvider(ZGSM_AUTH_TYPE, ZGSM_AUTH_NAME, this, { supportsMultipleAccounts: false })
        );

        this._oauthHandler = new ZgsmOAuthHandler({
            clientId: this.config.clientId,
            clientSecret: this.config.clientSecret,
            redirectUri: this.config.redirectUri,
            tokenUrl: this.config.tokenUrl
        });
    }

    public static getInstance(context: ExtensionContext, config: ZgsmAuthConfig): ZgsmAuthProvider {
        if (!ZgsmAuthProvider.instance) {
            ZgsmAuthProvider.instance = new ZgsmAuthProvider(context, config);
        }
        return ZgsmAuthProvider.instance;
    }

    get onDidChangeSessions(): Event<AuthenticationProviderAuthenticationSessionsChangeEvent> {
        return this._sessionChangeEmitter.event;
    }

    async getSessions(scopes?: readonly string[]): Promise<AuthenticationSession[]> {
        const sessionsJson = await this.context.secrets.get(ZGSM_SESSIONS_KEY);
        if (sessionsJson) {
            return JSON.parse(sessionsJson);
        }
        return [];
    }

    async createSession(scopes: string[]): Promise<AuthenticationSession> {
        try {
            const tokenData = await this.getTokenFromOAuth();
            if (!tokenData?.access_token) {
                throw new Error('Failed to get access token');
            }

            const session: AuthenticationSession = {
                id: this.generateId(),
                accessToken: tokenData.access_token,
                account: {
                    label: this.getUsernameFromToken(tokenData.access_token),
                    id: this.getUsernameFromToken(tokenData.access_token)
                },
                scopes: scopes || []
            };

            await this.storeSession(session);
            await this.storeToken(tokenData);
            
            this._sessionChangeEmitter.fire({ added: [session], removed: [], changed: [] });
            return session;
        } catch (e) {
            throw new Error(`Sign in failed: ${e}`);
        }
    }

    async removeSession(sessionId: string): Promise<void> {
        const sessions = await this.getSessions();
        const sessionIndex = sessions.findIndex(s => s.id === sessionId);
        if (sessionIndex > -1) {
            const session = sessions[sessionIndex];
            sessions.splice(sessionIndex, 1);
            await this.context.secrets.store(ZGSM_SESSIONS_KEY, JSON.stringify(sessions));
            await this.context.secrets.store(ZGSM_TOKEN_KEY, '{}');
            this._sessionChangeEmitter.fire({ added: [], removed: [session], changed: [] });
        }
    }

    private async storeSession(session: AuthenticationSession): Promise<void> {
        const sessions = await this.getSessions();
        sessions.push(session);
        await this.context.secrets.store(ZGSM_SESSIONS_KEY, JSON.stringify(sessions));
    }

    private async storeToken(tokenData: any): Promise<void> {
        await this.context.secrets.store(ZGSM_TOKEN_KEY, JSON.stringify(tokenData));
    }

    private async getTokenFromOAuth(): Promise<any> {
        try {
            const tokenData = await this._oauthHandler.login();
            if (tokenData?.access_token) {
                // 更新全局的 API Key
                updateApiKey(tokenData.access_token);
            }
            return tokenData;
        } catch (error) {
            throw new Error(`OAuth login failed: ${error}`);
        }
    }

    private generateId(): string {
        return Math.random().toString(36).substring(2) + Date.now().toString(36);
    }

    private getUsernameFromToken(token: string): string {
        try {
            const payload = token.split('.')[1];
            const decoded = JSON.parse(Buffer.from(payload, 'base64').toString());
            return decoded.preferred_username || decoded.email || 'Unknown User';
        } catch {
            return 'Unknown User';
        }
    }

    dispose(): void {
        this._disposable.dispose();
    }
} 