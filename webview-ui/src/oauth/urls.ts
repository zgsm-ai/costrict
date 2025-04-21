import { getAuthConfig } from './config';

export function getCallbackUrl(provider: string, uriScheme?: string) {
	const callbackUrl = `${uriScheme || "vscode"}://rooveterinaryinc.roo-cline/${provider}`
	return encodeURIComponent(callbackUrl)
}

export function getGlamaAuthUrl(uriScheme?: string) {
	return `https://glama.ai/oauth/authorize?callback_url=${getCallbackUrl("glama", uriScheme)}`
}

export function getOpenRouterAuthUrl(uriScheme?: string) {
	return `https://openrouter.ai/auth?callback_url=${getCallbackUrl("openrouter", uriScheme)}`
}

export function getRequestyAuthUrl(uriScheme?: string) {
	return `https://app.requesty.ai/oauth/authorize?callback_url=${getCallbackUrl("requesty", uriScheme)}`
}

export function getZgsmAuthUrl(stateId: string, uriScheme?: string) {
	const { loginUrl, clientId, redirectUri } = getAuthConfig();
	const scopes = ['openid', 'profile', 'email'];
	
	const searchParams = new URLSearchParams([
		['response_type', 'code'],
		['client_id', clientId],
		['redirect_uri', redirectUri],
		['state', stateId],
		['scope', scopes.join(' ')]
	]);

	return `${loginUrl}?${searchParams.toString()}`;
}
