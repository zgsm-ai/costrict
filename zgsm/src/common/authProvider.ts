/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Copyright (c) 2024 - Sangfor LTD.
 *
 * All rights reserved. Code licensed under the MIT license
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 */
import axios from "axios"
import {
	authentication,
	AuthenticationProvider,
	AuthenticationProviderAuthenticationSessionsChangeEvent,
	AuthenticationSession,
	Disposable,
	env,
	Event,
	EventEmitter,
	ExtensionContext,
	ProgressLocation,
	Uri,
	UriHandler,
	window,
} from "vscode"
import { ACCESS_TOKEN_KEY, AUTH_NAME, AUTH_TYPE, SESSIONS_SECRET_KEY } from "./constant"
import { Logger } from "./log-util"
import { getRandomId } from "./util"
import { ChatViewProvider } from "../chatView/chat-view-provider"
import { envSetting, envClient, updateApiKey } from "./env"
import { t } from "../../../src/i18n"

/**
 * Build request headers (without authentication information)
 */
function createHeaders(dict: Record<string, any> = {}): Record<string, any> {
	const headers = {
		ide: envClient.ide,
		"ide-version": envClient.extVersion,
		"ide-real-version": envClient.ideVersion,
		"host-ip": envClient.hostIp,
		...dict,
	}
	return headers
}

interface PromiseAdapter<T, U> {
	(value: T, resolve: (value: U | PromiseLike<U>) => void, reject: (reason: any) => void): any
}

const passthrough = (value: any, resolve: (value?: any) => void) => resolve(value)

/**
 * Return a promise that resolves with the next emitted event, or with some future
 * event as decided by an adapter.
 *
 * If specified, the adapter is a function that will be called with
 * `(event, resolve, reject)`. It will be called once per event until it resolves or
 * rejects.
 *
 * The default adapter is the passthrough function `(value, resolve) => resolve(value)`.
 *
 * @param event the event
 * @param adapter controls resolution of the returned promise
 * @returns a promise that resolves or rejects as specified by the adapter
 */
function promiseFromEvent<T, U>(
	event: Event<T>,
	adapter: PromiseAdapter<T, U> = passthrough,
): { promise: Promise<U>; cancel: EventEmitter<void> } {
	let subscription: Disposable
	const cancel = new EventEmitter<void>()
	const promise = new Promise<U>((resolve, reject) => {
		cancel.event((_) => reject("Cancelled"))
		subscription = event((value: T) => {
			try {
				Promise.resolve(adapter(value, resolve, reject)).catch(reject)
			} catch (error) {
				reject(error)
			}
		})
	}).then(
		(result: U) => {
			subscription.dispose()
			return result
		},
		(error) => {
			subscription.dispose()
			throw error
		},
	)
	return {
		promise,
		cancel,
	}
}

class UriEventHandler extends EventEmitter<Uri> implements UriHandler {
	public handleUri(uri: Uri) {
		this.fire(uri)
	}
}

/**
 * Use the OAUTH protocol for user authentication with the backend
 */
export default class Auth0AuthenticationProvider implements AuthenticationProvider, Disposable {
	private static instance: Auth0AuthenticationProvider
	private _sessionChangeEmitter = new EventEmitter<AuthenticationProviderAuthenticationSessionsChangeEvent>()
	private _disposable: Disposable
	private _pendingStates: string[] = []
	private _codeExchangePromises = new Map<string, { promise: Promise<string>; cancel: EventEmitter<void> }>()
	private _uriHandler = new UriEventHandler()

	constructor(private readonly context: ExtensionContext) {
		this._disposable = Disposable.from(
			authentication.registerAuthenticationProvider(AUTH_TYPE, AUTH_NAME, this, {
				supportsMultipleAccounts: false,
			}),
			// window.registerUriHandler(this._uriHandler)
		)
	}

	// Singleton to ensure a globally unique instance. Use this function to get the instance elsewhere.
	public static getInstance(context?: ExtensionContext): Auth0AuthenticationProvider {
		if (!Auth0AuthenticationProvider.instance) {
			if (!context) {
				Logger.log("Plugin exception, Auth0AuthenticationProvider instance is abnormally lost")
				throw new Error("Plugin exception, Auth0AuthenticationProvider instance is abnormally lost")
			}
			Auth0AuthenticationProvider.instance = new Auth0AuthenticationProvider(context)
		}
		return Auth0AuthenticationProvider.instance
	}

	get onDidChangeSessions() {
		return this._sessionChangeEmitter.event
	}

	/**
	 * Get existing sessions
	 * @param scopes
	 * @returns
	 */
	public async getSessions(): Promise<AuthenticationSession[]> {
		const allSessions = await this.context.secrets.get(SESSIONS_SECRET_KEY)

		if (allSessions) {
			return JSON.parse(allSessions) as AuthenticationSession[]
		}

		return []
	}

	/**
	 * Create a new auth session
	 * @param scopes
	 * @returns
	 */
	public async createSession(): Promise<AuthenticationSession> {
		try {
			const token = await this.login()
			if (!token) {
				throw new Error(`Auth0 login failure`)
			}
			const session: AuthenticationSession = {
				id: getRandomId(12),
				accessToken: token,
				account: {
					label: "",
					id: "",
				},
				scopes: [],
			}

			await this.context.secrets.store(SESSIONS_SECRET_KEY, JSON.stringify([session]))
			this._sessionChangeEmitter.fire({ added: [session], removed: [], changed: [] })
			return session
		} catch (e) {
			window.showErrorMessage(t("window.error.sign_in_failed") + e)
			throw e
		}
	}

	/**
	 * Remove an existing session
	 * @param sessionId
	 */
	public async removeSession(sessionId: string): Promise<void> {
		const allSessions = await this.context.secrets.get(SESSIONS_SECRET_KEY)
		if (!allSessions) {
			return
		}
		const sessions = JSON.parse(allSessions) as AuthenticationSession[]
		const sessionIdx = sessions.findIndex((s) => s.id === sessionId)
		const session = sessions[sessionIdx]
		sessions.splice(sessionIdx, 1)
		await this.context.secrets.store(SESSIONS_SECRET_KEY, JSON.stringify(sessions))
		if (session) {
			this._sessionChangeEmitter.fire({ added: [], removed: [session], changed: [] })
		}
	}

	/**
	 * Dispose the registered services
	 */
	public async dispose() {
		this._disposable.dispose()
	}

	/**
	 * Save access_token related information
	 */
	private async storeToken(token: any) {
		if (token.access_token !== undefined) {
			updateApiKey(token.access_token)
		} else {
			updateApiKey("")
		}
		await this.context.secrets.store(ACCESS_TOKEN_KEY, JSON.stringify(token))
	}

	/**
	 * Log in to Auth0
	 */
	public async login() {
		return await window.withProgress<string>(
			{
				location: ProgressLocation.Notification,
				title: "Please login to use Zhuge Shenma",
				cancellable: true,
			},
			async (_, token) => {
				const stateId = getRandomId(12)

				this._pendingStates.push(stateId)
				const scopes: string[] = []
				const scopeString = scopes.join(" ")

				if (!scopes.includes("openid")) {
					scopes.push("openid")
				}
				if (!scopes.includes("profile")) {
					scopes.push("profile")
				}
				if (!scopes.includes("email")) {
					scopes.push("email")
				}

				const searchParams = new URLSearchParams([
					["response_type", "code"],
					["client_id", envSetting.clientId],
					["redirect_uri", envSetting.redirectUri],
					["state", stateId],
					["scope", scopes.join(" ")],
				])
				const uri = Uri.parse(`${envSetting.loginUrl}?${searchParams.toString()}`)
				await env.openExternal(uri)

				let codeExchangePromise = this._codeExchangePromises.get(scopeString)
				if (!codeExchangePromise) {
					codeExchangePromise = promiseFromEvent(this._uriHandler.event, this.handleUri(scopes))
					this._codeExchangePromises.set(scopeString, codeExchangePromise)
				}

				try {
					return await Promise.race([
						codeExchangePromise.promise,
						new Promise<string>((_, reject) => setTimeout(() => reject("Cancelled"), 300000)),
						promiseFromEvent<any, any>(token.onCancellationRequested, (_, __, reject) => {
							reject("User Cancelled")
						}).promise,
					])
				} finally {
					this._pendingStates = this._pendingStates.filter((n) => n !== stateId)
					codeExchangePromise?.cancel.fire()
					this._codeExchangePromises.delete(scopeString)
				}
			},
		)
	}

	/**
	 * Log out
	 */
	public async logout() {
		try {
			const session = await this.context.secrets.get(ACCESS_TOKEN_KEY)
			if (!session) {
				window.showInformationMessage(t("window.error.please_log_in_first"))
				return
			}
			const tokenData = JSON.parse(session)
			if (!tokenData || !tokenData.refresh_token) {
				window.showInformationMessage(t("window.error.please_log_in_first"))
				return
			}
			const res = await axios.post(
				envSetting.logoutUrl,
				{
					refresh_token: tokenData.refresh_token,
					client_id: envSetting.clientId,
					client_secret: envSetting.clientSecret,
				},
				{
					headers: createHeaders({
						"Content-Type": "application/x-www-form-urlencoded",
					}),
				},
			)
			Logger.log("logout", res.headers, res.data)
			await this.context.secrets.store(ACCESS_TOKEN_KEY, "{}")
		} catch (err) {
			Logger.log("Logout failed:", err)
		}
	}

	/**
	 * Get access_token
	 */
	public async fetchToken(params: any) {
		try {
			const res = await axios.post(envSetting.tokenUrl, params, {
				headers: createHeaders({
					"Content-Type": "application/x-www-form-urlencoded",
				}),
			})
			Logger.log("fetchToken ok:", params, res)
			return {
				status: 200,
				data: res.data,
			}
		} catch (err) {
			if (axios.isAxiosError(err)) {
				Logger.error("fetchToken: Axios error:", err.message)
				if (err.response) {
					// Request was made and the server responded with a status code
					Logger.error("Response headers:", err.response.headers)
					switch (err.response?.status) {
						case 400:
							Logger.error("Bad Request(400):", err.response.data)
							break
						case 401:
							Logger.error("Unauthorized(401):", err.response.data)
							break
						case 404:
							Logger.error("Not Found(404):", err.response.data)
							break
						case 500:
							Logger.error("Server Error(500):", err.response.data)
							break
						default:
							Logger.error("Unexpected error, status:", err.response.status, err.response.data)
							break
					}
					return {
						status: err.response.status,
					}
				} else if (err.request) {
					// Request was made but no response was received
					Logger.error("Request data:", err.request)
					return {
						status: 504,
					}
				} else {
					// Other errors
					Logger.error("Error message:", err.message)
					return {
						status: 408,
					}
				}
			} else {
				// Handle other types of errors
				Logger.error("fetchToken: Unexpected error:", err)
				return {
					status: 408,
				}
			}
		}
	}

	/**
	 * Handle the redirect to VS Code (after sign in from Auth0)
	 * @param scopes
	 * @returns
	 */
	private handleUri: (scopes: readonly string[]) => PromiseAdapter<Uri, string> =
		(scopes) => async (uri, resolve, reject) => {
			const query = new URLSearchParams(uri.query)
			const state = query.get("state")
			if (!state) {
				reject(new Error("No state"))
				return
			}

			// Check if it is a valid auth request started by the extension
			if (!this._pendingStates.some((n) => n === state)) {
				reject(new Error("State not found"))
				return
			} else {
				const code = query.get("code")
				if (!code) {
					reject(new Error("No token"))
					return
				} else {
					const params = {
						client_id: envSetting.clientId,
						client_secret: envSetting.clientSecret,
						code: code,
						grant_type: "authorization_code",
						redirect_uri: envSetting.redirectUri,
					}
					const res = await this.fetchToken(params)
					if (res.status == 200 && res.data && res.data.access_token) {
						this.storeToken(res.data)
						resolve(res.data.access_token)
						this.createRefreshTokenListener(res.data)
					} else {
						this.storeToken({})
						resolve("")
						window.showErrorMessage(t("window.error.login_failed"))
					}
				}
			}
		}

	// After obtaining a new access_token, set a timer to refresh the token 5 minutes before the expires_in time
	private async createRefreshTokenListener(tokenData: any) {
		const expires_time = tokenData.expires_in * 1000 - 5 * 60 * 1000
		setTimeout(async () => {
			this.refreshToken(tokenData)
		}, expires_time)
	}

	/**
	 * Update the access_token data saved in secrets. Return the refreshed access_token on success, or null on failure
	 */
	private async refreshToken(tokenData: any) {
		const params = {
			client_id: envSetting.clientId,
			client_secret: envSetting.clientSecret,
			grant_type: "refresh_token",
			refresh_token: tokenData.refresh_token,
		}
		const res = await this.fetchToken(params)
		if (res.status == 400 || res.status == 401) {
			this.storeToken({})
			ChatViewProvider.getInstance().sendMessage({
				action: "ide.logout",
			})
			window.showErrorMessage(t("window.error.login_expired"))
			return null
		} else if (res.status == 200) {
			const data = res.data
			const access_token = data.access_token
			if (access_token) {
				const newAccessToken = Object.assign(tokenData, data)
				this.storeToken(tokenData)
				this.createRefreshTokenListener(newAccessToken)
				return access_token
			}
		}
		// Temporary login failure, retry after 30 seconds
		setTimeout(async () => {
			this.refreshToken(tokenData)
		}, 30000)
		return null
	}

	/**
	 * Check if the access_token is still valid
	 * If it has expired, initiate a request to update the access_token using the refresh_token
	 */
	public async checkToken() {
		const session = await this.context.secrets.get(ACCESS_TOKEN_KEY)
		if (session) {
			const tokenData = JSON.parse(session)
			if (tokenData && tokenData.refresh_token) {
				return this.refreshToken(tokenData)
			}
		}
		return null
	}

	/**
	 * Get the access_token saved in secure storage
	 */
	public async getAccessToken() {
		const session = await this.context.secrets.get(ACCESS_TOKEN_KEY)
		if (session) {
			const tokenData = JSON.parse(session)
			if (tokenData && tokenData.access_token) {
				return tokenData.access_token
			}
		}
		return null
	}

	/**
	 * Get the username saved in the token based on the token
	 */
	public static getUsername(token: string) {
		const userInfoBase64 = token.split(".")[1]
		const userInfoStr = Buffer.from(userInfoBase64, "base64").toString("utf-8")
		const userInfo = JSON.parse(userInfoStr || "{}")
		return userInfo.preferred_username || ""
	}
}
