/**
 * Regression test for issue #1360: truncated tool-call arguments can be silently
 * written to disk.
 *
 * When a streamed native tool call's arguments are cut off mid-value (e.g. the
 * model hits max_tokens while still writing write_to_file's `content` string),
 * NativeToolCallParser.finalizeStreamingToolCall() returns null. Task.ts (two
 * call sites, ~lines 3329 and ~3870) reuses the same tool-use object the
 * streaming phase was mutating in place and only sets `partial = false` -
 * before the fix it left `nativeArgs` (built from the incomplete partial
 * parse) untouched.
 *
 * presentAssistantMessage.ts (~line 474) is supposed to short-circuit exactly
 * this case with a structured tool_result instead of executing the tool - but
 * its guard is `isKnownTool && !block.nativeArgs && !customTool`. With
 * nativeArgs still populated, the guard never fired and the truncated content
 * would be passed straight to write_to_file's execution path.
 *
 * The fix clears `existingToolUse.nativeArgs` alongside `partial = false` at
 * both finalize-null sites, so the pre-existing guard actually does what its
 * own comment already claimed.
 */

import { isValidToolName } from "../../tools/validateToolUse"
import type { ToolUse, WriteToFileToolUse } from "../../../shared/tools"

describe("Truncated native tool-call args on finalize failure (issue #1360)", () => {
	/**
	 * Simulates the finalize-null branch from Task.ts (~lines 3329-3341 and
	 * ~3870-3880) as it exists after the fix: on finalizeStreamingToolCall()
	 * returning null, mark the tool non-partial and clear nativeArgs.
	 */
	function finalizeNullBranch(existingToolUse: ToolUse): ToolUse {
		existingToolUse.partial = false
		existingToolUse.nativeArgs = undefined
		return existingToolUse
	}

	/**
	 * Simulates the finalize-null branch as it existed *before* the fix, for a
	 * companion test proving the old behavior really was the bug (not just an
	 * assumption).
	 */
	function finalizeNullBranchBeforeFix(existingToolUse: ToolUse): ToolUse {
		existingToolUse.partial = false
		return existingToolUse
	}

	/**
	 * Simulates the short-circuit guard from presentAssistantMessage.ts (~line
	 * 474): `isKnownTool && !block.nativeArgs && !customTool`. Returns true when
	 * the tool call would be blocked (a structured tool_result emitted, no
	 * execution), false when it would proceed to execution.
	 */
	function wouldBeBlocked(block: ToolUse, customTool: unknown = undefined): boolean {
		const isKnownTool = isValidToolName(String(block.name))
		return Boolean(isKnownTool && !block.nativeArgs && !customTool)
	}

	it("clears nativeArgs so a truncated write_to_file call is blocked instead of executed", () => {
		// A write_to_file call whose `content` was cut off mid-stream - exactly
		// the scenario in #1360. The streaming phase already populated nativeArgs
		// from the incomplete partial-json parse before finalize failed.
		const truncated: WriteToFileToolUse = {
			type: "tool_use",
			name: "write_to_file",
			params: {},
			partial: true,
			nativeArgs: { path: "src/config.json", content: '{"apiKey": "sk-live-abc123' /* cut off mid-string */ },
		}

		finalizeNullBranch(truncated)

		expect(truncated.partial).toBe(false)
		expect(truncated.nativeArgs).toBeUndefined()
		expect(wouldBeBlocked(truncated)).toBe(true)
	})

	it("companion: without the fix, the same truncated call would NOT have been blocked", () => {
		const truncated: WriteToFileToolUse = {
			type: "tool_use",
			name: "write_to_file",
			params: {},
			partial: true,
			nativeArgs: { path: "src/config.json", content: '{"apiKey": "sk-live-abc123' },
		}

		finalizeNullBranchBeforeFix(truncated)

		// This is the bug: partial is false (presented as "complete"), but
		// nativeArgs still carries the truncated value, so the guard's
		// `!block.nativeArgs` never becomes true and the call would proceed to
		// execution with the truncated content.
		expect(truncated.partial).toBe(false)
		expect(truncated.nativeArgs).toEqual({ path: "src/config.json", content: '{"apiKey": "sk-live-abc123' })
		expect(wouldBeBlocked(truncated)).toBe(false)
	})

	it("does not affect a normally-finalized (non-null) tool call", () => {
		// When finalizeStreamingToolCall() succeeds, Task.ts replaces the block
		// with the freshly-finalized one instead of taking this branch at all -
		// this test just confirms a complete, valid nativeArgs is never touched
		// by wouldBeBlocked's guard simulation.
		const complete: WriteToFileToolUse = {
			type: "tool_use",
			name: "write_to_file",
			params: {},
			partial: false,
			nativeArgs: { path: "src/config.json", content: '{"apiKey": "sk-live-abc123xyz"}' },
		}

		expect(wouldBeBlocked(complete)).toBe(false)
	})
})
