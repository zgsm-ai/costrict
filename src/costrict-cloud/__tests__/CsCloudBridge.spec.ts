import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

describe("CsCloudBridge", () => {
	beforeEach(() => {
		vi.resetModules()
		vi.stubGlobal("fetch", vi.fn())
	})

	afterEach(() => {
		vi.unstubAllGlobals()
		vi.restoreAllMocks()
	})

	it("returns not authenticated when auth file is missing", async () => {
		vi.doMock("../config", () => ({
			readCostrictAuthFile: vi.fn().mockResolvedValue(null),
			resolveCsCloudServerUrl: vi.fn().mockResolvedValue("http://127.0.0.1:9999"),
			checkCsCloudHealth: vi.fn().mockResolvedValue(true),
		}))

		const { CsCloudBridge } = await import("../CsCloudBridge")
		const bridge = new CsCloudBridge()
		const response = await bridge.request({ requestId: "r1", path: "/agents" })

		expect(response).toEqual(
			expect.objectContaining({
				requestId: "r1",
				type: "costrict-cloud.response",
				ok: false,
				error: expect.stringContaining("auth.json"),
			}),
		)
	})

	it("returns error when server url cannot be resolved", async () => {
		vi.doMock("../config", () => ({
			readCostrictAuthFile: vi.fn().mockResolvedValue({ access_token: "token", base_url: "https://example.com" }),
			resolveCsCloudServerUrl: vi.fn().mockResolvedValue(null),
			checkCsCloudHealth: vi.fn().mockResolvedValue(false),
		}))

		const { CsCloudBridge } = await import("../CsCloudBridge")
		const bridge = new CsCloudBridge()
		const response = await bridge.request({ requestId: "r2", path: "/agents" })

		expect(response).toEqual(
			expect.objectContaining({
				requestId: "r2",
				type: "costrict-cloud.response",
				ok: false,
				error: expect.stringContaining("server.url"),
			}),
		)
	})

	it("auto-discovers running cs-cloud url when config file is missing", async () => {
		const resolveCsCloudServerUrl = vi.fn().mockResolvedValue("http://127.0.0.1:33643")
		vi.doMock("../config", () => ({
			readCostrictAuthFile: vi.fn().mockResolvedValue({ access_token: "token", base_url: "https://example.com" }),
			resolveCsCloudServerUrl,
			checkCsCloudHealth: vi.fn().mockResolvedValue(true),
		}))
		vi.mocked(global.fetch).mockResolvedValue({
			ok: true,
			status: 200,
			headers: new Headers({ "content-type": "application/json" }),
			text: vi.fn().mockResolvedValue('{"data":[{"id":"a1"}]}'),
		} as unknown as Response)

		const { CsCloudBridge } = await import("../CsCloudBridge")
		const bridge = new CsCloudBridge()
		const response = await bridge.request({ requestId: "r-auto", path: "/agents" })

		expect(resolveCsCloudServerUrl).toHaveBeenCalled()
		expect(global.fetch).toHaveBeenCalledWith(
			expect.stringContaining("http://127.0.0.1:33643/api/v1/agents"),
			expect.objectContaining({ method: "GET" }),
		)
		expect(response).toMatchObject({
			requestId: "r-auto",
			ok: true,
			status: 200,
			data: { data: [{ id: "a1" }] },
		})
	})

	it("returns structured success response for healthy requests", async () => {
		vi.doMock("../config", () => ({
			readCostrictAuthFile: vi.fn().mockResolvedValue({ access_token: "token", base_url: "https://example.com" }),
			resolveCsCloudServerUrl: vi.fn().mockResolvedValue("http://127.0.0.1:9999"),
			checkCsCloudHealth: vi.fn().mockResolvedValue(true),
		}))
		vi.mocked(global.fetch).mockResolvedValue({
			ok: true,
			status: 200,
			headers: new Headers({ "content-type": "application/json" }),
			text: vi.fn().mockResolvedValue('{"ok":true,"data":[{"id":"conv-1"}]}'),
		} as unknown as Response)

		const { CsCloudBridge } = await import("../CsCloudBridge")
		const bridge = new CsCloudBridge()
		const response = await bridge.request({
			requestId: "r3",
			path: "/conversations",
			query: { limit: "10" },
		})

		expect(global.fetch).toHaveBeenCalledWith(
			"http://127.0.0.1:9999/api/v1/conversations?limit=10",
			expect.objectContaining({ method: "GET" }),
		)
		expect(response).toMatchObject({
			requestId: "r3",
			type: "costrict-cloud.response",
			ok: true,
			status: 200,
			data: { ok: true, data: [{ id: "conv-1" }] },
		})
	})

	it("returns error details for non-2xx responses", async () => {
		vi.doMock("../config", () => ({
			readCostrictAuthFile: vi.fn().mockResolvedValue({ access_token: "token", base_url: "https://example.com" }),
			resolveCsCloudServerUrl: vi.fn().mockResolvedValue("http://127.0.0.1:9999"),
			checkCsCloudHealth: vi.fn().mockResolvedValue(true),
		}))
		vi.mocked(global.fetch).mockResolvedValue({
			ok: false,
			status: 503,
			statusText: "Service Unavailable",
			headers: new Headers({ "content-type": "application/json" }),
			text: vi.fn().mockResolvedValue('{"ok":false,"error":"backend unavailable"}'),
		} as unknown as Response)

		const { CsCloudBridge } = await import("../CsCloudBridge")
		const bridge = new CsCloudBridge()
		const response = await bridge.request({ requestId: "r4", path: "/conversations" })

		expect(response).toMatchObject({
			requestId: "r4",
			ok: false,
			status: 503,
			error: expect.stringContaining("503"),
			details: { ok: false, error: "backend unavailable" },
		})
	})

	it("streams SSE events and emits connection status", async () => {
		vi.doMock("../config", () => ({
			readCostrictAuthFile: vi.fn().mockResolvedValue({ access_token: "token", base_url: "https://example.com" }),
			resolveCsCloudServerUrl: vi.fn().mockResolvedValue("http://127.0.0.1:9999"),
			checkCsCloudHealth: vi.fn().mockResolvedValue(true),
		}))
		const encoder = new TextEncoder()
		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(encoder.encode("event: agent_message_chunk\ndata: {\"conversationId\":\"conv-1\",\"delta\":\"hello\"}\n\n"))
				controller.close()
			},
		})
		vi.mocked(global.fetch).mockResolvedValue({
			ok: true,
			status: 200,
			statusText: "OK",
			headers: new Headers({ "content-type": "text/event-stream" }),
			body: stream,
		} as unknown as Response)

		const { CsCloudBridge } = await import("../CsCloudBridge")
		const bridge = new CsCloudBridge()
		const received: Array<{ type: string; [key: string]: unknown }> = []

		await bridge.streamEvents((message) => {
			received.push(message as { type: string; [key: string]: unknown })
		}, new AbortController().signal)

		expect(received).toEqual([
			expect.objectContaining({ type: "costrict-cloud.eventStatus", status: "connecting" }),
			expect.objectContaining({ type: "costrict-cloud.eventStatus", status: "connected" }),
			expect.objectContaining({ type: "costrict-cloud.event", event: "agent_message_chunk" }),
			expect.objectContaining({ type: "costrict-cloud.eventStatus", status: "disconnected" }),
		])
		expect(received[2]?.data).toEqual({ conversationId: "conv-1", delta: "hello" })
	})
})
