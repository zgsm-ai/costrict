/**
 * Core type definitions for remote resource package installer.
 */

export interface ResourcePackageVersion {
	name?: string
	version: string
	downloadUrl?: string
	checksum?: string
	checksumAlgo?: string
	agents?: {
		order?: string[]
	}
}

export type InstallState = "none" | "installed" | "failed"

export interface InstalledManifest {
	agents: string[]
	commands: string[]
	skills: string[]
	rules: string[]
	mcp: string[]
}

export interface LocalInstallRecord {
	schemaVersion: number
	installedVersion: string
	lastCheckedAt: number
	installState: InstallState
	manifest: InstalledManifest
}

export interface ZipManifest {
	version: string
	modules?: string[]
}

export type ModuleType = "agents" | "commands" | "skills" | "rules" | "mcp"

export interface InstallResult {
	state: "installed" | "noUpdate" | "failed"
	version?: string
	reason?: string
}

export interface UninstallResult {
	success: boolean
	reason?: string
}

export type FatalErrorCode =
	| "manifestMissing"
	| "manifestParseError"
	| "manifestVersionMismatch"
	| "yamlParseError"
	| "jsonParseError"
	| "checksumMismatch"
	| "pathTraversal"
	| "reservedDeviceName"

export class FatalInstallerError extends Error {
	code: FatalErrorCode
	constructor(code: FatalErrorCode, message: string) {
		super(message)
		this.name = "FatalInstallerError"
		this.code = code
	}
}
