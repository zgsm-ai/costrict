import os from "os"
import path from "path"

import * as vscode from "vscode"
import { getClientId } from "./getClientId"
import osName from "os-name"
import { Package } from "../shared/package"
import { API as GitAPI, GitExtension } from "../core/costrict/code-review/git"

export function getParams(state: string, ignore: string[] = []) {
	return [
		["machine_code", getClientId()],
		["state", state],
		["provider", "casdoor"],
		["plugin_version", Package.version],
		["vscode_version", vscode.version],
		["uri_scheme", vscode.env.uriScheme],
	].filter(([key]) => !ignore.includes(key))
}

export async function retryWrapper<T>(
	rid: string,
	fn: () => Promise<T>,
	interval = (attempt: number) => 1000 * Math.pow(2, attempt),
	maxAttempt = 3,
): Promise<T> {
	let lastError: Error | undefined
	const _maxAttempt = Math.max(1, maxAttempt)
	let attempt = 0
	for (; attempt < _maxAttempt; attempt++) {
		try {
			return await fn()
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error))
			console.warn(`[${rid}] Attempt ${attempt + 1} failed:`, lastError.message)
			await new Promise((resolve) => setTimeout(resolve, interval(attempt)))
		}
	}
	throw lastError || new Error(`Operation failed after ${attempt} attempts`)
}

export function getLocalIP(): string {
	try {
		const interfaces = os.networkInterfaces()
		for (const key in interfaces) {
			for (const alias of interfaces[key] ?? []) {
				if (alias.family === "IPv4" && alias.address !== "127.0.0.1" && !alias.internal) {
					return alias.address
				}
			}
		}
	} catch (error) {
		console.log(`[zgsm getLocalIP]: ${error.message}`)
	}

	return "127.0.0.1"
}

function getSafeOperatingSystemName(): string {
	try {
		return osName(os.platform(), os.release())
	} catch (error) {
		console.warn(`[zgsm getOperatingSystem] os-name failed: ${error.message}`)

		const platform = os.platform()
		const release = os.release()

		const platformMap: Record<string, string> = {
			win32: "Windows",
			darwin: "macOS",
			linux: "Linux",
			freebsd: "FreeBSD",
			openbsd: "OpenBSD",
			sunos: "SunOS",
			aix: "AIX",
		}

		const platformName = platformMap[platform] || platform

		try {
			if (platform === "win32") {
				const majorVersion = parseInt(release.split(".")[0], 10)
				const versionMap: Record<number, string> = {
					10: "Windows 10/11",
					6: "Windows Vista/7/8",
					5: "Windows XP/2000",
				}
				return versionMap[majorVersion] || `Windows ${release}`
			} else if (platform === "darwin") {
				const versionParts = release.split(".")
				if (versionParts.length >= 2) {
					const major = parseInt(versionParts[0], 10)
					const minor = parseInt(versionParts[1], 10)
					return `macOS ${major}.${minor}`
				}
			}

			return `${platformName} ${release}`
		} catch (innerError) {
			console.warn(`[zgsm getOperatingSystem] Fallback failed: ${innerError.message}`)
			return platformName
		}
	}
}

let operatingSystem = ""

export const getOperatingSystem = () => {
	if (operatingSystem) return operatingSystem
	return (operatingSystem = getSafeOperatingSystemName())
}

export type ShowFileDiffParams = {
	cwd: string
	filePath: string
	status: string
	oldFilePath?: string
}

export async function showFileDiffFromGitStatus(params: ShowFileDiffParams): Promise<void> {
	try {
		const { cwd, filePath, status, oldFilePath } = params

		if (!cwd || !filePath || !status) {
			console.error("Missing required parameters for showFileDiffFromGitStatus")
			return
		}

		// NOTE: `filePath` comes from `git status --porcelain` and is typically relative to repo root,
		// not necessarily to the current task cwd. Always resolve against the repository root.

		// Get Git API
		const gitExtension = vscode.extensions.getExtension<GitExtension>("vscode.git")
		if (!gitExtension) {
			vscode.window.showErrorMessage("Git extension not found")
			return
		}

		const git = gitExtension.exports
		if (!git.enabled) {
			vscode.window.showErrorMessage("Git is not enabled")
			return
		}

		const gitApi: GitAPI = git.getAPI(1)
		if (!gitApi) {
			vscode.window.showErrorMessage("Failed to get Git API")
			return
		}

		// Resolve repository root based on current cwd first (most reliable), then fall back to file path.
		const cwdUri = vscode.Uri.file(cwd)
		const repo =
			gitApi.getRepository(cwdUri) ||
			(() => {
				const tentativeAbs = path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath)
				return gitApi.getRepository(vscode.Uri.file(tentativeAbs))
			})()
		if (!repo) {
			vscode.window.showErrorMessage("Failed to resolve Git repository for the selected file")
			return
		}

		const repoRootFsPath = repo.rootUri.fsPath
		const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(repoRootFsPath, filePath)
		const fileUri = vscode.Uri.file(absolutePath)

		const toRepoRelative = (absPath: string, fallback: string) => {
			try {
				const rel = path.relative(repoRootFsPath, absPath)
				// If the file is outside repo root, keep fallback for display.
				if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return fallback
				// Normalize to posix-style for stable display/uri ids.
				return rel.split(path.sep).join("/")
			} catch {
				return fallback
			}
		}

		const fileRel = toRepoRelative(absolutePath, filePath)
		const oldAbsolutePath =
			oldFilePath && typeof oldFilePath === "string"
				? path.isAbsolute(oldFilePath)
					? oldFilePath
					: path.join(repoRootFsPath, oldFilePath)
				: undefined
		const oldFileRel = oldAbsolutePath && oldFilePath ? toRepoRelative(oldAbsolutePath, oldFilePath) : undefined

		// Fixed comparison base: HEAD (working tree vs HEAD)
		const leftRef = "HEAD"

		// Handle different file statuses
		const statusRaw = typeof status === "string" ? status : String(status)
		const statusTrim = statusRaw.trim()
		// Make untitled URIs unique (avoid collisions for same basenames).
		const makeEmptyUri = (side: "left" | "right") => vscode.Uri.parse(`untitled:/${side}/${encodeURI(fileRel)}`)

		// Default rightUri (working tree version for M and A)
		const defaultRightUri = fileUri

		let leftUri: vscode.Uri
		let rightUri: vscode.Uri = defaultRightUri

		// Set leftUri based on porcelain v1 status (XY, e.g. " M", "AM", "AU", "R ", etc.)
		// We intentionally use `includes` to support combined statuses like "AM" (added+modified).
		const hasRenameOrCopy = statusRaw.includes("R") || statusRaw.includes("C")
		const hasDeleted = statusRaw.includes("D")
		const hasAdded = statusRaw.includes("A")
		const hasModified = statusRaw.includes("M")
		const isUntracked = statusTrim === "U" || statusTrim === "??" || statusRaw.includes("?")

		if (hasRenameOrCopy) {
			// Renamed / Copied files
			// Compare HEAD:oldPath ↔ Working Tree:newPath when old path is provided.
			if (oldAbsolutePath && oldFilePath && oldFilePath.trim().length > 0) {
				const oldFileUri = vscode.Uri.file(oldAbsolutePath)
				leftUri = gitApi.toGitUri(oldFileUri, leftRef)
				rightUri = fileUri
			} else {
				// Fallback: if we don't know old path, treat like modified on the new path.
				leftUri = gitApi.toGitUri(fileUri, leftRef)
				rightUri = fileUri
			}
		} else if (hasDeleted) {
			// Deleted files
			leftUri = gitApi.toGitUri(fileUri, leftRef)
			rightUri = makeEmptyUri("right")
		} else if (hasAdded || isUntracked) {
			// Added/untracked files (including combinations like "AM" / "AU"):
			// they may not exist in HEAD, so use an empty left side.
			leftUri = makeEmptyUri("left")
			rightUri = fileUri
		} else if (hasModified) {
			// Modified files
			leftUri = gitApi.toGitUri(fileUri, leftRef)
			rightUri = fileUri
		} else {
			// Fallback for other statuses (e.g. conflicts)
			console.warn(`Unsupported file status: ${statusRaw}`)
			leftUri = gitApi.toGitUri(fileUri, leftRef)
			rightUri = fileUri
		}

		// Fixed title format: Working Tree ↔ HEAD
		const titleBase = oldFileRel ? `${oldFileRel} → ${fileRel}` : fileRel
		const title = `${titleBase} (Working Tree ↔ HEAD)`

		// Open diff window
		await vscode.commands.executeCommand("vscode.diff", leftUri, rightUri, title)
	} catch (error) {
		console.error("Error showing file diff:", error)
		vscode.window.showErrorMessage(`Failed to show diff: ${error instanceof Error ? error.message : String(error)}`)
	}
}

export const excludedFileExtensions = [
	// Image files
	".png",
	".jpg",
	".jpeg",
	".gif",
	".bmp",
	".svg",
	".webp",
	".ico",
	// Lock files
	".lock",
	".lock.json",
	"package-lock.json",
	"yarn.lock",
	"pnpm-lock.yaml",
	// Binary files
	".bin",
	".exe",
	".dll",
	".so",
	".dylib",
	".a",
	".lib",
	".o",
	// Archive files
	".zip",
	".tar",
	".gz",
	".bz2",
	".xz",
	".7z",
	".rar",
	".deb",
	".rpm",
	// Font files
	".ttf",
	".otf",
	".woff",
	".woff2",
	".eot",
	// Video files
	".mp4",
	".avi",
	".mov",
	".wmv",
	".flv",
	".webm",
	".mkv",
	// Audio files
	".mp3",
	".wav",
	".flac",
	".aac",
	".ogg",
	".wma",
	// Database files
	".db",
	".sqlite",
	".sqlite3",
	".mdb",
	".accdb",
	// Certificate files
	".pem",
	".crt",
	".cer",
	".key",
	".p12",
	".pfx",
	// Compiled files
	".class",
	".pyc",
	".pyo",
	".pyd",
	".dll",
	".exe",
	".so",
	// Large data files
	".dat",
	".data",
	".log",
	".tmp",
	".temp",
	".vsix",
]
