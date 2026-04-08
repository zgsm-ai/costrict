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
	it("reports task summary before emitting TaskCompleted", () => {
		const task = {
			taskId: "task-1",
			toolUsage: {},
			emitFinalTokenUsageUpdate: vi.fn(),
			getTokenUsage: vi.fn(() => ({ inputTokens: 1, outputTokens: 2 })),
			emit: vi.fn(),
		} as any

		;(attemptCompletionTool as any).emitTaskCompleted(task)

		expect(task.emitFinalTokenUsageUpdate).toHaveBeenCalled()
		expect(mockReportTaskSummary).toHaveBeenCalledWith(task)
		expect(mockCaptureTaskCompleted).toHaveBeenCalledWith("task-1")
		expect(task.emit).toHaveBeenCalledWith("taskCompleted", "task-1", { inputTokens: 1, outputTokens: 2 }, {})
	})
})
