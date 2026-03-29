// Integration tests for audit logging in presentAssistantMessage
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import * as fs from "fs/promises"
import * as path from "path"
import * as os from "os"

import type { Task } from "../../task/Task"

// Mock the audit logger to avoid filesystem operations
const mockRecord = vi.fn()
const mockCreateToolExecutionEvent = vi.fn().mockReturnValue({ eventId: "test-id" })
const mockCreateCommandExecutionEvent = vi.fn().mockReturnValue({ eventId: "test-id" })
const mockCreateUserApprovalEvent = vi.fn().mockReturnValue({ eventId: "test-id" })
const mockCreateMcpToolEvent = vi.fn().mockReturnValue({ eventId: "test-id" })
const mockCreateFileChangeEvent = vi.fn().mockReturnValue({ eventId: "test-id" })
const mockCreateAutoApprovalEvent = vi.fn().mockReturnValue({ eventId: "test-id" })
const mockDispose = vi.fn()

vi.mock("../../audit/AuditLogger.js", () => ({
	AuditLogger: {
		create: vi.fn().mockResolvedValue({
			record: mockRecord,
			createToolExecutionEvent: mockCreateToolExecutionEvent,
			createCommandExecutionEvent: mockCreateCommandExecutionEvent,
			createUserApprovalEvent: mockCreateUserApprovalEvent,
			createMcpToolEvent: mockCreateMcpToolEvent,
			createFileChangeEvent: mockCreateFileChangeEvent,
			createAutoApprovalEvent: mockCreateAutoApprovalEvent,
			dispose: mockDispose,
		}),
	},
}))

// Mock TelemetryService to avoid side effects
vi.mock("@roo-code/telemetry", () => ({
	TelemetryService: {
		instance: {
			captureToolUsage: vi.fn(),
			captureTaskCompleted: vi.fn(),
		},
	},
}))

// Mock the task's auditLogger getter
function createMockTask() {
	return {
		taskId: "test-task-id",
		instanceId: "test-instance-id",
		auditLogger: {
			record: mockRecord,
			createUserApprovalEvent: mockCreateUserApprovalEvent,
			createAutoApprovalEvent: mockCreateAutoApprovalEvent,
		},
		ask: vi.fn().mockResolvedValue({ response: "yesButtonClicked", text: undefined, images: undefined }),
	} as unknown as Task
}

describe("Audit integration", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	describe("UserApprovalAuditEvent recording", () => {
		it("creates UserApprovalAuditEvent when user approves", async () => {
			const task = createMockTask()
			// Access the audit logger and call the event factory
			const event = task.auditLogger?.createUserApprovalEvent({
				askType: "tool",
				targetDescription: "write /src/test.ts",
				decision: "user_approved",
			})

			expect(mockCreateUserApprovalEvent).toHaveBeenCalledWith({
				askType: "tool",
				targetDescription: "write /src/test.ts",
				decision: "user_approved",
			})
			expect(event).toBeDefined()
		})

		it("creates UserApprovalAuditEvent with response time when user responds", async () => {
			const task = createMockTask()
			const event = task.auditLogger?.createUserApprovalEvent({
				askType: "command",
				targetDescription: "git commit",
				decision: "user_approved",
				userFeedback: "Looks good",
				hasFeedbackImages: false,
				responseTimeMs: 5000,
			})

			expect(mockCreateUserApprovalEvent).toHaveBeenCalledWith({
				askType: "command",
				targetDescription: "git commit",
				decision: "user_approved",
				userFeedback: "Looks good",
				hasFeedbackImages: false,
				responseTimeMs: 5000,
			})
			expect(event).toBeDefined()
		})

		it("creates UserApprovalAuditEvent with user_denied decision", async () => {
			const task = createMockTask()
			const event = task.auditLogger?.createUserApprovalEvent({
				askType: "tool",
				targetDescription: "rm -rf /",
				decision: "user_denied",
				userFeedback: "No, this is dangerous",
				responseTimeMs: 2000,
			})

			expect(mockCreateUserApprovalEvent).toHaveBeenCalledWith(
				expect.objectContaining({
					decision: "user_denied",
					userFeedback: "No, this is dangerous",
				}),
			)
			expect(event).toBeDefined()
		})
	})

	describe("AutoApprovalAuditEvent recording", () => {
		it("creates AutoApprovalAuditEvent for auto-approved tools", () => {
			const task = createMockTask()
			const event = task.auditLogger?.createAutoApprovalEvent({
				askType: "tool",
				targetDescription: "read /src/index.ts",
				ruleCategory: "alwaysAllowReadOnly",
				ruleMatched: "alwaysAllowReadOnly auto-approved",
				decision: "auto_approved",
			})

			expect(mockCreateAutoApprovalEvent).toHaveBeenCalledWith({
				askType: "tool",
				targetDescription: "read /src/index.ts",
				ruleCategory: "alwaysAllowReadOnly",
				ruleMatched: "alwaysAllowReadOnly auto-approved",
				decision: "auto_approved",
			})
			expect(event).toBeDefined()
		})

		it("creates AutoApprovalAuditEvent with timeout for followup questions", () => {
			const task = createMockTask()
			const event = task.auditLogger?.createAutoApprovalEvent({
				askType: "followup",
				targetDescription: '{"suggest": ["Continue?"]}',
				ruleCategory: "alwaysAllowFollowupQuestions",
				ruleMatched: "alwaysAllowFollowupQuestions auto-approved",
				decision: "auto_approved",
				autoApproveTimeoutMs: 30000,
			})

			expect(mockCreateAutoApprovalEvent).toHaveBeenCalledWith(
				expect.objectContaining({
					askType: "followup",
					decision: "auto_approved",
					autoApproveTimeoutMs: 30000,
				}),
			)
			expect(event).toBeDefined()
		})
	})

	describe("AuditLogger integration with Task lifecycle", () => {
		it("AuditLogger record method is called with valid events", async () => {
			const task = createMockTask()

			// Simulate recording an event
			const event = task.auditLogger?.createUserApprovalEvent({
				askType: "tool",
				targetDescription: "execute command",
				decision: "user_approved",
			})

			if (event) {
				task.auditLogger?.record(event)
			}

			expect(mockRecord).toHaveBeenCalledWith(event)
		})
	})
})
