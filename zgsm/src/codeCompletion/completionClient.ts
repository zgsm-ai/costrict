/**
 * Copyright (c) 2024 - Sangfor LTD.
 *
 * All rights reserved. Code licensed under the MIT license
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 */
import OpenAI from 'openai';
import { envClient, envSetting } from "../common/env";
import { Logger } from "../common/log-util";
import { window, workspace } from 'vscode';
import { AxiosResponse } from "axios";
import { createAuthenticatedHeaders } from "../common/api";
import { configCompletion, settings } from "../common/constant";
import { CompletionPoint } from './completionPoint';
import { CompletionScores } from './completionScore';
import { CompletionTrace } from './completionTrace';

/**
 * Completion client, which handles the details of communicating with the large model API and shields the communication details from the caller.
 * The caller can handle network communication as conveniently as calling a local function.
 */
export class CompletionClient {
    private static client: CompletionClient|undefined = undefined;
    private openai: OpenAI | undefined;
    private stopWords: string[] = [];
    private reqs: Map<string, any> = new Map<string, any>();
    private betaMode: any = undefined;

    /**
     * Send a request to the LLM to obtain the code completion result at the completion point cp.
     */
    public static async callApi(cp: CompletionPoint, scores: CompletionScores): Promise<string> {
        const client = this.getInstance();
        if (!client) {
            return Promise.reject(new Error('Configuration error'));
        }
        return client.doCallApi(cp, scores).then(response => {
            Logger.log(`Completion [${cp.id}]: Request succeeded`, response);
            cp.fetched(client.acquireCompletionText(response.data))
            CompletionTrace.reportApiOk();
            return Promise.resolve(cp.getContent());
        }).catch(err => {
            if (client.openai.axios.isCancel(err)) {
                Logger.log(`Completion [${cp.id}]: Request cancelled`, err)
                cp.cancel();
                CompletionTrace.reportApiCancel();
            } else {
                Logger.error(`Completion [${cp.id}]: Request failed`, err);
                this.client = undefined;
                CompletionTrace.reportApiError(err.status);
            }
            return Promise.reject(err);
        }).finally(() => {
            client.reqs.delete(cp.id);
        });
    }

    /**
     * Cancel the incomplete request initiated by the completion point cp.
     */
    public static cancelApi(cp: CompletionPoint) {
        const client = this.getInstance();
        if (!client) {
            return;
        }
        let value = client.reqs.get(cp.id);
        if (value) {
            Logger.log(`Request [id=${cp.id}] cancelled`);
            value.cancel(`Request [id=${cp.id}] cancelled`);
            client.reqs.delete(cp.id);
        }
    }

    /**
     * Create an OpenAI client for calling the LLM API.
     */
    private createClient(force: boolean): boolean {
        if (this.openai && !force)
            return true;
        if (!envClient.apiKey) {
            Logger.error('Failed to get login information. Please log in again to use the completion service', envClient);
            window.showErrorMessage('Failed to get login information. Please log in again to use the completion service');
            return false;
        }
        this.openai = new OpenAI({
            baseURL: envSetting.completionUrl,
            apiKey: envClient.apiKey
        });
        if (!this.openai) {
            Logger.error("Completion: Configuration error: configuration:", configuration, "openai: ", this.openai);
            return false;
        }

        this.stopWords = workspace.getConfiguration(configCompletion).get("inlineCompletion") ? ["\n", "\r"] : [];
        this.betaMode = workspace.getConfiguration(configCompletion).get("betaMode");
        Logger.info(`Completion: Create OpenAIApi client, URL: ${envSetting.completionUrl}, betaMode: ${this.betaMode}, stopWords: ${this.stopWords}`)
        return true;
    }

    /**
     * The client uses a single instance.
     */
    private static getInstance(): CompletionClient|undefined {
        if (!this.client) {
            this.client = new CompletionClient();
            if (!this.client.createClient(true)) {
                this.client = undefined;
            }
        }
        return this.client;
    }

    /**
     * Obtain the completion content from the result returned by the LLM.
     */
    private acquireCompletionText(resp: CreateCompletionResponse): string {
        if (!resp || !resp.choices || resp.choices.length === 0) {
            return "";
        }

        let text = "";
        for (const choice of resp.choices) {
            if (choice.text) {
                text = choice.text.trim();
                if (text.length > 0) {
                    break;
                }
            }
        }
        if (!text) {
            return "";
        }
        // Since Chinese characters occupy 3 bytes, the plugin may be affected by Max Tokens. When the result is returned, only half of the last Chinese character is returned, resulting in garbled characters.
        // The garbled characters need to be replaced with ''.
        if (text.includes('�')) {
            text = text.replace(/�/g, '');
        }
        return text;
    }

    /**
     * Initiate a request for code completion.
     */
    private async doCallApi(cp: CompletionPoint,
        scores: CompletionScores
    ): Promise<AxiosResponse<CreateCompletionResponse, any>> {
        // Traverse all requests. If there is a new one, cancel the old request.
        for (const [key, value] of this.reqs) {
            Logger.log(`Completion: Request cancelled id: ${key}`);
            value.cancel(`Request cancelled id: ${key}`);
        }
        Logger.log(`Completion [${cp.id}]: Send API request`);
        // Get the cancellation object of the current Axios request.
        const cancelTokenSource = this.openai.axios.CancelToken.source();
        this.reqs.set(cp.id, cancelTokenSource);
        const headers = createAuthenticatedHeaders();
        const repo = workspace?.name?.split(' ')[0] ?? '';
        return this.openai.createCompletion({
            headers: headers,
            model: settings.openai_model,
            /* eslint-disable-next-line @typescript-eslint/naming-convention */
            temperature: settings.temperature,
            stop: this.stopWords,
            completion_id: cp.id,
            // prompt: promptOptions.prefix + FIM_INDICATOR + promptOptions.suffix,
            prompt_options: cp.getPrompt(),
            language_id: cp.doc.language,
            beta_mode: this.betaMode,
            calculate_hide_score: scores,
            file_project_path: "",
            project_path: "",
            code_path: "",
            user_id: '',
            repo: repo,
            git_path: ''
        }, { cancelToken: cancelTokenSource.token });
    }
}
