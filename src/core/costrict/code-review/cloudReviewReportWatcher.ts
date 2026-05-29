import * as vscode from "vscode"

import { getReviewReportMdRelativePath, resolveFromReportFile, type ResolveInput } from "./common/reviewIssueResolver"

// ── Re-export path constants for backward compatibility ────────────────

/** @deprecated Use getReviewReportMdRelativePath("review") instead */
export const CODE_REVIEW_REPORT_RELATIVE_PATH = getReviewReportMdRelativePath("review")

/** @deprecated Use getReviewReportMdRelativePath("security-review") instead */
export const SECURITY_REVIEW_REPORT_RELATIVE_PATH = getReviewReportMdRelativePath("security-review")

const POLL_INTERVAL_MS = 5000
const PREVIEW_REFRESH_DELAY_MS = 500
const STABILITY_CHECK_DELAY_MS = 1000
const JSON_STABILITY_CHECK_DELAY_MS = 1000
const IDLE_COMPLETE_MS = 2 * 60 * 1000
const MAX_WAIT_MS = 30 * 60 * 1000

interface FileSnapshot {
	exists: boolean
	size: number
	mtime: number
}

/**
 * Configuration for watching and resolving a JSON review report.
 * When provided, the watcher will also poll the JSON report and call
 * resolveFromReportFile when it stabilizes.
 */
export interface ResolveConfig {
	/** Resolve input passed to resolveFromReportFile */
	input: ResolveInput
	/** Absolute path to the JSON report file on disk */
	jsonAbsolutePath: string
}

interface JsonResolveState {
	lastResolvedSnapshot: FileSnapshot | undefined
}

interface PendingWatch {
	status: "watching" | "completed"
	workspaceFolder: vscode.WorkspaceFolder
	reportRelativePath: string
	uri: vscode.Uri
	startedAt: number
	baseline?: FileSnapshot
	lastObserved?: FileSnapshot
	previewOpened: boolean
	previewVersion: number
	watcher?: vscode.FileSystemWatcher
	pollInterval?: NodeJS.Timeout
	timeout?: NodeJS.Timeout
	previewRefreshTimer?: NodeJS.Timeout
	stabilityTimer?: NodeJS.Timeout
	idleTimer?: NodeJS.Timeout

	// JSON resolve fields
	resolveConfig?: ResolveConfig
	jsonResolveState?: JsonResolveState
	jsonStabilityTimer?: NodeJS.Timeout
}

let outputChannel: vscode.OutputChannel | undefined
const pendingMap = new Map<string, PendingWatch>()

export function setLogger(channel: vscode.OutputChannel | undefined): void {
	outputChannel = channel
}

export function startWatching(
	workspaceFolder: vscode.WorkspaceFolder,
	reportRelativePath = CODE_REVIEW_REPORT_RELATIVE_PATH,
	resolveConfig?: ResolveConfig,
): void {
	const key = getWorkspaceKey(workspaceFolder)
	const existing = pendingMap.get(key)
	if (existing) {
		disposePending(existing, "replaced by a newer Cloud review")
	}

	const pending: PendingWatch = {
		status: "watching",
		workspaceFolder,
		reportRelativePath,
		uri: vscode.Uri.joinPath(workspaceFolder.uri, reportRelativePath),
		startedAt: Date.now(),
		previewOpened: false,
		previewVersion: 0,
		resolveConfig,
	}
	pendingMap.set(key, pending)

	void readSnapshot(pending.uri).then((snapshot) => {
		if (!isActive(pending)) {
			return
		}
		pending.baseline = snapshot
	})

	// Baseline snapshot for JSON file (independent from MD baseline)
	if (resolveConfig) {
		void readSnapshot(vscode.Uri.file(resolveConfig.jsonAbsolutePath)).then((snapshot) => {
			if (!isActive(pending) || !pending.resolveConfig) {
				return
			}
			pending.jsonResolveState = { lastResolvedSnapshot: snapshot.exists ? undefined : snapshot }
		})
	}

	try {
		const pattern = new vscode.RelativePattern(workspaceFolder, reportRelativePath)
		pending.watcher = vscode.workspace.createFileSystemWatcher(pattern)
		pending.watcher.onDidCreate(() => void checkCandidate(pending))
		pending.watcher.onDidChange(() => void checkCandidate(pending))
	} catch (error) {
		log(`Failed to create report file watcher, falling back to polling: ${formatError(error)}`)
	}

	pending.pollInterval = setInterval(() => {
		void checkCandidate(pending)
		if (pending.resolveConfig) {
			void checkJsonCandidate(pending)
		}
	}, POLL_INTERVAL_MS)

	pending.timeout = setTimeout(() => {
		log(`Stopped waiting for Cloud review report after ${MAX_WAIT_MS / 60000} minutes: ${pending.uri.toString()}`)
		stopWatching(workspaceFolder)
	}, MAX_WAIT_MS)
}

export function stopWatching(workspaceFolder: vscode.WorkspaceFolder): void {
	const pending = pendingMap.get(getWorkspaceKey(workspaceFolder))
	if (!pending) {
		return
	}
	disposePending(pending, "stopped")
}

export function disposeAll(): void {
	for (const pending of Array.from(pendingMap.values())) {
		disposePending(pending, "disposed")
	}
}

// ── Markdown candidate checks (existing behaviour) ──────────────────────

async function checkCandidate(pending: PendingWatch): Promise<void> {
	if (!isActive(pending)) {
		return
	}

	const snapshot = await readSnapshot(pending.uri)
	if (!isActive(pending)) {
		return
	}
	if (!snapshot.exists || snapshot.size <= 0) {
		return
	}
	if (!isNewReport(pending, snapshot)) {
		return
	}
	if (isSameSnapshot(snapshot, pending.lastObserved)) {
		return
	}
	pending.lastObserved = snapshot

	resetIdleTimer(pending)
	schedulePreviewRefresh(pending, snapshot)
	scheduleStabilityCheck(pending, snapshot)
}

function schedulePreviewRefresh(pending: PendingWatch, snapshot: FileSnapshot): void {
	if (!isActive(pending)) {
		return
	}
	if (pending.previewRefreshTimer) {
		clearTimeout(pending.previewRefreshTimer)
	}

	pending.previewRefreshTimer = setTimeout(() => {
		pending.previewRefreshTimer = undefined
		void openOrRefreshPreview(pending, snapshot)
	}, PREVIEW_REFRESH_DELAY_MS)
}

function scheduleStabilityCheck(pending: PendingWatch, snapshot: FileSnapshot): void {
	if (!isActive(pending)) {
		return
	}
	if (pending.stabilityTimer) {
		clearTimeout(pending.stabilityTimer)
	}

	pending.stabilityTimer = setTimeout(() => {
		pending.stabilityTimer = undefined
		void verifyStableAndOpen(pending, snapshot)
	}, STABILITY_CHECK_DELAY_MS)
}

async function verifyStableAndOpen(pending: PendingWatch, previousSnapshot: FileSnapshot): Promise<void> {
	if (!isActive(pending)) {
		return
	}

	const currentSnapshot = await readSnapshot(pending.uri)
	if (!isActive(pending)) {
		return
	}
	if (!currentSnapshot.exists || currentSnapshot.size <= 0) {
		return
	}
	if (!isNewReport(pending, currentSnapshot)) {
		return
	}

	const stable = currentSnapshot.size === previousSnapshot.size && currentSnapshot.mtime <= previousSnapshot.mtime
	if (!stable) {
		scheduleStabilityCheck(pending, currentSnapshot)
		return
	}

	await openOrRefreshPreview(pending, currentSnapshot)
}

async function openOrRefreshPreview(pending: PendingWatch, snapshot: FileSnapshot): Promise<void> {
	if (!isActive(pending)) {
		return
	}

	pending.previewOpened = true
	pending.previewVersion += 1
	resetIdleTimer(pending)

	// VS Code Markdown preview can keep a stale TextDocument cache when a file is
	// overwritten by an external process. A cache-busting query keeps the preview
	// tab dynamic while forcing the Markdown extension to read the latest bytes.
	const previewUri = createPreviewUri(pending, snapshot)
	try {
		await vscode.commands.executeCommand("markdown.showPreview", previewUri)
	} catch (error) {
		log(`Failed to open Cloud review report preview with cache-busting URI: ${formatError(error)}`)
		try {
			await vscode.commands.executeCommand("markdown.showPreview", pending.uri)
		} catch (fallbackError) {
			log(`Failed to open Cloud review report preview: ${formatError(fallbackError)}`)
		}
	}

	try {
		await vscode.commands.executeCommand("markdown.preview.refresh")
	} catch (error) {
		log(`Failed to refresh Cloud review report preview: ${formatError(error)}`)
	}
}

// ── JSON candidate checks (issue resolution) ────────────────────────────

async function checkJsonCandidate(pending: PendingWatch): Promise<void> {
	if (!isActive(pending) || !pending.resolveConfig) {
		return
	}

	const jsonUri = vscode.Uri.file(pending.resolveConfig.jsonAbsolutePath)
	const snapshot = await readSnapshot(jsonUri)

	if (!isActive(pending)) {
		return
	}
	if (!snapshot.exists || snapshot.size <= 0) {
		return
	}

	// Dedup: skip if this snapshot was already resolved
	const lastResolved = pending.jsonResolveState?.lastResolvedSnapshot
	if (isSameSnapshot(snapshot, lastResolved)) {
		return
	}

	// Check if this is a new report created after watching started
	if (!isNewJsonReport(pending, snapshot)) {
		return
	}

	scheduleJsonStabilityCheck(pending, snapshot)
}

function scheduleJsonStabilityCheck(pending: PendingWatch, snapshot: FileSnapshot): void {
	if (!isActive(pending)) {
		return
	}
	if (pending.jsonStabilityTimer) {
		clearTimeout(pending.jsonStabilityTimer)
	}

	pending.jsonStabilityTimer = setTimeout(() => {
		pending.jsonStabilityTimer = undefined
		void verifyJsonStableAndResolve(pending, snapshot)
	}, JSON_STABILITY_CHECK_DELAY_MS)
}

async function verifyJsonStableAndResolve(pending: PendingWatch, previousSnapshot: FileSnapshot): Promise<void> {
	if (!isActive(pending) || !pending.resolveConfig) {
		return
	}

	const jsonUri = vscode.Uri.file(pending.resolveConfig.jsonAbsolutePath)
	const currentSnapshot = await readSnapshot(jsonUri)

	if (!isActive(pending)) {
		return
	}
	if (!currentSnapshot.exists || currentSnapshot.size <= 0) {
		return
	}
	if (!isNewJsonReport(pending, currentSnapshot)) {
		return
	}

	const stable = currentSnapshot.size === previousSnapshot.size && currentSnapshot.mtime <= previousSnapshot.mtime
	if (!stable) {
		scheduleJsonStabilityCheck(pending, currentSnapshot)
		return
	}

	// Perform issue resolution — failure must NOT affect MD preview
	try {
		const result = await resolveFromReportFile(pending.resolveConfig.jsonAbsolutePath, pending.resolveConfig.input)
		pending.jsonResolveState = {
			lastResolvedSnapshot: currentSnapshot,
		}
		log(`Resolved ${result.issues.length} issues from JSON report: ${pending.resolveConfig.jsonAbsolutePath}`)
	} catch (error) {
		log(`Failed to resolve issues from JSON report (MD preview unaffected): ${formatError(error)}`)
	}
}

function isNewJsonReport(pending: PendingWatch, snapshot: FileSnapshot): boolean {
	const lastResolved = pending.jsonResolveState?.lastResolvedSnapshot
	if (!lastResolved) {
		return snapshot.mtime >= pending.startedAt
	}
	return snapshot.mtime > lastResolved.mtime || snapshot.size !== lastResolved.size
}

// ── Shared helpers ──────────────────────────────────────────────────────

function resetIdleTimer(pending: PendingWatch): void {
	if (pending.idleTimer) {
		clearTimeout(pending.idleTimer)
	}
	pending.idleTimer = setTimeout(() => {
		if (!isActive(pending)) {
			return
		}
		log(
			`Cloud review report stayed idle for ${IDLE_COMPLETE_MS / 1000}s, stopping watcher: ${pending.uri.toString()}`,
		)
		stopWatching(pending.workspaceFolder)
	}, IDLE_COMPLETE_MS)
}

async function readSnapshot(uri: vscode.Uri): Promise<FileSnapshot> {
	try {
		const stat = await vscode.workspace.fs.stat(uri)
		return {
			exists: true,
			size: stat.size,
			mtime: stat.mtime,
		}
	} catch {
		return {
			exists: false,
			size: 0,
			mtime: 0,
		}
	}
}

function isNewReport(pending: PendingWatch, snapshot: FileSnapshot): boolean {
	const baseline = pending.baseline
	if (!baseline) {
		return snapshot.mtime >= pending.startedAt
	}
	if (!baseline.exists) {
		return snapshot.exists && snapshot.size > 0
	}
	return snapshot.mtime > baseline.mtime || snapshot.size !== baseline.size || snapshot.mtime >= pending.startedAt
}

function isSameSnapshot(left: FileSnapshot, right: FileSnapshot | undefined): boolean {
	return !!right && left.exists === right.exists && left.size === right.size && left.mtime === right.mtime
}

function isActive(pending: PendingWatch): boolean {
	return pending.status === "watching" && pendingMap.get(getWorkspaceKey(pending.workspaceFolder)) === pending
}

function disposePending(pending: PendingWatch, reason: string): void {
	pending.status = "completed"
	clearTimers(pending)
	pending.watcher?.dispose()
	const key = getWorkspaceKey(pending.workspaceFolder)
	if (pendingMap.get(key) === pending) {
		pendingMap.delete(key)
	}
	log(`Cloud review report watcher ${reason}: ${pending.uri.toString()}`)
}

function clearTimers(pending: PendingWatch): void {
	if (pending.pollInterval) {
		clearInterval(pending.pollInterval)
		pending.pollInterval = undefined
	}
	if (pending.timeout) {
		clearTimeout(pending.timeout)
		pending.timeout = undefined
	}
	if (pending.previewRefreshTimer) {
		clearTimeout(pending.previewRefreshTimer)
		pending.previewRefreshTimer = undefined
	}
	if (pending.stabilityTimer) {
		clearTimeout(pending.stabilityTimer)
		pending.stabilityTimer = undefined
	}
	if (pending.idleTimer) {
		clearTimeout(pending.idleTimer)
		pending.idleTimer = undefined
	}
	if (pending.jsonStabilityTimer) {
		clearTimeout(pending.jsonStabilityTimer)
		pending.jsonStabilityTimer = undefined
	}
}

function createPreviewUri(pending: PendingWatch, snapshot: FileSnapshot): vscode.Uri {
	return pending.uri.with({
		query: `costrictPreview=${pending.startedAt}-${pending.previewVersion}-${snapshot.mtime}-${snapshot.size}`,
		fragment: "",
	})
}

function getWorkspaceKey(workspaceFolder: vscode.WorkspaceFolder): string {
	return workspaceFolder.uri.toString()
}

function log(message: string): void {
	const line = `[CloudReviewReportWatcher] ${message}`
	if (outputChannel) {
		outputChannel.appendLine(line)
		return
	}
	console.warn(line)
}

function formatError(error: unknown): string {
	return error instanceof Error ? error.message : String(error)
}
