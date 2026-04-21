import { describe, expect, it } from "vitest"

import {
	adaptEventMessageSummary,
	buildConversationSummary,
	buildEventCacheLabel,
	type ConversationRecord,
} from "../costrict-cloud/cloudConversationSummary"
import type { CostrictCloudInteractionItem, CostrictCloudMessageItem } from "../costrict-cloud/messageAdapter"

describe("cloudConversationSummary", () => {
	it("adapts event payloads into lightweight conversation event messages", () => {
		const result = adaptEventMessageSummary({
			event: "tool_call_update",
			data: {
				id: "event-1",
				conversation_id: "conv-1",
				tool_name: "grep_search",
				status: "running",
				delta: "searching",
			},
		})

		expect(result).toEqual(
			expect.objectContaining({
				id: "event-1",
				conversationId: "conv-1",
				kind: "tool",
				status: "running",
				toolName: "grep_search",
				content: "searching",
			}),
		)
	})

	it("returns null for event payloads without a conversation id", () => {
		expect(adaptEventMessageSummary({ event: "agent_message_chunk", data: { delta: "hello" } })).toBeNull()
	})

	it("builds event cache labels for running tools and commands", () => {
		expect(
			buildEventCacheLabel({
				id: "tool-1",
				kind: "tool",
				content: "",
				status: "running",
				toolName: "read_file",
				raw: {},
			}),
		).toBe("read_file 运行中")

		expect(
			buildEventCacheLabel({
				id: "cmd-1",
				kind: "command",
				content: "",
				status: "completed",
				command: "pnpm test",
				raw: {},
			}),
		).toBe("pnpm test 已完成")
	})

	it("prioritizes pending permissions and questions in conversation summaries", () => {
		const conversation: ConversationRecord = { id: "conv-1", status: "idle" }
		const permissions: CostrictCloudInteractionItem[] = [
			{
				id: "perm-1",
				kind: "permission",
				conversationId: "conv-1",
				title: "Run command",
				description: "Allow?",
				options: [],
				raw: {},
			},
		]

		expect(
			buildConversationSummary({
				conversation,
				messages: [],
				permissions,
				questions: [],
			}),
		).toEqual({ label: "waiting", tone: "waiting", detail: "等待权限：Run command" })
	})

	it("summarizes latest selected conversation messages", () => {
		const messages: CostrictCloudMessageItem[] = [
			{ id: "u1", kind: "user", content: "hello", raw: {} },
			{ id: "cmd-1", kind: "command", content: "running", status: "running", command: "pnpm test", raw: {} },
		]

		expect(
			buildConversationSummary({
				conversation: { id: "conv-1", status: "idle" },
				messages,
				permissions: [],
				questions: [],
			}),
		).toEqual({ label: "running", tone: "running", detail: "pnpm test 运行中" })
	})

	it("uses cached event and abort override when no live messages are available", () => {
		expect(
			buildConversationSummary({
				conversation: { id: "conv-1", status: "running" },
				messages: [],
				permissions: [],
				questions: [],
				cachedEvent: {
					kind: "assistant",
					status: "streaming",
					label: "正在生成回复",
					timestamp: 1,
				},
			}),
		).toEqual({ label: "running", tone: "running", detail: "正在生成回复" })

		expect(
			buildConversationSummary({
				conversation: { id: "conv-1", status: "running" },
				messages: [],
				permissions: [],
				questions: [],
				abortOverride: "force-idle",
			}),
		).toEqual({ label: "idle", tone: "idle", detail: "已停止" })
	})
})
