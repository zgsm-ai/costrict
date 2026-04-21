import { describe, expect, it } from "vitest"

import { adaptCsCloudInteraction } from "../costrict-cloud/cloudInteractionAdapter"
import {
	adaptCsCloudMessages,
	mergeCsCloudEventIntoMessages,
} from "../costrict-cloud/messageAdapter"

describe("adaptCsCloudMessages", () => {
	it("unwraps response envelopes and maps common message roles", () => {
		const result = adaptCsCloudMessages({
			data: [
				{ id: "u1", role: "user", content: "hello" },
				{ id: "a1", role: "assistant", content: "hi" },
			],
		})

		expect(result).toEqual([
			expect.objectContaining({ id: "u1", kind: "user", content: "hello" }),
			expect.objectContaining({ id: "a1", kind: "assistant", content: "hi" }),
		])
	})

	it("maps ACP update types to reasoning and tool messages", () => {
		const result = adaptCsCloudMessages({
			data: {
				messages: [
					{ msg_id: "r1", type: "agent_thought_chunk", delta: "thinking" },
					{ tool_call_id: "t1", type: "tool_call", toolName: "read_file", arguments: { path: "README.md" } },
				],
			},
		})

		expect(result).toEqual([
			expect.objectContaining({ id: "r1", kind: "reasoning", content: "thinking", status: "streaming" }),
			expect.objectContaining({ id: "t1", kind: "tool", toolName: "read_file", status: "running" }),
		])
		expect(result[1]?.content).toContain("README.md")
		expect(result[1]?.metadata).toEqual(expect.objectContaining({ arguments: { path: "README.md" } }))
	})

	it("maps command and error shaped messages", () => {
		const result = adaptCsCloudMessages([
			{ id: "c1", type: "command_output", command: "pnpm test", stdout: "passed", exit_code: 0 },
			{ id: "e1", type: "error", error: "failed" },
		])

		expect(result[0]).toEqual(
			expect.objectContaining({ id: "c1", kind: "command", command: "pnpm test", status: "completed" }),
		)
		expect(result[0]?.content).toContain("passed")
		expect(result[0]?.metadata).toEqual(expect.objectContaining({ exitCode: 0, stdout: "passed" }))
		expect(result[1]).toEqual(expect.objectContaining({ id: "e1", kind: "error", content: "failed" }))
	})

	it("unwraps top-level messages envelopes and nested payload content", () => {
		const result = adaptCsCloudMessages({
			messages: [
				{
					message_id: "nested-1",
					role: "assistant",
					conversation_id: "conv-1",
					payload: { text: "nested text" },
				},
			],
		})

		expect(result).toEqual([
			expect.objectContaining({
				id: "nested-1",
				kind: "assistant",
				conversationId: "conv-1",
				content: "nested text",
			}),
		])
	})
})

describe("adaptCsCloudInteraction", () => {
	it("normalizes permission interactions with default options", () => {
		const result = adaptCsCloudInteraction({
			event: "permission",
			data: {
				call_id: "perm-1",
				title: "Run command",
				description: "Allow executing pnpm test?",
				conversationId: "conv-1",
			},
		})

		expect(result).toEqual(
			expect.objectContaining({
				id: "perm-1",
				kind: "permission",
				conversationId: "conv-1",
				title: "Run command",
			}),
		)
		expect(result?.options.map((option) => option.id)).toEqual([
			"allow_once",
			"allow_always",
			"reject_once",
			"reject_always",
		])
	})

	it("prefers permission resource id over call id for reply requests", () => {
		const result = adaptCsCloudInteraction({
			event: "permission",
			data: {
				id: "perm_da941fd07001WFJPI4O5tUWRNu",
				callID: "read_0",
				sessionID: "ses_123",
				permission: "external_directory",
				patterns: ["/home/mini/.config/costrict/prompts/*"],
				always: ["/home/mini/.config/costrict/prompts/*"],
				metadata: {
					filepath: "/home/mini/.config/costrict/prompts/plain.md",
					parentDir: "/home/mini/.config/costrict/prompts",
				},
			},
		})

		expect(result).toEqual(
			expect.objectContaining({
				id: "perm_da941fd07001WFJPI4O5tUWRNu",
				kind: "permission",
				conversationId: "ses_123",
			}),
		)
	})

	it("normalizes question interactions with explicit options", () => {
		const result = adaptCsCloudInteraction({
			event: "question",
			data: {
				question_id: "q-1",
				question: "What should the agent do next?",
				options: [{ option_id: "reply", label: "Reply now", kind: "reply" }],
			},
		})

		expect(result).toEqual(
			expect.objectContaining({
				id: "q-1",
				kind: "question",
				description: "What should the agent do next?",
			}),
		)
		expect(result?.options).toEqual([{ id: "reply", label: "Reply now", kind: "reply" }])
	})

	it("supports request_id based questions and default reply/reject options", () => {
		const result = adaptCsCloudInteraction({
			event: "question",
			data: {
				request_id: "req-q-2",
				message: "Need more details",
				session_id: "conv-2",
			},
		})

		expect(result).toEqual(
			expect.objectContaining({
				id: "req-q-2",
				kind: "question",
				conversationId: "conv-2",
				description: "Need more details",
			}),
		)
		expect(result?.options.map((option) => option.id)).toEqual(["reply"])
	})
})

describe("mergeCsCloudEventIntoMessages", () => {
	it("appends assistant chunk events directly into local state", () => {
		const base = adaptCsCloudMessages([{ msg_id: "m1", type: "agent_message_chunk", delta: "Hello" }])
		const result = mergeCsCloudEventIntoMessages(
			base,
			{
				event: "agent_message_chunk",
				data: { msg_id: "m1", type: "agent_message_chunk", delta: " world", conversationId: "conv-1" },
			},
			"conv-1",
		)

		expect(result.didMutate).toBe(true)
		expect(result.shouldRefetch).toBe(false)
		expect(result.messages[0]?.content).toBe("Hello world")
	})

	it("appends new tool events without refetch", () => {
		const result = mergeCsCloudEventIntoMessages(
			[],
			{
				event: "tool_call",
				data: { tool_call_id: "tool-1", type: "tool_call", toolName: "grep_search", arguments: { pattern: "foo" } },
			},
		)

		expect(result.didMutate).toBe(true)
		expect(result.messages[0]).toEqual(
			expect.objectContaining({ id: "tool-1", kind: "tool", toolName: "grep_search", status: "running" }),
		)
	})

	it("merges tool updates into completion state", () => {
		const base = adaptCsCloudMessages([
			{ tool_call_id: "tool-1", type: "tool_call", toolName: "grep_search", arguments: { pattern: "foo" } },
		])
		const result = mergeCsCloudEventIntoMessages(base, {
			event: "tool_call_update",
			data: { tool_call_id: "tool-1", type: "tool_call_update", result: { matches: 3 }, status: "completed" },
		})

		expect(result.didMutate).toBe(true)
		expect(result.messages[0]).toEqual(expect.objectContaining({ status: "completed" }))
		expect(result.messages[0]?.metadata).toEqual(
			expect.objectContaining({ arguments: { pattern: "foo" }, result: { matches: 3 } }),
		)
	})

	it("merges command output incrementally and preserves exit metadata", () => {
		const base = adaptCsCloudMessages([
			{ id: "cmd-1", type: "command_output", command: "pnpm test", stdout: "line 1" },
		])
		const result = mergeCsCloudEventIntoMessages(base, {
			event: "command_output",
			data: { id: "cmd-1", type: "command_output", command: "pnpm test", stdout: "line 1\nline 2", exit_code: 0 },
		})

		expect(result.didMutate).toBe(true)
		expect(result.messages[0]?.content).toContain("line 2")
		expect(result.messages[0]).toEqual(expect.objectContaining({ status: "completed" }))
		expect(result.messages[0]?.metadata).toEqual(expect.objectContaining({ exitCode: 0, stdout: "line 1\nline 2" }))
	})

	it("streams reasoning via part-based protocol", () => {
		const start = mergeCsCloudEventIntoMessages([], {
			event: "message.part.updated",
			data: {
				type: "message.part.updated",
				properties: {
					messageID: "msg-1",
					partID: "part-r1",
					part: {
						id: "part-r1",
						type: "reasoning",
						text: "",
					},
				},
			},
		})

		const result = mergeCsCloudEventIntoMessages(start.messages, {
			event: "message.part.delta",
			data: {
				type: "message.part.delta",
				properties: {
					messageID: "msg-1",
					partID: "part-r1",
					field: "text",
					delta: "用户问题",
				},
			},
		})

		expect(result.didMutate).toBe(true)
		expect(result.messages[0]).toEqual(expect.objectContaining({ id: "part-r1", kind: "assistant", content: "用户问题", status: "streaming" }))
	})

	it("treats step lifecycle as tool-like messages", () => {
		const start = mergeCsCloudEventIntoMessages([], {
			event: "step-start",
			data: {
				type: "step-start",
				properties: {
					stepID: "step-1",
					messageID: "msg-2",
					name: "subagent",
				},
			},
		})

		const result = mergeCsCloudEventIntoMessages(start.messages, {
			event: "step-finish",
			data: {
				type: "step-finish",
				properties: {
					stepID: "step-1",
					messageID: "msg-2",
					reason: "stop",
					tokens: { total: 10 },
					cost: 0,
				},
			},
		})

		expect(result.didMutate).toBe(true)
		expect(result.messages[0]).toEqual(expect.objectContaining({ id: "step-1", kind: "tool", status: "completed" }))
		expect(result.messages[0]?.toolName).toBeUndefined()
		expect(result.messages[0]?.metadata).toEqual(expect.objectContaining({ reason: "stop", tokens: { total: 10 }, cost: 0 }))
	})

	it("finalizes streaming assistant messages on session.status completion", () => {
		const base = adaptCsCloudMessages([{ msg_id: "m1", type: "agent_message_chunk", delta: "Hello" }])
		const result = mergeCsCloudEventIntoMessages(base, {
			event: "session.status",
			data: { status: "completed" },
		})

		expect(result.didMutate).toBe(true)
		expect(result.shouldRefetch).toBe(true)
		expect(result.messages[0]).toEqual(expect.objectContaining({ status: "completed" }))
	})

	it("requests fallback refetch for non-inline events", () => {
		const result = mergeCsCloudEventIntoMessages([], { event: "plan", data: { content: "todo" } }, "conv-1")
		expect(result.didMutate).toBe(false)
		expect(result.shouldRefetch).toBe(true)
	})
})
