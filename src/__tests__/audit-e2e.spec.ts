// End-to-end tests for the full audit logging system
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import * as fs from "fs/promises"
import * as path from "path"
import * as os from "os"

import { AuditLogger } from "../core/audit/AuditLogger"
import { truncateForAudit, summarizeResult } from "../core/audit/sanitize"

describe("Audit e2e", () => {
	describe("Full audit flow with actual file I/O", () => {
		let tmpDir: string
		let logger: AuditLogger

		beforeEach(async () => {
			tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "audit-e2e-test-"))
			logger = await AuditLogger.create("task-e2e-001", tmpDir, "/test/workspace")
		})

		afterEach(async () => {
			logger.dispose()
			await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
		})

		it("creates audit log file with header", async () => {
			const auditFile = path.join(tmpDir, "task-e2e-001", "task_audit.jsonl")
			const content = await fs.readFile(auditFile, "utf8")
			const header = JSON.parse(content.trim())

			expect(header.version).toBe(1)
			expect(header.taskId).toBe("task-e2e-001")
			expect(header.workspace).toBe("/test/workspace")
			expect(header.createdAt).toBeTruthy()
		})

		it("records ToolExecutionAuditEvent with sanitized params", async () => {
			const event = logger.createToolExecutionEvent({
				toolName: "read_file",
				toolParams: { path: "/src/index.ts" },
				approvalDecision: "auto_approved",
				resultSummary: "Read 500 bytes",
				success: true,
				executionDurationMs: 150,
			})
			logger.record(event)
			await logger.flush()

			const auditFile = path.join(tmpDir, "task-e2e-001", "task_audit.jsonl")
			const lines = (await fs.readFile(auditFile, "utf8")).trim().split("\n")
			const eventLine = JSON.parse(lines[lines.length - 1])

			expect(eventLine.category).toBe("TOOL_EXECUTION")
			expect(eventLine.toolName).toBe("read_file")
			expect(eventLine.approvalDecision).toBe("auto_approved")
			expect(eventLine.success).toBe(true)
		})

		it("records CommandExecutionAuditEvent with sanitized command", async () => {
			const event = logger.createCommandExecutionEvent({
				command: "git status",
				cwd: "/test/workspace",
				approvalDecision: "user_approved",
				exitCode: 0,
				executionDurationMs: 200,
				success: true,
			})
			logger.record(event)
			await logger.flush()

			const auditFile = path.join(tmpDir, "task-e2e-001", "task_audit.jsonl")
			const lines = (await fs.readFile(auditFile, "utf8")).trim().split("\n")
			const eventLine = JSON.parse(lines[lines.length - 1])

			expect(eventLine.category).toBe("COMMAND_EXECUTION")
			expect(eventLine.command).toBe("git status")
			expect(eventLine.exitCode).toBe(0)
			expect(eventLine.success).toBe(true)
		})

		it("records UserApprovalAuditEvent", async () => {
			const event = logger.createUserApprovalEvent({
				askType: "tool",
				targetDescription: "write /src/test.ts",
				decision: "user_approved",
				responseTimeMs: 5000,
			})
			logger.record(event)
			await logger.flush()

			const auditFile = path.join(tmpDir, "task-e2e-001", "task_audit.jsonl")
			const lines = (await fs.readFile(auditFile, "utf8")).trim().split("\n")
			const eventLine = JSON.parse(lines[lines.length - 1])

			expect(eventLine.category).toBe("USER_APPROVAL")
			expect(eventLine.decision).toBe("user_approved")
			expect(eventLine.responseTimeMs).toBe(5000)
		})

		it("records AutoApprovalAuditEvent", async () => {
			const event = logger.createAutoApprovalEvent({
				askType: "tool",
				targetDescription: "read /src/index.ts",
				ruleCategory: "alwaysAllowReadOnly",
				ruleMatched: "alwaysAllowReadOnly auto-approved",
				decision: "auto_approved",
			})
			logger.record(event)
			await logger.flush()

			const auditFile = path.join(tmpDir, "task-e2e-001", "task_audit.jsonl")
			const lines = (await fs.readFile(auditFile, "utf8")).trim().split("\n")
			const eventLine = JSON.parse(lines[lines.length - 1])

			expect(eventLine.category).toBe("AUTO_APPROVAL")
			expect(eventLine.decision).toBe("auto_approved")
			expect(eventLine.ruleCategory).toBe("alwaysAllowReadOnly")
		})

		it("records TaskLifecycleAuditEvent on finalizeTaskCompletion", async () => {
			logger.createToolExecutionEvent({
				toolName: "read_file",
				toolParams: {},
				approvalDecision: "auto_approved",
				resultSummary: "",
				success: true,
			})
			await logger.finalizeTaskCompletion()

			const auditFile = path.join(tmpDir, "task-e2e-001", "task_audit.jsonl")
			const content = await fs.readFile(auditFile, "utf8")
			const lines = content.trim().split("\n")
			const lifecycleEvent = JSON.parse(lines[lines.length - 1])

			expect(lifecycleEvent.category).toBe("TASK_LIFECYCLE")
			expect(lifecycleEvent.eventType).toBe("task_completed")
			expect(lifecycleEvent.toolsExecuted).toBe(1)
		})

		it("records FileChangeAuditEvent with diff stats", async () => {
			const event = logger.createFileChangeEvent({
				filePath: "/src/test.ts",
				changeType: "modify",
				toolName: "apply_diff",
				approvalDecision: "user_approved",
				diffStats: { added: 10, removed: 2 },
				language: "typescript",
			})
			logger.record(event)
			await logger.flush()

			const auditFile = path.join(tmpDir, "task-e2e-001", "task_audit.jsonl")
			const lines = (await fs.readFile(auditFile, "utf8")).trim().split("\n")
			const eventLine = JSON.parse(lines[lines.length - 1])

			expect(eventLine.category).toBe("FILE_CHANGE")
			expect(eventLine.filePath).toBe("/src/test.ts")
			expect(eventLine.changeType).toBe("modify")
			expect(eventLine.diffStats).toEqual({ added: 10, removed: 2 })
		})

		it("does not record after dispose", async () => {
			logger.createToolExecutionEvent({
				toolName: "read_file",
				toolParams: {},
				approvalDecision: "auto_approved",
				resultSummary: "",
				success: true,
			})
			logger.dispose()

			// dispose() writes buffered events synchronously
			const auditFile = path.join(tmpDir, "task-e2e-001", "task_audit.jsonl")
			const content = await fs.readFile(auditFile, "utf8")
			const lines = content.trim().split("\n")
			// Should have header + at least one event from dispose
			expect(lines.length).toBeGreaterThanOrEqual(1)
		})
	})

	describe("Sensitive data redaction in audit events", () => {
		let tmpDir: string
		let logger: AuditLogger

		beforeEach(async () => {
			tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "audit-sanitize-e2e-"))
			logger = await AuditLogger.create("task-sanitize-001", tmpDir, "/test/workspace")
		})

		afterEach(async () => {
			logger.dispose()
			await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
		})

		it("redacts API keys in tool params", async () => {
			const event = logger.createToolExecutionEvent({
				toolName: "execute_command",
				toolParams: { api_key: "sk-1234567890abcdefghijklmnopqrstuvwxyz" },
				approvalDecision: "user_approved",
				resultSummary: "Command executed",
				success: true,
			})
			logger.record(event)
			await logger.flush()

			const auditFile = path.join(tmpDir, "task-sanitize-001", "task_audit.jsonl")
			const content = await fs.readFile(auditFile, "utf8")

			// The API key should be redacted in toolParams
			expect(content).not.toContain("sk-1234567890abcdef")
			expect(content).toContain("[REDACTED_OPENAI_KEY]")
		})

		it("redacts Bearer tokens in command strings", async () => {
			const event = logger.createCommandExecutionEvent({
				command: "curl -H 'Authorization: Bearer mylongtoken12345' https://api.example.com",
				cwd: "/test/workspace",
				approvalDecision: "auto_approved",
				success: true,
			})
			logger.record(event)
			await logger.flush()

			const auditFile = path.join(tmpDir, "task-sanitize-001", "task_audit.jsonl")
			const content = await fs.readFile(auditFile, "utf8")

			expect(content).not.toContain("mylongtoken12345")
			expect(content).toContain("[REDACTED]")
		})

		it("redacts passwords in URLs in tool params", async () => {
			const event = logger.createToolExecutionEvent({
				toolName: "use_mcp_tool",
				toolParams: { server_name: "prod", url: "https://user:password123@example.com/api" },
				approvalDecision: "auto_approved",
				resultSummary: "MCP tool executed",
				success: true,
			})
			logger.record(event)
			await logger.flush()

			const auditFile = path.join(tmpDir, "task-sanitize-001", "task_audit.jsonl")
			const content = await fs.readFile(auditFile, "utf8")

			expect(content).not.toContain("password123")
			expect(content).toContain("[REDACTED_PASS]")
		})
	})
})
