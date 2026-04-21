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
	async getStatus(): Promise<CostrictCloudStatus> {
		const auth = await readCostrictAuthFile()
		const serverUrl = await resolveCsCloudServerUrl()
		const healthy = serverUrl ? await checkCsCloudHealth(serverUrl) : false
		return {
			authenticated: !!auth,
			serverUrl,
			healthy,
		}
	}

	async request(request: CostrictCloudBridgeRequest): Promise<CostrictCloudBridgeResponse> {
		const requestId = request.requestId
		try {
			const status = await this.getStatus()
			if (!status.authenticated) {
				return {
					requestId,
					type: "costrict-cloud.response",
					ok: false,
					error: "未检测到 ~/.costrict/share/auth.json，请先登录 CoStrict。",
				}
			}
			if (!status.serverUrl) {
				return {
					requestId,
					type: "costrict-cloud.response",
					ok: false,
					error: "未检测到 cs-cloud server.url，请先手动执行 cs-cloud start。",
				}
			}
			if (!status.healthy) {
				return {
					requestId,
					type: "costrict-cloud.response",
					ok: false,
					error: "cs-cloud 健康检查失败，请确认 cs-cloud start 已成功运行。",
				}
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

			const response = await fetch(url, init)
			const data = await readResponseBody(response)

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
			await onEvent({
				type: "costrict-cloud.eventStatus",
				status: "error",
				error: "cs-cloud 未就绪，无法启动事件流。",
			})
			return
		}

		await onEvent({ type: "costrict-cloud.eventStatus", status: "connecting" })

		try {
			const response = await fetch(buildCsCloudUrl(status.serverUrl, "/events"), {
				method: "GET",
				headers: {
					Accept: "text/event-stream, application/json",
				},
				signal,
			})

			if (!response.ok) {
				await onEvent({
					type: "costrict-cloud.eventStatus",
					status: "error",
					error: `事件流连接失败：${response.status} ${response.statusText}`,
				})
				return
			}

			await onEvent({ type: "costrict-cloud.eventStatus", status: "connected" })

			const reader = response.body?.getReader()
			if (!reader) {
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
					break
				}
				buffer += decoder.decode(value, { stream: true })
				let boundary = buffer.indexOf("\n\n")
				while (boundary !== -1) {
					const chunk = buffer.slice(0, boundary)
					buffer = buffer.slice(boundary + 2)
					const parsed = parseSseChunk(chunk)
					if (parsed) {
						await onEvent(parsed)
					}
					boundary = buffer.indexOf("\n\n")
				}
			}

			await onEvent({ type: "costrict-cloud.eventStatus", status: "disconnected" })
		} catch (error) {
			if (signal.aborted) {
				await onEvent({ type: "costrict-cloud.eventStatus", status: "disconnected" })
				return
			}
			await onEvent({
				type: "costrict-cloud.eventStatus",
				status: "error",
				error: error instanceof Error ? error.message : String(error),
			})
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
