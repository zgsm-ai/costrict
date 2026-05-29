import path from "node:path"
import { describe, expect, it, vi, beforeEach } from "vitest"
import type { AxiosRequestConfig } from "axios"
import type { ReviewTarget } from "../../../../shared/codeReview"
import { ReviewTargetType } from "../../../../shared/codeReview"
import {
	buildReviewRequestOptions,
	getFullReportJsonlPath,
	getReviewReportJsonPath,
	getReviewReportJsonRelativePath,
	getReviewReportMdPath,
	getReviewReportMdRelativePath,
	resolveFromReportFile,
	resolveFromReportText,
} from "./reviewIssueResolver"
import type { ResolveInput } from "./reviewIssueResolver"

const reportIssueMock = vi.fn()
const getClientIdMock = vi.fn(() => "test-client-id")

vi.mock("uuid", () => ({
	v7: vi.fn(() => "test-uuid-1234"),
}))

vi.mock("../api", () => ({
	reportIssue: (...args: any[]) => reportIssueMock(...args),
}))

vi.mock("../../../../utils/getClientId", () => ({
	getClientId: () => getClientIdMock(),
}))

vi.mock("../../../../shared/headers", () => ({
	COSTRICT_DEFAULT_HEADERS: { "X-Custom": "custom-value" },
}))

vi.mock("node:fs/promises", () => ({
	readFile: vi.fn(),
}))

const mockRequestOptions: AxiosRequestConfig = {
	baseURL: "https://api.test.com",
	headers: { Authorization: "Bearer test-key" },
}

const mockTarget: ReviewTarget = {
	type: ReviewTargetType.FILE,
	data: [{ file_path: "src/test.ts" }],
}

function makeInput(overrides: Partial<ResolveInput> = {}): ResolveInput {
	return {
		source: "classic",
		reviewTarget: mockTarget,
		workspace: "/ws",
		requestOptions: mockRequestOptions,
		...overrides,
	}
}

describe("reviewIssueResolver shared helpers", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	describe("report paths", () => {
		const cwd = "/workspace"

		it("returns JSON report paths by mode", () => {
			expect(getReviewReportJsonPath(cwd, "review")).toBe(
				path.resolve(cwd, "code-review_result", "review-report.json"),
			)
			expect(getReviewReportJsonPath(cwd, "security-review")).toBe(
				path.resolve(cwd, "security-review_result", "review-report.json"),
			)
		})

		it("returns Markdown report paths by mode", () => {
			expect(getReviewReportMdPath(cwd, "review")).toBe(
				path.resolve(cwd, "code-review_result", "review-report.md"),
			)
			expect(getReviewReportMdPath(cwd, "security-review")).toBe(
				path.resolve(cwd, "security-review_result", "task_summary.md"),
			)
		})

		it("returns legacy full_report.jsonl paths", () => {
			expect(getFullReportJsonlPath(cwd, "review")).toBe(
				path.resolve(cwd, "code-review_result", "full_report.jsonl"),
			)
			expect(getFullReportJsonlPath(cwd, "security-review")).toBe(
				path.resolve(cwd, "security-review_result", "full_report.jsonl"),
			)
		})

		it("returns relative paths for watchers", () => {
			expect(getReviewReportJsonRelativePath("review")).toBe("code-review_result/review-report.json")
			expect(getReviewReportJsonRelativePath("security-review")).toBe("security-review_result/review-report.json")
			expect(getReviewReportMdRelativePath("review")).toBe("code-review_result/review-report.md")
			expect(getReviewReportMdRelativePath("security-review")).toBe("security-review_result/task_summary.md")
		})
	})

	describe("buildReviewRequestOptions", () => {
		it("builds config with all fields populated", () => {
			const result = buildReviewRequestOptions({
				apiKey: "test-api-key",
				baseURL: "https://api.example.com",
				language: "zh-CN",
			})

			expect(result.baseURL).toBe("https://api.example.com")
			expect(result.headers).toBeDefined()
			expect(result.headers!["Authorization"]).toBe("Bearer test-api-key")
			expect(result.headers!["Accept-Language"]).toBe("zh-CN")
			expect(result.headers!["X-Request-ID"]).toBe("test-uuid-1234")
			expect(result.headers!["X-Custom"]).toBe("custom-value")
			expect(result.timeout).toBe(10 * 60 * 1000)
		})

		it("handles empty apiKey gracefully", () => {
			const result = buildReviewRequestOptions({
				apiKey: "",
				baseURL: "https://api.example.com",
				language: "en",
			})

			expect(result.headers!["Authorization"]).toBe("Bearer ")
		})
	})

	describe("resolveFromReportText", () => {
		it("calls reportIssue with the correct parameters", async () => {
			reportIssueMock.mockResolvedValue({
				data: {
					review_task_id: "task-1",
					count: 2,
					issues: [
						{ id: "issue-1", file_path: "src/a.ts", start_line: 1, end_line: 1, message: "test" },
						{ id: "issue-2", file_path: "src/b.ts", start_line: 2, end_line: 2, message: "test2" },
					],
					title: "Review Title",
					conclusion: "All good",
				},
			})

			const result = await resolveFromReportText("report content", makeInput())

			expect(result.issues).toHaveLength(2)
			expect(result.review_task_id).toBe("task-1")
			expect(result.count).toBe(2)
			expect(result.title).toBe("Review Title")
			expect(result.conclusion).toBe("All good")

			expect(reportIssueMock).toHaveBeenCalledTimes(1)
			const callArgs = reportIssueMock.mock.calls[0][0]
			expect(callArgs.review_report).toBe("report content")
			expect(callArgs.client_id).toBe("test-client-id")
			expect(callArgs.workspace).toBe("/ws")
			expect(callArgs.source).toBe("classic")
			expect(callArgs.review_target).toEqual(mockTarget)
		})

		it("passes source correctly for cloud", async () => {
			reportIssueMock.mockResolvedValue({
				data: { review_task_id: "t1", count: 0, issues: [], title: "", conclusion: "" },
			})

			await resolveFromReportText("report", makeInput({ source: "cloud" }))

			expect(reportIssueMock.mock.calls[0][0].source).toBe("cloud")
		})

		it("returns empty result when API throws", async () => {
			reportIssueMock.mockRejectedValue(new Error("Network error"))

			const result = await resolveFromReportText("report", makeInput())

			expect(result.issues).toEqual([])
			expect(result.review_task_id).toBe("")
			expect(result.count).toBe(0)
			expect(result.title).toBe("")
			expect(result.conclusion).toBe("")
		})

		it("returns empty result when API returns null data", async () => {
			reportIssueMock.mockResolvedValue({ data: undefined })

			const result = await resolveFromReportText("report", makeInput())

			expect(result.issues).toEqual([])
			expect(result.review_task_id).toBe("")
		})
	})

	describe("resolveFromReportFile", () => {
		it("reads file and delegates to reportIssue", async () => {
			const { readFile } = await import("node:fs/promises")
			const readFileMock = readFile as any
			readFileMock.mockResolvedValue("file report content")

			reportIssueMock.mockResolvedValue({
				data: {
					review_task_id: "task-file",
					count: 1,
					issues: [{ id: "f1", file_path: "src/f.ts", start_line: 1, end_line: 1, message: "file issue" }],
					title: "File Review",
					conclusion: "OK",
				},
			})

			const result = await resolveFromReportFile("/path/to/review-report.json", makeInput())

			expect(result.issues).toHaveLength(1)
			expect(result.review_task_id).toBe("task-file")
			expect(result.reportPath).toBe("/path/to/review-report.json")
			expect(readFileMock).toHaveBeenCalledWith("/path/to/review-report.json", "utf-8")
		})

		it("returns empty result when file read fails", async () => {
			const { readFile } = await import("node:fs/promises")
			const readFileMock = readFile as any
			readFileMock.mockRejectedValue(new Error("ENOENT: no such file"))

			const result = await resolveFromReportFile("/nonexistent.json", makeInput())

			expect(result.issues).toEqual([])
			expect(result.review_task_id).toBe("")
			expect(result.reportPath).toBeUndefined()
		})

		it("returns empty result when API fails after file read succeeds", async () => {
			const { readFile } = await import("node:fs/promises")
			const readFileMock = readFile as any
			readFileMock.mockResolvedValue("valid content")

			reportIssueMock.mockRejectedValue(new Error("API down"))

			const result = await resolveFromReportFile("/valid.json", makeInput())

			expect(result.issues).toEqual([])
			expect(result.review_task_id).toBe("")
		})
	})
})
