/* eslint-disable @typescript-eslint/no-explicit-any */

import { beforeEach, describe, expect, it, vi } from "vitest"

import { CostrictRawStoreClient } from "../costrictTelemetry/rawStoreClient"

vi.mock("@roo-code/logger", () => ({
	createLogger: vi.fn(() => ({
		info: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
	})),
}))

describe("CostrictRawStoreClient", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		vi.stubGlobal("fetch", vi.fn())
	})

	it("posts task conversation payload to the raw-store conversation endpoint", async () => {
		const client = new CostrictRawStoreClient("https://costrict.example.com")
		client.setProvider({
			getTelemetryProperties: vi.fn().mockResolvedValue({}),
			getState: vi.fn().mockResolvedValue({
				apiConfiguration: { costrictAccessToken: "test-token" },
			}),
		} as any)
		;(global.fetch as any).mockResolvedValue({ ok: true })

		await client.reportTaskConversation({
			task_id: "task-1",
			request_id: "req-1",
			sender: "user",
			request_content: "hello",
		})

		expect(global.fetch).toHaveBeenCalledWith(
			"https://costrict.example.com/user-indicator/api/v1/raw-store/task-conversation",
			expect.objectContaining({
				method: "POST",
				headers: expect.objectContaining({
					Authorization: "Bearer test-token",
					"Content-Type": "application/json",
					"X-Request-ID": expect.any(String),
				}),
				body: JSON.stringify({
					task_id: "task-1",
					request_id: "req-1",
					sender: "user",
					request_content: "hello",
				}),
			}),
		)
	})

	it("logs and swallows raw-store API failures", async () => {
		const client = new CostrictRawStoreClient("https://costrict.example.com")
		client.setProvider({
			getTelemetryProperties: vi.fn().mockResolvedValue({}),
			getState: vi.fn().mockResolvedValue({
				apiConfiguration: { costrictAccessToken: "test-token" },
			}),
		} as any)
		const logger = (client as any).logger
		;(global.fetch as any).mockResolvedValue({
			ok: false,
			status: 500,
			text: vi.fn().mockResolvedValue("server error"),
		})

		await expect(
			client.reportTaskSummary({
				task_id: "task-1",
				client_ide: "vscode",
			}),
		).resolves.toBeUndefined()

		expect(logger.error).toHaveBeenCalledWith(
			expect.stringContaining("[CostrictRawStoreClient#task-summary] Failed with status 500: server error"),
		)
	})
})
