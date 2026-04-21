import { beforeEach, describe, expect, it, vi } from "vitest"

const mockPostMessage = vi.fn()

vi.mock("../utils/vscode", () => ({
	vscode: {
		postMessage: mockPostMessage,
	},
}))

describe("costrict-cloud bridge utils", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("posts bridge messages through vscode wrapper", async () => {
		const { postCostrictCloudMessage } = await import("../costrict-cloud/bridge")
		postCostrictCloudMessage({
			type: "costrict-cloud.request",
			requestId: "req-1",
			path: "/agents",
			method: "GET",
		})

		expect(mockPostMessage).toHaveBeenCalledWith({
			type: "costrict-cloud.request",
			requestId: "req-1",
			path: "/agents",
			method: "GET",
		})
	})

	it("recognizes bootstrap, response and event messages", async () => {
		const {
			isCostrictCloudBootstrapMessage,
			isCostrictCloudEventMessage,
			isCostrictCloudEventStatusMessage,
			isCostrictCloudResponseMessage,
		} = await import("../costrict-cloud/bridge")

		expect(
			isCostrictCloudBootstrapMessage({
				type: "costrict-cloud.bootstrap",
				payload: { authenticated: true, serverUrl: "http://127.0.0.1:1", healthy: true },
			}),
		).toBe(true)
		expect(
			isCostrictCloudResponseMessage({
				type: "costrict-cloud.response",
				requestId: "1",
				ok: true,
				status: 200,
				data: {},
			}),
		).toBe(true)
		expect(isCostrictCloudEventMessage({ type: "costrict-cloud.event", event: "message", data: {} })).toBe(true)
		expect(isCostrictCloudEventStatusMessage({ type: "costrict-cloud.eventStatus", status: "connected" })).toBe(
			true,
		)
		expect(isCostrictCloudBootstrapMessage({ type: "other" })).toBe(false)
		expect(isCostrictCloudResponseMessage({ type: "other" })).toBe(false)
		expect(isCostrictCloudEventMessage({ type: "other" })).toBe(false)
		expect(isCostrictCloudEventStatusMessage({ type: "other" })).toBe(false)
	})
})
