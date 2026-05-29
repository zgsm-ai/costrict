/**
 * Review Issue Resolver
 *
 * Small shared module for review report artifacts. It intentionally keeps the
 * related helpers together to avoid scattering tiny files across common/:
 * - report path constants/builders
 * - review API request option builder
 * - report file/text -> issue resolution
 *
 * Used by both classic (CodeReviewService) and cloud (report watcher) paths.
 */

import path from "node:path"
import { readFile } from "node:fs/promises"
import type { AxiosRequestConfig } from "axios"
import { v7 as uuidv7 } from "uuid"

import type { ReviewTarget, ReviewIssue } from "../../../../shared/codeReview"
import type { Mode } from "../../../../shared/modes"
import { COSTRICT_DEFAULT_HEADERS } from "../../../../shared/headers"
import { getClientId } from "../../../../utils/getClientId"
import { reportIssue } from "../api"

// ── Report paths ───────────────────────────────────────────────────────

export const CODE_REVIEW_RESULT_DIR = "code-review_result"
export const SECURITY_REVIEW_RESULT_DIR = "security-review_result"
export const REVIEW_REPORT_JSON = "review-report.json"
export const REVIEW_REPORT_MD = "review-report.md"
export const SECURITY_REPORT_MD = "task_summary.md"
export const FULL_REPORT_JSONL = "full_report.jsonl"

function getResultDir(mode: Mode): string {
	return mode === "security-review" ? SECURITY_REVIEW_RESULT_DIR : CODE_REVIEW_RESULT_DIR
}

export function getReviewReportJsonPath(cwd: string, mode: Mode): string {
	return path.resolve(cwd, getResultDir(mode), REVIEW_REPORT_JSON)
}

export function getReviewReportMdPath(cwd: string, mode: Mode): string {
	const fileName = mode === "security-review" ? SECURITY_REPORT_MD : REVIEW_REPORT_MD
	return path.resolve(cwd, getResultDir(mode), fileName)
}

export function getFullReportJsonlPath(cwd: string, mode: Mode): string {
	return path.resolve(cwd, getResultDir(mode), FULL_REPORT_JSONL)
}

export function getReviewReportJsonRelativePath(mode: Mode): string {
	return `${getResultDir(mode)}/${REVIEW_REPORT_JSON}`
}

export function getReviewReportMdRelativePath(mode: Mode): string {
	const fileName = mode === "security-review" ? SECURITY_REPORT_MD : REVIEW_REPORT_MD
	return `${getResultDir(mode)}/${fileName}`
}

// ── Request options ────────────────────────────────────────────────────

export interface ReviewRequestOptionsInput {
	/** API access token (costrictAccessToken from provider state) */
	apiKey: string
	/** API base URL */
	baseURL: string
	/** Language for Accept-Language header (e.g. "en", "zh-CN") */
	language: string
}

export function buildReviewRequestOptions(input: ReviewRequestOptionsInput): AxiosRequestConfig {
	return {
		baseURL: input.baseURL,
		headers: {
			Authorization: `Bearer ${input.apiKey}`,
			"Accept-Language": input.language,
			"X-Request-ID": uuidv7(),
			...COSTRICT_DEFAULT_HEADERS,
		},
		timeout: 10 * 60 * 1000,
	}
}

// ── Issue resolution ───────────────────────────────────────────────────

export interface ResolveInput {
	/** Source identifier for the reportIssue API */
	source: "classic" | "cloud"
	/** The review target (file, folder, code, commit) */
	reviewTarget: ReviewTarget
	/** Workspace root path (Posix) */
	workspace: string
	/** Axios request config for the reportIssue API call */
	requestOptions: AxiosRequestConfig
}

export interface ResolveResult {
	/** Resolved issues from the API */
	issues: ReviewIssue[]
	/** Review task ID from the API */
	review_task_id: string
	/** Number of issues reported */
	count: number
	/** Review title from the API */
	title: string
	/** Review conclusion from the API */
	conclusion: string
	/** Path to the report file, if resolved from file */
	reportPath?: string
}

function emptyResult(): ResolveResult {
	return {
		issues: [],
		review_task_id: "",
		count: 0,
		title: "",
		conclusion: "",
	}
}

/**
 * Read a JSON report file from disk and resolve issues via the reportIssue API.
 *
 * This helper never throws. It returns an empty result on any read/API error so
 * callers can decide whether to fallback or surface an error.
 */
export async function resolveFromReportFile(jsonPath: string, input: ResolveInput): Promise<ResolveResult> {
	try {
		const content = await readFile(jsonPath, "utf-8")
		const result = await resolveFromReportText(content, input)
		return { ...result, reportPath: jsonPath }
	} catch (error) {
		console.error("[resolveFromReportFile] Failed:", error)
		return emptyResult()
	}
}

/**
 * Call the reportIssue API directly with a raw report text string.
 *
 * Used by the classic path as a fallback when the JSON report file is not
 * available (e.g. report text comes from in-memory clineMessages or the
 * legacy full_report.jsonl file).
 */
export async function resolveFromReportText(reportText: string, input: ResolveInput): Promise<ResolveResult> {
	try {
		const clientId = getClientId()
		const { data } = await reportIssue(
			{
				review_report: reportText,
				client_id: clientId,
				workspace: input.workspace,
				source: input.source,
				review_target: input.reviewTarget,
			},
			input.requestOptions,
		)
		return data ?? emptyResult()
	} catch (error) {
		console.error("[resolveFromReportText] Failed:", error)
		return emptyResult()
	}
}
