/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Copyright (c) 2024 - Sangfor LTD.
 *
 * All rights reserved. Code licensed under the MIT license
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 */
import OpenAI from "openai"
import { defaultZgsmAuthConfig } from "../../../src/zgsmAuth/config"
import { Logger } from "../common/log-util"
import { workspace } from "vscode"
import { AxiosError } from "axios"
import { createAuthenticatedHeaders } from "../common/api"
import {
	configCompletion,
	settings,
	OPENAI_CLIENT_NOT_INITIALIZED,
	NOT_PROVIDERED,
	ZGSM_API_KEY,
	ZGSM_BASE_URL,
	ZGSM_COMPLETION_URL,
} from "../common/constant"
import { CompletionPoint } from "./completionPoint"
import { CompletionScores } from "./completionScore"
import { CompletionTrace } from "./completionTrace"
import { Completion } from "openai/resources/completions"
import { ClineProvider } from "../../../src/core/webview/ClineProvider"
/**
 * Completion client, which handles the details of communicating with the large model API and shields the communication details from the caller.
 * The caller can handle network communication as conveniently as calling a local function.
 */

export class CompletionClient {
	private static client?: CompletionClient
	private static providerRef: WeakRef<ClineProvider>
	private openai?: OpenAI
	private stopWords: string[] = []
	private reqs: Map<string, any> = new Map<string, any>()
	private betaMode?: any

	private async getApiConfig(hasView: boolean, apiConfiguration: any) {
		if (hasView) {
			return {
				baseUrl:
					apiConfiguration.zgsmBaseUrl ||
					apiConfiguration.zgsmDefaultBaseUrl ||
					defaultZgsmAuthConfig.baseUrl,
				completionUrl: apiConfiguration.zgsmCompletionUrl || defaultZgsmAuthConfig.completionUrl,
				apiKey: apiConfiguration.zgsmApiKey || NOT_PROVIDERED,
			}
		}

		const context = CompletionClient.providerRef.deref()?.contextProxy

		const contextApiKey = await context?.getOriginSecrets(ZGSM_API_KEY)
		const contextBaseUrl = await context?.getGlobalState(ZGSM_BASE_URL)
		const contextCompletionUrl = await context?.getGlobalState(ZGSM_COMPLETION_URL)

		return {
			baseUrl: contextBaseUrl || defaultZgsmAuthConfig.baseUrl,
			completionUrl: contextCompletionUrl || defaultZgsmAuthConfig.completionUrl,
			apiKey: contextApiKey || NOT_PROVIDERED,
		}
	}

	public static async setProvider(provider: ClineProvider) {
		CompletionClient.providerRef = new WeakRef(provider)

		await provider?.setValue?.("isZgsmApiKeyValid", true)
		provider?.postMessageToWebview?.({ type: "state", state: await provider?.getStateToPostToWebview?.() })
	}

	public static getProvider() {
		return CompletionClient.providerRef.deref()
	}

	/**
	 * Send a request to the LLM to obtain the code completion result at the completion point cp.
	 */
	public static async callApi(cp: CompletionPoint, scores: CompletionScores): Promise<string> {
		const client = await this.getInstance()
		if (!client) {
			const provider = CompletionClient.providerRef.deref()

			await provider?.setValue?.("isZgsmApiKeyValid", false)
			provider?.postMessageToWebview?.({ type: "state", state: await provider?.getStateToPostToWebview?.() })

			throw new Error(OPENAI_CLIENT_NOT_INITIALIZED)
		}

		try {
			const response = await client.doCallApi(cp, scores)

			Logger.log(`Completion [${cp.id}]: Request succeeded`, response)
			cp.fetched(client.acquireCompletionText(response))
			CompletionTrace.reportApiOk()
			return cp.getContent()
		} catch (err: unknown) {
			if (err instanceof Error && err.name === "AbortError") {
				Logger.log(`Completion [${cp.id}]: Request cancelled`, err)
				cp.cancel()
				CompletionTrace.reportApiCancel()
			} else {
				Logger.error(`Completion [${cp.id}]: Request failed`, err)
				this.client = undefined // reset client
				const statusCode = (err as AxiosError)?.response?.status || 500
				CompletionTrace.reportApiError(`${statusCode}`)
				// token error upate isZgsmApiKeyValid status
				if ((err as AxiosError).status === 401) {
					const provider = CompletionClient.providerRef.deref()

					await provider?.setValue?.("isZgsmApiKeyValid", false)
					provider?.postMessageToWebview?.({
						type: "state",
						state: await provider?.getStateToPostToWebview?.(),
					})
				}
			}
			throw err
		} finally {
			if (client) {
				client.reqs.delete(cp.id)
			}
		}
	}

	/**
	 * Cancel the incomplete request initiated by the completion point cp.
	 */
	public static async cancelApi(cp: CompletionPoint) {
		const client = await this.getInstance()
		if (!client) {
			return
		}
		const value = client.reqs.get(cp.id)
		if (value) {
			Logger.log(`Request [id=${cp.id}] cancelled`)
			value.cancel(`Request [id=${cp.id}] cancelled`)
			client.reqs.delete(cp.id)
		}
	}

	/**
	 * Create an OpenAI client for calling the LLM API.
	 */
	private async createClient(force: boolean): Promise<boolean> {
		if (this.openai && !force) {
			return true
		}
		const provider = CompletionClient.providerRef.deref()

		const { apiConfiguration } = await provider!.getState()

		const hasView = !!provider?.hasView

		if (!apiConfiguration?.zgsmApiKey && hasView) {
			Logger.error("Failed to get login information. Please log in again to use the completion service")
			return false
		}

		const config = await this.getApiConfig(hasView, apiConfiguration)
		const fullUrl = `${config.baseUrl}${config.completionUrl}`

		if (config.apiKey === NOT_PROVIDERED) {
			return false
		}

		this.openai = new OpenAI({
			baseURL: fullUrl,
			apiKey: config.apiKey,
		})
		if (!this.openai) {
			// Logger.error("Completion: Configuration error: configuration:", configuration, "openai: ", this.openai);
			return false
		}

		this.stopWords = workspace.getConfiguration(configCompletion).get("inlineCompletion") ? ["\n", "\r"] : []
		this.betaMode = workspace.getConfiguration(configCompletion).get("betaMode")
		Logger.info(
			`Completion: Create OpenAIApi client, URL: ${fullUrl}, betaMode: ${this.betaMode}, stopWords: ${this.stopWords}`,
		)
		return true
	}

	/**
	 * The client uses a single instance.
	 */
	private static async getInstance(): Promise<CompletionClient | undefined> {
		if (!this.client) {
			this.client = new CompletionClient()
			if (!(await this.client.createClient(true))) {
				this.client = undefined
			}
		}
		return this.client
	}

	/**
	 * Obtain the completion content from the result returned by the LLM.
	 */
	private acquireCompletionText(resp: Completion): string {
		if (!resp || !resp.choices || resp.choices.length === 0) {
			return ""
		}

		let text = ""
		for (const choice of resp.choices) {
			if (choice.text) {
				text = choice.text.trim()
				if (text.length > 0) {
					break
				}
			}
		}
		if (!text) {
			return ""
		}
		// Since Chinese characters occupy 3 bytes, the plugin may be affected by Max Tokens. When the result is returned, only half of the last Chinese character is returned, resulting in garbled characters.
		// The garbled characters need to be replaced with ''.
		if (text.includes("�")) {
			text = text.replace(/�/g, "")
		}
		return text
	}

	/**
	 * Initiate a request for code completion.
	 */
	private async doCallApi(cp: CompletionPoint, scores: CompletionScores): Promise<Completion> {
		if (!this.openai) {
			throw new Error(OPENAI_CLIENT_NOT_INITIALIZED)
		}
		const provider = CompletionClient.providerRef.deref()

		const { apiConfiguration } = await provider!.getState()

		// cleanup Old Requests
		const currentId = cp.id
		for (const [key, controller] of this.reqs) {
			if (key !== currentId) {
				Logger.log(`Completion: Request cancelled id: ${key}`)
				controller.abort()
				this.reqs.delete(key)
			}
		}

		const abortController = new AbortController()
		this.reqs.set(cp.id, abortController)

		Logger.log(`Completion [${cp.id}]: Sending API request`)
		const headers = createAuthenticatedHeaders()
		const repo = workspace?.name?.split(" ")[0] ?? ""

		const config = await this.getApiConfig(!!provider?.hasView, apiConfiguration)

		this.openai.baseURL = `${config.baseUrl}${config.completionUrl}`
		this.openai.apiKey = config.apiKey

		return this.openai.completions.create(
			{
				// no use
				model: settings.openai_model,
				temperature: settings.temperature,
				stop: this.stopWords,
				prompt: null,
			},
			{
				// in use
				headers: headers,
				signal: abortController.signal,
				body: {
					model: settings.openai_model,
					temperature: settings.temperature,
					stop: this.stopWords,
					prompt_options: cp.getPrompt(),
					completion_id: cp.id,
					language_id: cp.doc.language,
					beta_mode: this.betaMode,
					calculate_hide_score: scores,
					file_project_path: "",
					project_path: "",
					code_path: "",
					user_id: "",
					repo: repo,
					git_path: "",
				},
			},
		)
	}
}
