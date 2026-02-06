import { getShell } from "../../../utils/shell"

/**
 * Returns the appropriate command chaining operator based on the user's shell.
 * - Unix shells (bash, zsh, etc.): `&&` (run next command only if previous succeeds)
 * - PowerShell: `;` (semicolon for command separation)
 * - cmd.exe: `&&` (conditional execution, same as Unix)
 * @internal Exported for testing purposes
 */
export function getCommandChainOperator(): string {
	const shell = getShell().toLowerCase()

	// Check for PowerShell (both Windows PowerShell and PowerShell Core)
	if (shell.includes("powershell") || shell.includes("pwsh")) {
		return ";"
	}

	// Check for cmd.exe
	if (shell.includes("cmd.exe")) {
		return "&&"
	}

	// Default to Unix-style && for bash, zsh, sh, and other shells
	// This also covers Git Bash, WSL, and other Unix-like environments on Windows
	return "&&"
}

/**
 * Returns a shell-specific note about command chaining syntax and platform-specific utilities.
 */
export function getCommandChainNote(): string {
	const shell = getShell().toLowerCase()

	// Check for PowerShell
	if (shell.includes("powershell") || shell.includes("pwsh")) {
		return "Note: Using `;` for PowerShell command chaining. For bash/zsh use `&&`, for cmd.exe use `&&`. IMPORTANT: When using PowerShell, avoid Unix-specific utilities like `sed`, `grep`, `awk`, `cat`, `rm`, `cp`, `mv`. Instead use PowerShell equivalents: `Select-String` for grep, `Get-Content` for cat, `Remove-Item` for rm, `Copy-Item` for cp, `Move-Item` for mv, and PowerShell's `-replace` operator or `[regex]` for sed."
	}

	// Check for cmd.exe
	if (shell.includes("cmd.exe")) {
		return "Note: Using `&&` for cmd.exe command chaining (conditional execution). For bash/zsh use `&&`, for PowerShell use `;`. IMPORTANT: When using cmd.exe, avoid Unix-specific utilities like `sed`, `grep`, `awk`, `cat`, `rm`, `cp`, `mv`. Use built-in commands like `type` for cat, `del` for rm, `copy` for cp, `move` for mv, `find`/`findstr` for grep, or consider using PowerShell commands instead."
	}

	// Unix shells
	return ""
}
