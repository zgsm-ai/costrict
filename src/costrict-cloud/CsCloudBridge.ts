import * as vscode from "vscode"

import { checkCsCloudHealth, readCostrictAuthFile, resolveCsCloudServerUrl } from "./config"
import {
	buildCsCloudUrl,
	type CostrictCloudBridgeRequest,
	type CostrictCloudBridgeResponse,
	type CostrictCloudEvent,
	type CostrictCloudEventStatus,
} from "./types"

export type CostrictCloudStatus = {
	authenticated: boolean
	serverUrl: string | null
	healthy: boolean
}

export class CsCloudBridge {
	constructor(private readonly outputChannel?: vscode.OutputChannel) {}

	async getStatus(): Promise<CostrictCloudStatus> {
		const auth = await readCostrictAuthFile()
		const serverUrl = await resolveCsCloudServerUrl()
		const healthy = serverUrl ? await checkCsCloudHealth(serverUrl) : false
		const status = {
			authenticated: !!auth,
			serverUrl,
			healthy,
		}
		this.log("status", status)
		return status
	}

	async request(request: CostrictCloudBridgeRequest): Promise<CostrictCloudBridgeResponse> {
		const requestId = request.requestId
		try {
			this.log("request.received", request)
			const status = await this.getStatus()
			if (!status.authenticated) {
				const response = {
					requestId,
					type: "costrict-cloud.response",
					ok: false,
					error: "未检测到 ~/.costrict/share/auth.json，请先登录 CoStrict。",
				} satisfies CostrictCloudBridgeResponse
				this.log("request.blocked", { reason: "unauthenticated", requestId, status, response })
				return response
			}
			if (!status.serverUrl) {
				const response = {
					requestId,
					type: "costrict-cloud.response",
					ok: false,
					error: "未检测到 cs-cloud server.url，请先手动执行 cs-cloud start。",
				} satisfies CostrictCloudBridgeResponse
				this.log("request.blocked", { reason: "missing-server-url", requestId, status, response })
				return response
			}
			if (!status.healthy) {
				const response = {
					requestId,
					type: "costrict-cloud.response",
					ok: false,
					error: "cs-cloud 健康检查失败，请确认 cs-cloud start 已成功运行。",
				} satisfies CostrictCloudBridgeResponse
				this.log("request.blocked", { reason: "unhealthy", requestId, status, response })
				return response
			}

			const method = request.method ?? "GET"
			const url = buildCsCloudUrl(status.serverUrl, request.path, request.query)
			const headers: Record<string, string> = {
				Accept: "application/json",
				...request.headers,
			}
			const init: RequestInit = {
				method,
				headers,
				signal: AbortSignal.timeout(request.timeoutMs ?? 30_000),
			}

			if (request.body !== undefined) {
				headers["Content-Type"] = headers["Content-Type"] ?? "application/json"
				init.body = typeof request.body === "string" ? request.body : JSON.stringify(request.body)
			}

			this.log("http.request", {
				requestId,
				method,
				url,
				headers,
				query: request.query,
				body: request.body,
				timeoutMs: request.timeoutMs ?? 30_000,
			})

			const response = await fetch(url, init)
			const data = await readResponseBody(response)
			this.log("http.response", {
				requestId,
				status: response.status,
				statusText: response.statusText,
				ok: response.ok,
				data,
			})

			if (!response.ok) {
				return {
					requestId,
					type: "costrict-cloud.response",
					ok: false,
					status: response.status,
					error: `cs-cloud API 请求失败：${response.status} ${response.statusText}`,
					details: data,
				}
			}

			return {
				requestId,
				type: "costrict-cloud.response",
				ok: true,
				status: response.status,
				data,
			}
		} catch (error) {
			this.log("http.error", {
				requestId,
				error: error instanceof Error ? { message: error.message, stack: error.stack } : String(error),
			})
			return {
				requestId,
				type: "costrict-cloud.response",
				ok: false,
				error: error instanceof Error ? error.message : String(error),
			}
		}
	}

	async streamEvents(
		onEvent: (event: CostrictCloudEvent | CostrictCloudEventStatus) => Promise<void> | void,
		signal: AbortSignal,
	): Promise<void> {
		const status = await this.getStatus()
		if (!status.authenticated || !status.serverUrl || !status.healthy) {
			this.log("sse.blocked", { reason: "not-ready", status })
			await onEvent({
				type: "costrict-cloud.eventStatus",
				status: "error",
				error: "cs-cloud 未就绪，无法启动事件流。",
			})
			return
		}

		this.log("sse.status", { status: "connecting" })
		await onEvent({ type: "costrict-cloud.eventStatus", status: "connecting" })

		try {
			const url = buildCsCloudUrl(status.serverUrl, "/events")
			this.log("sse.connect", {
				url,
				headers: {
					Accept: "text/event-stream, application/json",
				},
			})
			const response = await fetch(url, {
				method: "GET",
				headers: {
					Accept: "text/event-stream, application/json",
				},
				signal,
			})

			this.log("sse.connected", {
				status: response.status,
				statusText: response.statusText,
				ok: response.ok,
			})

			if (!response.ok) {
				await onEvent({
					type: "costrict-cloud.eventStatus",
					status: "error",
					error: `事件流连接失败：${response.status} ${response.statusText}`,
				})
				return
			}

			this.log("sse.status", { status: "connected" })
			await onEvent({ type: "costrict-cloud.eventStatus", status: "connected" })

			const reader = response.body?.getReader()
			if (!reader) {
				this.log("sse.error", { error: "事件流响应没有可读取的 body。" })
				await onEvent({
					type: "costrict-cloud.eventStatus",
					status: "error",
					error: "事件流响应没有可读取的 body。",
				})
				return
			}

			const decoder = new TextDecoder()
			let buffer = ""

			while (!signal.aborted) {
				const { done, value } = await reader.read()
				if (done) {
					this.log("sse.read.complete", { done })
					break
				}
				const decodedChunk = decoder.decode(value, { stream: true })
				this.log("sse.raw", decodedChunk)
				buffer += decodedChunk
				let boundary = buffer.indexOf("\n\n")
				while (boundary !== -1) {
					const chunk = buffer.slice(0, boundary)
					buffer = buffer.slice(boundary + 2)
					const parsed = parseSseChunk(chunk)
					if (parsed) {
						this.log("sse.event", parsed)
						await onEvent(parsed)
					}
					boundary = buffer.indexOf("\n\n")
				}
			}

			this.log("sse.status", { status: "disconnected" })
			await onEvent({ type: "costrict-cloud.eventStatus", status: "disconnected" })
		} catch (error) {
			if (signal.aborted) {
				this.log("sse.aborted", { reason: "abort-signal" })
				await onEvent({ type: "costrict-cloud.eventStatus", status: "disconnected" })
				return
			}
			this.log("sse.error", {
				error: error instanceof Error ? { message: error.message, stack: error.stack } : String(error),
			})
			await onEvent({
				type: "costrict-cloud.eventStatus",
				status: "error",
				error: error instanceof Error ? error.message : String(error),
			})
		}
	}

	private log(tag: string, payload: unknown): void {
		this.outputChannel?.appendLine(`[costrict-cloud][bridge][${tag}] ${this.safeStringify(payload)}`)
	}

	private safeStringify(value: unknown): string {
		if (typeof value === "string") {
			return value
		}
		try {
			return JSON.stringify(value, null, 2)
		} catch (error) {
			return `[unserializable: ${error instanceof Error ? error.message : String(error)}]`
		}
	}
}

function parseSseChunk(chunk: string): CostrictCloudEvent | null {
	const lines = chunk.split(/\r?\n/)
	let eventName = "message"

	const dataLines: string[] = []
	for (const line of lines) {
		if (!line || line.startsWith(":")) {
			continue
		}
		if (line.startsWith("event:")) {
			eventName = line.slice(6).trim() || "message"
			continue
		}
		if (line.startsWith("data:")) {
			dataLines.push(line.slice(5).trim())
		}
	}
	if (dataLines.length === 0) {
		return null
	}
	const rawData = dataLines.join("\n")
	return {
		type: "costrict-cloud.event",
		event: eventName,
		data: tryParseJson(rawData),
	}
}

function tryParseJson(value: string): unknown {
	try {
		return JSON.parse(value)
	} catch {
		return value
	}
}

async function readResponseBody(response: Response): Promise<unknown> {
	const text = await response.text()
	if (!text) {
		return null
	}
	const contentType = response.headers.get("content-type") ?? ""
	if (contentType.includes("application/json")) {
		try {
			return JSON.parse(text)
		} catch {
			return text
		}
	}
	try {
		return JSON.parse(text)
	} catch {
		return text
	}
}
