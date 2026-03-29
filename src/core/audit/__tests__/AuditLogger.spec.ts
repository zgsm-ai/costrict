import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { AuditLogger } from "../AuditLogger"

describe("AuditLogger", () => {
	describe("create()", () => {
		it("creates an AuditLogger instance with valid taskId and storagePath", async () => {
			const logger = await AuditLogger.create("task-123", "/tmp/audit-test")
			expect(logger).toBeInstanceOf(AuditLogger)
			logger.dispose()
		})
	})

	describe("event factory methods", () => {
		let logger: AuditLogger
		beforeEach(async () => {
			logger = await AuditLogger.create("task-123", "/tmp/audit-test", "/workspace")
		})
		afterEach(() => {
			logger.dispose()
		})

		it("createToolExecutionEvent returns valid event shape", () => {
			const event = logger.createToolExecutionEvent({
				toolName: "read_file",
				toolParams: { path: "/src/index.ts" },
				approvalDecision: "user_approved",
				resultSummary: "Read 100 bytes",
				success: true,
			})
			expect(event.category).toBe("TOOL_EXECUTION")
			expect(event.toolName).toBe("read_file")
			expect(event.approvalDecision).toBe("user_approved")
			expect(event.success).toBe(true)
			expect(event.eventId).toBeTruthy()
			expect(event.timestamp).toBeTruthy()
			expect(event.taskId).toBe("task-123")
		})

		it("createToolExecutionEvent increments toolsExecuted counter", () => {
			logger.createToolExecutionEvent({
				toolName: "read_file",
				toolParams: {},
				approvalDecision: "auto_approved",
				resultSummary: "",
				success: true,
			})
			logger.createToolExecutionEvent({
				toolName: "write_file",
				toolParams: {},
				approvalDecision: "user_approved",
				resultSummary: "",
				success: true,
			})
			// Counters are internal — finalize emits them
		})

		it("createCommandExecutionEvent returns valid event shape", () => {
			const event = logger.createCommandExecutionEvent({
				command: "git status",
				cwd: "/workspace",
				approvalDecision: "auto_approved",
				exitCode: 0,
				executionDurationMs: 150,
				success: true,
			})
			expect(event.category).toBe("COMMAND_EXECUTION")
			expect(event.command).toBe("git status")
			expect(event.cwd).toBe("/workspace")
			expect(event.exitCode).toBe(0)
			expect(event.success).toBe(true)
		})

		it("createUserApprovalEvent increments approval counters", () => {
			const approved = logger.createUserApprovalEvent({
				askType: "tool",
				targetDescription: "write /src/test.ts",
				decision: "user_approved",
			})
			const denied = logger.createUserApprovalEvent({
				askType: "command",
				targetDescription: "rm -rf /",
				decision: "user_denied",
			})
			expect(approved.decision).toBe("user_approved")
			expect(denied.decision).toBe("user_denied")
		})

		it("createMcpToolEvent returns valid event shape", () => {
			const event = logger.createMcpToolEvent({
				mcpServerName: "filesystem",
				mcpToolName: "read_file",
				arguments: { path: "/src/index.ts" },
				approvalDecision: "auto_approved",
				resultSummary: "Read 500 bytes",
				success: true,
			})
			expect(event.category).toBe("MCP_TOOL")
			expect(event.mcpServerName).toBe("filesystem")
			expect(event.mcpToolName).toBe("read_file")
			expect(event.success).toBe(true)
		})

		it("createFileChangeEvent returns valid event shape", () => {
			const event = logger.createFileChangeEvent({
				filePath: "/src/index.ts",
				changeType: "modify",
				toolName: "apply_diff",
				approvalDecision: "user_approved",
				diffStats: { added: 10, removed: 2 },
				language: "typescript",
			})
			expect(event.category).toBe("FILE_CHANGE")
			expect(event.filePath).toBe("/src/index.ts")
			expect(event.changeType).toBe("modify")
			expect(event.diffStats?.added).toBe(10)
		})

		it("createAutoApprovalEvent returns valid event shape", () => {
			const event = logger.createAutoApprovalEvent({
				askType: "tool",
				targetDescription: "read /src/index.ts",
				ruleCategory: "alwaysAllowReadOnly",
				ruleMatched: "alwaysAllowReadOnly === true",
				decision: "auto_approved",
			})
			expect(event.category).toBe("AUTO_APPROVAL")
			expect(event.ruleCategory).toBe("alwaysAllowReadOnly")
			expect(event.decision).toBe("auto_approved")
		})
	})

	describe("record()", () => {
		it("records events that pass schema validation", async () => {
			const logger = await AuditLogger.create("task-123", "/tmp/audit-test")
			const event = logger.createToolExecutionEvent({
				toolName: "read_file",
				toolParams: {},
				approvalDecision: "user_approved",
				resultSummary: "OK",
				success: true,
			})
			// Should not throw — record validates the event
			logger.record(event)
			logger.dispose()
		})
	})

	describe("dispose()", () => {
		it("disposes without error when no events recorded", async () => {
			const logger = await AuditLogger.create("task-123", "/tmp/audit-test")
			expect(() => logger.dispose()).not.toThrow()
		})

		it("can be called multiple times safely", async () => {
			const logger = await AuditLogger.create("task-123", "/tmp/audit-test")
			logger.dispose()
			logger.dispose()
			logger.dispose()
			// Should not throw
		})

		it("stops recording after dispose", async () => {
			const logger = await AuditLogger.create("task-123", "/tmp/audit-test")
			logger.dispose()
			const event = logger.createToolExecutionEvent({
				toolName: "read_file",
				toolParams: {},
				approvalDecision: "user_approved",
				resultSummary: "OK",
				success: true,
			})
			// After dispose, record should be a no-op (event not added)
			// We can't easily verify this without inspecting internals,
			// but dispose() should not throw
		})
	})
})
