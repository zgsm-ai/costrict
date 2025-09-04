import * as vscode from "vscode"
import { userInfo } from "os"
import fs from "fs"

export const SHELL_PATHS = {
	// Windows paths
	POWERSHELL_7: "C:\\Program Files\\PowerShell\\7\\pwsh.exe",
	POWERSHELL_LEGACY: "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
	CMD: "C:\\Windows\\System32\\cmd.exe",
	GITBASH: "C:\\Program Files\\Git\\bin\\bash.exe",
	WSL_BASH: "/bin/bash",
	// Unix paths
	MAC_DEFAULT: "/bin/zsh",
	LINUX_DEFAULT: "/bin/bash",
	CSH: "/bin/csh",
	BASH: "/bin/bash",
	KSH: "/bin/ksh",
	SH: "/bin/sh",
	ZSH: "/bin/zsh",
	DASH: "/bin/dash",
	TCSH: "/bin/tcsh",
	FALLBACK: "/bin/sh",
} as const

interface MacTerminalProfile {
	path?: string
}

type MacTerminalProfiles = Record<string, MacTerminalProfile>

interface WindowsTerminalProfile {
	path?: string
	source?: "PowerShell" | "WSL"
}

type WindowsTerminalProfiles = Record<string, WindowsTerminalProfile>

interface LinuxTerminalProfile {
	path?: string
}

type LinuxTerminalProfiles = Record<string, LinuxTerminalProfile>

// -----------------------------------------------------
// 1) VS Code Terminal Configuration Helpers
// -----------------------------------------------------

function getWindowsTerminalConfig() {
	try {
		const config = vscode.workspace.getConfiguration("terminal.integrated")
		const defaultProfileName = config.get<string>("defaultProfile.windows")
		const profiles = config.get<WindowsTerminalProfiles>("profiles.windows") || {}
		return { defaultProfileName, profiles }
	} catch {
		return { defaultProfileName: null, profiles: {} as WindowsTerminalProfiles }
	}
}

function getMacTerminalConfig() {
	try {
		const config = vscode.workspace.getConfiguration("terminal.integrated")
		const defaultProfileName = config.get<string>("defaultProfile.osx")
		const profiles = config.get<MacTerminalProfiles>("profiles.osx") || {}
		return { defaultProfileName, profiles }
	} catch {
		return { defaultProfileName: null, profiles: {} as MacTerminalProfiles }
	}
}

function getLinuxTerminalConfig() {
	try {
		const config = vscode.workspace.getConfiguration("terminal.integrated")
		const defaultProfileName = config.get<string>("defaultProfile.linux")
		const profiles = config.get<LinuxTerminalProfiles>("profiles.linux") || {}
		return { defaultProfileName, profiles }
	} catch {
		return { defaultProfileName: null, profiles: {} as LinuxTerminalProfiles }
	}
}

// -----------------------------------------------------
// 2) Platform-Specific VS Code Shell Retrieval
// -----------------------------------------------------

/** Attempts to retrieve a shell path from VS Code config on Windows. */
function getWindowsShellFromVSCode(): string | null {
	const { defaultProfileName, profiles } = getWindowsTerminalConfig()
	if (!defaultProfileName) {
		return null
	}

	const profile = profiles[defaultProfileName]

	// If the profile name indicates PowerShell, do version-based detection.
	// In testing it was found these typically do not have a path, and this
	// implementation manages to deductively get the correct version of PowerShell
	if (defaultProfileName.toLowerCase().includes("powershell")) {
		if (profile?.path) {
			// If there's an explicit PowerShell path, return that
			return profile.path
		}
		// For all other PowerShell cases, use intelligent detection
		return getPowerShellPathFromVSCodeAPI()
	}

	// If there's a specific path, return that immediately
	if (profile?.path) {
		return profile.path
	}

	// If the profile indicates WSL
	if (profile?.source === "WSL" || defaultProfileName.toLowerCase().includes("wsl")) {
		return SHELL_PATHS.WSL_BASH
	}

	// If the profile indicates Git Bash
	if (defaultProfileName.toLowerCase().includes("bash")) {
		return SHELL_PATHS.GITBASH
	}

	// If nothing special detected, we assume cmd
	return SHELL_PATHS.CMD
}

/**
 * Gets the actual PowerShell path using VS Code API and system detection.
 * This function attempts to detect the actual PowerShell version installed
 * on the system rather than making assumptions based on configuration.
 */
function getPowerShellPathFromVSCodeAPI(): string {
	try {
		// First, try to get shell information from VS Code's terminal service
		const terminals = vscode.window.terminals
		if (terminals && terminals.length > 0) {
			// Look for an existing PowerShell terminal to get its actual path
			for (const terminal of terminals) {
				if (terminal.name.toLowerCase().includes("powershell")) {
					// Try to get the actual shell path from the terminal's creation options
					// Note: This is a best-effort approach as VS Code API doesn't directly expose this
					const terminalOptions = (terminal as any).creationOptions
					if (terminalOptions && terminalOptions.shellPath) {
						return terminalOptions.shellPath
					}
				}
			}
		}

		// If no existing terminals found, fall back to system detection
		return detectActualPowerShellVersion()
	} catch (error) {
		console.warn("[getPowerShellPathFromVSCodeAPI] Failed to get PowerShell path from VS Code API:", error)
		// Fall back to conservative detection
		return detectActualPowerShellVersion()
	}
}

/**
 * Detects the actual PowerShell version installed on the system.
 * This function checks for PowerShell 7 first, then falls back to PowerShell 5.
 */
function detectActualPowerShellVersion(): string {
	// Check if PowerShell 7 is installed
	const ps7Path = SHELL_PATHS.POWERSHELL_7
	try {
		if (fs.existsSync(ps7Path)) {
			// Verify it's actually executable by checking if it's a file
			const stats = fs.statSync(ps7Path)
			if (stats.isFile()) {
				return ps7Path
			}
		}
	} catch (error) {
		// Ignore file system errors and continue to fallback
		console.debug("[detectActualPowerShellVersion] PowerShell 7 not accessible:", error)
	}

	// Fall back to PowerShell 5 (legacy) - always available on Windows 10/11
	const ps5Path = SHELL_PATHS.POWERSHELL_LEGACY
	try {
		if (fs.existsSync(ps5Path)) {
			const stats = fs.statSync(ps5Path)
			if (stats.isFile()) {
				return ps5Path
			}
		}
	} catch (error) {
		console.debug("[detectActualPowerShellVersion] PowerShell 5 not accessible:", error)
	}

	// Ultimate fallback - use COMSPEC (cmd.exe)
	console.warn("[detectActualPowerShellVersion] No PowerShell found, falling back to cmd.exe")
	return process.env.COMSPEC || SHELL_PATHS.CMD
}

/** Attempts to retrieve a shell path from VS Code config on macOS. */
function getMacShellFromVSCode(): string | null {
	const { defaultProfileName, profiles } = getMacTerminalConfig()
	if (!defaultProfileName) {
		return null
	}

	const profile = profiles[defaultProfileName]
	return profile?.path || null
}

/** Attempts to retrieve a shell path from VS Code config on Linux. */
function getLinuxShellFromVSCode(): string | null {
	const { defaultProfileName, profiles } = getLinuxTerminalConfig()
	if (!defaultProfileName) {
		return null
	}

	const profile = profiles[defaultProfileName]
	return profile?.path || null
}

// -----------------------------------------------------
// 3) General Fallback Helpers
// -----------------------------------------------------

/**
 * Tries to get a user’s shell from os.userInfo() (works on Unix if the
 * underlying system call is supported). Returns null on error or if not found.
 */
function getShellFromUserInfo(): string | null {
	try {
		const { shell } = userInfo()
		return shell || null
	} catch {
		return null
	}
}

/** Returns the environment-based shell variable, or null if not set. */
function getShellFromEnv(): string | null {
	const { env } = process

	if (process.platform === "win32") {
		// On Windows, COMSPEC typically holds cmd.exe
		return env.COMSPEC || "C:\\Windows\\System32\\cmd.exe"
	}

	if (process.platform === "darwin") {
		// On macOS/Linux, SHELL is commonly the environment variable
		return env.SHELL || "/bin/zsh"
	}

	if (process.platform === "linux") {
		// On Linux, SHELL is commonly the environment variable
		return env.SHELL || "/bin/bash"
	}
	return null
}

// -----------------------------------------------------
// 4) Publicly Exposed Shell Getter
// -----------------------------------------------------

/**
 * Gets the system shell path
 *
 * Detects shell in the following priority order:
 * 1. VSCode configuration (platform-specific)
 * 2. os.userInfo()
 * 3. System detection (detectSystemAvailableShell)
 * 4. Environment variables (SHELL/COMSPEC)
 * 5. Platform default values
 *
 * @returns Detected shell executable path
 */
export function getShell(): string {
	// 1. Check VS Code config first.
	if (process.platform === "win32") {
		// Special logic for Windows
		const windowsShell = getWindowsShellFromVSCode()
		if (windowsShell) {
			return windowsShell
		}
	} else if (process.platform === "darwin") {
		// macOS from VS Code
		const macShell = getMacShellFromVSCode()
		if (macShell) {
			return macShell
		}
	} else if (process.platform === "linux") {
		// Linux from VS Code
		const linuxShell = getLinuxShellFromVSCode()
		if (linuxShell) {
			return linuxShell
		}
	}

	// 2. If no shell from VS Code, try userInfo()
	const userInfoShell = getShellFromUserInfo()
	if (userInfoShell) {
		return userInfoShell
	}

	// 3. Try system detection
	const systemShell = detectSystemAvailableShell()
	if (systemShell) {
		return systemShell
	}

	// 4. If still nothing, try environment variable
	const envShell = getShellFromEnv()
	if (envShell) {
		return envShell
	}

	// 5. Finally, fall back to a default
	if (process.platform === "win32") {
		// On Windows, if we got here, we have no config, no COMSPEC, and one very messed up operating system.
		// Use CMD as a last resort
		return SHELL_PATHS.CMD
	}
	// On macOS/Linux, fallback to a POSIX shell - This is the behavior of our old shell detection method.
	return SHELL_PATHS.FALLBACK
}

/**
 * Detects the shell type that VSCode would choose when no default shell is configured.
 * Mimics VSCode's default shell selection logic.
 * @returns The shell path that VSCode would default to, or null if unable to detect
 */
function detectSystemAvailableShell(): string | null {
	if (process.platform === "win32") {
		return detectWindowsVSCodeDefaultShell()
	} else if (process.platform === "darwin") {
		return detectMacVSCodeDefaultShell()
	} else if (process.platform === "linux") {
		return detectLinuxVSCodeDefaultShell()
	}
	return null
}

/**
 * Detects VSCode's default shell on Windows platform.
 * VSCode priority on Windows: PowerShell > CMD
 */
function detectWindowsVSCodeDefaultShell(): string | null {
	// VSCode on Windows prefers PowerShell 7, then PowerShell 5, finally CMD
	try {
		if (fs.existsSync(SHELL_PATHS.POWERSHELL_7)) {
			const stats = fs.statSync(SHELL_PATHS.POWERSHELL_7)
			if (stats.isFile()) {
				return SHELL_PATHS.POWERSHELL_7
			}
		}
	} catch (error) {
		console.debug("[detectWindowsVSCodeDefaultShell] PowerShell 7 detection failed:", error)
	}

	try {
		if (fs.existsSync(SHELL_PATHS.POWERSHELL_LEGACY)) {
			const stats = fs.statSync(SHELL_PATHS.POWERSHELL_LEGACY)
			if (stats.isFile()) {
				return SHELL_PATHS.POWERSHELL_LEGACY
			}
		}
	} catch (error) {
		console.debug("[detectWindowsVSCodeDefaultShell] PowerShell 5 detection failed:", error)
	}

	// Final fallback to CMD (VSCode can always find CMD)
	return process.env.COMSPEC || SHELL_PATHS.CMD
}

/**
 * Detects VSCode's default shell on macOS platform.
 * VSCode on macOS uses the system default shell (usually zsh)
 */
function detectMacVSCodeDefaultShell(): string | null {
	// VSCode on macOS uses the system default shell
	// macOS Catalina (10.15) and later default to zsh
	try {
		if (fs.existsSync(SHELL_PATHS.ZSH)) {
			const stats = fs.statSync(SHELL_PATHS.ZSH)
			if (stats.isFile()) {
				return SHELL_PATHS.ZSH
			}
		}
	} catch (error) {
		console.debug("[detectMacVSCodeDefaultShell] zsh detection failed:", error)
	}

	// Fallback to bash (older macOS versions)
	try {
		if (fs.existsSync(SHELL_PATHS.BASH)) {
			const stats = fs.statSync(SHELL_PATHS.BASH)
			if (stats.isFile()) {
				return SHELL_PATHS.BASH
			}
		}
	} catch (error) {
		console.debug("[detectMacVSCodeDefaultShell] bash detection failed:", error)
	}

	// Use environment variable SHELL or default value
	return process.env.SHELL || SHELL_PATHS.MAC_DEFAULT
}

/**
 * Detects VSCode's default shell on Linux platform.
 * VSCode on Linux uses the system default shell (usually bash)
 */
function detectLinuxVSCodeDefaultShell(): string | null {
	// VSCode on Linux uses the system default shell
	// Most Linux distributions default to bash
	try {
		if (fs.existsSync(SHELL_PATHS.BASH)) {
			const stats = fs.statSync(SHELL_PATHS.BASH)
			if (stats.isFile()) {
				return SHELL_PATHS.BASH
			}
		}
	} catch (error) {
		console.debug("[detectLinuxVSCodeDefaultShell] bash detection failed:", error)
	}

	// Check other common bash locations
	try {
		const altBashPath = "/usr/bin/bash"
		if (fs.existsSync(altBashPath)) {
			const stats = fs.statSync(altBashPath)
			if (stats.isFile()) {
				return altBashPath
			}
		}
	} catch (error) {
		console.debug("[detectLinuxVSCodeDefaultShell] /usr/bin/bash detection failed:", error)
	}

	// Use environment variable SHELL or default value
	return process.env.SHELL || SHELL_PATHS.LINUX_DEFAULT
}

/**
 * Gets the available system shell type.
 * Simplified version that directly calls system detection.
 * @returns Detected shell path, or null if unable to detect
 */
export function getActiveTerminalShellType(): string | null {
	return detectSystemAvailableShell()
}
