/**
 * Copyright (c) 2024 - Sangfor LTD.
 *
 * All rights reserved. Code licensed under the MIT license
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 */
import { Logger } from "../common/log-util"
import { createAuthenticatedHeaders } from "../common/api"
import { CompletionPoint } from "./completionPoint"
import { getAcceptionString, getCorrectionString } from "./completionDataInterface"
import { CompletionCache } from "./completionCache"
// import { writeLogsSync } from "../common/vscode-util"
import * as vscode from "vscode"
import { ClineProvider } from "../../../src/core/webview/ClineProvider"
import { defaultZgsmAuthConfig } from "../../../src/zgsmAuth/config"

/**
 * Completion metrics memo
 */
interface CompletionMemo {
	openapi_total: number // Total number of openapi calls
	openapi_error: number // Number of openapi errors
	openapi_cancel: number // Number of openapi calls canceled
	memo_ok: number // Number of successful remote memos
	memo_failed: number // Number of failed remote memos
	upload_ok: number // Number of successful upload calls
	upload_failed: number // Number of failed upload calls

	status: Map<string, number>
}
/**
 * Tracks and reports the execution traces of completion behavior
 */
export class CompletionTrace {
	private axios = require("axios") // AJAX communication
	private static client: CompletionTrace | undefined = undefined // Trace data reporting client (singleton)
	private context: vscode.ExtensionContext
	private provider?: ClineProvider
	private errors = new Map<string, number>() // Error counts for each status
	private openApiTotal: number = 0 // Total number of openapi calls
	private openApiCancel: number = 0 // Number of openapi calls canceled
	private openApiError: number = 0 // Number of openapi errors
	private memoOk: number = 0 // Number of successful completion point information uploads
	private memoFailed: number = 0 // Number of failed completion point information uploads
	private uploadOk: number = 0 // Number of successful upload API calls
	private uploadFailed: number = 0 // Number of failed upload API calls
	private lastUploadError: number = 0 // Total error count (openApiError) at the last successful upload

	constructor(context: vscode.ExtensionContext) {
		this.context = context
	}

	public static init(context: vscode.ExtensionContext, provider: ClineProvider) {
		const client = this.getInstance(context)
		client?.setProvider(provider)
		const memo: CompletionMemo | undefined = client.context.globalState.get("trace")
		if (!memo) {
			return
		}
		client.openApiTotal = memo.openapi_total
		client.openApiError = memo.openapi_error
		client.openApiCancel = memo.openapi_cancel
		client.uploadOk = memo.upload_ok
		client.uploadFailed = memo.upload_failed
		client.memoOk = memo.memo_ok
		client.memoFailed = memo.memo_failed
	}
	/**
	 * Report that the completion API executed successfully
	 */
	public static reportApiOk() {
		const client = this.getInstance()
		client.openApiTotal++
	}
	/**
	 * Report that the completion API was canceled
	 */
	public static reportApiCancel() {
		const client = this.getInstance()
		client.openApiCancel++
		client.openApiTotal++
	}
	/**
	 * Report an error in the completion API
	 */
	public static reportApiError(status: string): number {
		const client = this.getInstance()
		client.openApiError++
		client.openApiTotal++
		let cnt = client.errors.get(status)
		if (!cnt) {
			cnt = 1
		} else {
			cnt++
		}
		client.errors.set(status, cnt)
		return cnt
	}
	/**
	 * Upload and clear a batch of completion point data
	 */
	public static async uploadPoints(): Promise<number> {
		const client = this.getInstance()
		const baseUrl = await client.getBaseUrl()
		const url = `${baseUrl}/api/feedbacks/completions`
		const datas = this.constructDatas()
		if (datas.count === 0) {
			return 0
		}
		if (datas.count > 1) {
			CompletionCache.erase(datas.count)
		}
		// writeLogsSync("completions.log", JSON.stringify(datas));
		await client
			.postDatas(url, datas)
			.then(() => {
				client.memoOk += datas.count
				client.uploadOk++
			})
			.catch(() => {
				client.memoFailed += datas.count
				client.uploadFailed++
			})
		return datas.count
	}

	/**
	 * Upload accumulated errors
	 */
	public static async uploadMemo() {
		const client = this.getInstance()
		const data: CompletionMemo = {
			openapi_total: client.openApiTotal,
			openapi_cancel: client.openApiCancel,
			openapi_error: client.openApiError,
			memo_ok: client.memoOk,
			memo_failed: client.memoFailed,
			upload_ok: client.uploadOk,
			upload_failed: client.uploadFailed,
			status: client.errors,
		}
		client.context.globalState.update("trace", data)
		if (client.openApiError == client.lastUploadError) {
			return
		}
		const baseUrl = await client.getBaseUrl()
		const url = `${baseUrl}/api/feedbacks/error`
		await client
			.postDatas(url, data)
			.then(() => {
				client.lastUploadError = client.openApiError
				client.uploadOk++
			})
			.catch(() => {
				client.uploadFailed++
			})
	}
	/**
	 * Set the timer for periodic upload of CompletionTrace logs
	 */
	private static getInstance(context: vscode.ExtensionContext | undefined = undefined): CompletionTrace {
		if (!this.client) {
			if (!context) {
				throw Error("CompletionTrace.init must be called first")
			}
			this.client = new CompletionTrace(context)
		}
		return this.client
	}
	/**
	 * Construct data for reporting based on completion point information
	 */
	private static constructData(cp: CompletionPoint) {
		return {
			id: cp.id,
			language: cp.doc.language,
			acception: getAcceptionString(cp.getAcception()),
			correction: getCorrectionString(cp.getCorrection()),
			actual_code: cp.getActualCode(),
			create_time: cp.createTime,
			start_time: cp.getStartTime(),
			end_time: cp.getEndTime(),
			handle_time: cp.getHandleTime(),
			expend_time: cp.getEndTime() - cp.createTime,
		}
	}
	/**
	 * Build data for reporting completed completion points
	 */
	private static constructDatas() {
		const datas = []
		const all = CompletionCache.all()
		let n = 0
		for (n = 0; n < all.length - 1; n++) {
			const cp = all[n]
			if (!cp.isFinished()) {
				break
			}
			datas.push(this.constructData(cp))
		}
		return {
			count: datas.length,
			data: datas,
		}
	}
	/**
	 * Upload completion logs
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private async postDatas(url: string, data: any): Promise<string> {
		return (
			this.axios
				.post(url, data, {
					headers: createAuthenticatedHeaders(),
				})
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				.then(function (response: { data: any }) {
					response = response.data
					Logger.debug(`Completion: post(${url}) succeeded`, data)
					return Promise.resolve(response.data)
				})
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				.catch(function (error: any) {
					Logger.debug(`Completion: post(${url}) failed`, data)
					return Promise.reject(error)
				})
		)
	}

	private async getBaseUrl() {
		const state = await this.provider?.getState()
		return (
			state?.apiConfiguration?.zgsmBaseUrl ||
			state?.apiConfiguration?.zgsmDefaultBaseUrl ||
			defaultZgsmAuthConfig.baseUrl
		)
	}

	private setProvider(provider: ClineProvider) {
		this.provider = provider
	}
}
