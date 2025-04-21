import { Uri, UriHandler, window, EventEmitter, env, ProgressLocation } from 'vscode';
import axios from 'axios';
import { getZgsmAuthUrl } from './urls';

export interface OAuthConfig {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    tokenUrl: string;
}

export class ZgsmOAuthHandler {
    private _uriHandler: UriHandler & { event: EventEmitter<Uri>['event'] };
    private _pendingStates: string[] = [];
    private _codeExchangePromises = new Map<string, { promise: Promise<any>; cancel: EventEmitter<void> }>();

    constructor(private config: OAuthConfig) {
        const uriEventEmitter = new EventEmitter<Uri>();
        this._uriHandler = {
            handleUri: (uri: Uri) => uriEventEmitter.fire(uri),
            event: uriEventEmitter.event
        };
    }

    public async login(): Promise<any> {
        return await window.withProgress({
            location: ProgressLocation.Notification,
            title: "Signing in to Zhuge Shenma",
            cancellable: true
        }, async (_, token) => {
            const stateId = this.generateState();
            this._pendingStates.push(stateId);

            try {
                const authUrl = getZgsmAuthUrl(stateId, env.uriScheme);
                await env.openExternal(Uri.parse(authUrl));

                const codeExchangePromise = this.createCodeExchangePromise();
                this._codeExchangePromises.set(stateId, codeExchangePromise);

                return await Promise.race([
                    codeExchangePromise.promise,
                    new Promise((_, reject) => setTimeout(() => reject('Login timeout'), 300000)),
                    new Promise((_, reject) => token.onCancellationRequested(() => reject('User cancelled')))
                ]);
            } finally {
                this._pendingStates = this._pendingStates.filter(n => n !== stateId);
                this._codeExchangePromises.get(stateId)?.cancel.fire();
                this._codeExchangePromises.delete(stateId);
            }
        });
    }

    private createCodeExchangePromise() {
        const cancel = new EventEmitter<void>();
        const promise = new Promise((resolve, reject) => {
            const subscription = this._uriHandler.event(async (uri: Uri) => {
                try {
                    const query = new URLSearchParams(uri.query);
                    const code = query.get('code');
                    const state = query.get('state');

                    if (!code || !state) {
                        reject(new Error('Invalid callback URL'));
                        return;
                    }

                    if (!this._pendingStates.includes(state)) {
                        reject(new Error('Invalid state'));
                        return;
                    }

                    const tokenData = await this.exchangeCodeForToken(code);
                    resolve(tokenData);
                } catch (err) {
                    reject(err);
                } finally {
                    subscription.dispose();
                }
            });

            cancel.event(() => {
                subscription.dispose();
                reject(new Error('Cancelled'));
            });
        });

        return { promise, cancel };
    }

    private async exchangeCodeForToken(code: string): Promise<any> {
        const response = await axios.post(this.config.tokenUrl, {
            client_id: this.config.clientId,
            client_secret: this.config.clientSecret,
            code,
            grant_type: 'authorization_code',
            redirect_uri: this.config.redirectUri
        }, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        return response.data;
    }

    private generateState(): string {
        return Math.random().toString(36).substring(2) + Date.now().toString(36);
    }
} 