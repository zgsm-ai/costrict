import { describe, expect, it, vi } from "vitest"

const { mockReportTaskSummary, mockCaptureTaskCompleted } = vi.hoisted(() => ({
	mockReportTaskSummary: vi.fn().mockResolvedValue(undefined),
	mockCaptureTaskCompleted: vi.fn(),
}))

import { attemptCompletionTool } from "../AttemptCompletionTool"

vi.mock("../../costrict/telemetry", () => ({
	getRawTaskReporter: vi.fn(() => ({
		reportTaskSummary: mockReportTaskSummary,
	})),
}))

vi.mock("@roo-code/telemetry", () => ({
	TelemetryService: {
		instance: {
			captureTaskCompleted: mockCaptureTaskCompleted,
		},
	},
}))

describe("AttemptCompletionTool raw telemetry integration", () => {
	it("emits TaskCompleted via TelemetryService and task event after final token usage update", () => {
		const task = {
			taskId: "task-1",
			toolUsage: {},
			emitFinalTokenUsageUpdate: vi.fn(),
			getTokenUsage: vi.fn(() => ({ inputTokens: 1, outputTokens: 2 })),
			emit: vi.fn(),
		} as any

		;(attemptCompletionTool as any).emitTaskCompleted(task)

		expect(task.emitFinalTokenUsageUpdate).toHaveBeenCalled()
		// NOTE: emitTaskCompleted no longer calls reportTaskSummary.
		// The current implementation only calls emitFinalTokenUsageUpdate,
		// TelemetryService.instance.captureTaskCompleted, and task.emit.
		expect(mockReportTaskSummary).not.toHaveBeenCalled()
		expect(mockCaptureTaskCompleted).toHaveBeenCalledWith("task-1")
		expect(task.emit).toHaveBeenCalledWith("taskCompleted", "task-1", { inputTokens: 1, outputTokens: 2 }, {})
	})
})
