// Public API: only export the main controller and necessary types
export { RemoteAgentInstaller } from "./RemoteAgentInstaller"
export type {
	InstallResult,
	UninstallResult,
	InstallState,
	ResourcePackageVersion,
	LocalInstallRecord,
	InstalledManifest,
	ZipManifest,
	ModuleType,
	FatalErrorCode,
} from "./types"
export { FatalInstallerError } from "./types"
