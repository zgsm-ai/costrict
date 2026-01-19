/**
 * Windows System Command Encoding Constants
 *
 * These commands output in GBK/CP936 encoding by default on Chinese Windows systems.
 */

/**
 * List of Windows system commands that output using GBK encoding.
 *
 * The output of these commands requires a GBK decoder to display characters correctly.
 */
export const GBK_ENCODED_COMMANDS = [
	// --- Process Management ---
	"tasklist", // Process query list (often contains localized headers)
	"taskkill", // Process termination (often contains success/error messages)

	// --- Network Tools ---
	"ping", // Network connectivity test (e.g., "Reply from...")
	"tracert", // Route tracing (e.g., "Request timed out")
	"netstat", // Network statistics (e.g., "Established")
	"ipconfig", // IP configuration (contains localized adapter names)
	"arp", // Address Resolution Protocol (contains localized headers)
	"route", // Routing table
	"nslookup", // DNS lookup (error messages are localized)
	"net", // Network command suite (net user, net share, net start, etc.)

	// --- System Information & Status ---
	"systeminfo", // Detailed system information (heavy localized labels)
	"whoami", // Current user (if username contains non-ASCII characters)
	"ver", // Windows version
	"sc", // Service control
	"wmic", // WMI command-line (output depends on system code page)
	"driverquery", // Driver list
	"powercfg", // Power configuration

	// --- File & Disk ---
	"dir", // List files (contains dates and localized summary)
	"tree", // Directory tree (contains box-drawing characters and folder names)
	"attrib", // File attributes
	"vol", // Disk volume label
	"label", // Disk labeling
	"fsutil", // File system utility

	// --- Utilities ---
	"chcp", // Change code page
	"reg", // Registry operations
	"find", // Text search
	"findstr", // String search
	"shutdown", // Shutdown command (warning messages)
	"cmd", // Command interpreter itself
] as const

/**
 * Command type derived from the constant array.
 */
export type GbkCommand = (typeof GBK_ENCODED_COMMANDS)[number]

/**
 * Checks if the command is a Windows system command using GBK encoding.
 *
 * @param command - The command string to check
 * @returns Returns true if the command uses GBK encoding
 */
export function isGbkEncodedCommand(command: string): boolean {
	// Non-Windows platforms do not need GBK handling
	if (process.platform !== "win32") {
		return false
	}

	if (!command) {
		return false
	}

	const trimmedCommand = command.trim()

	// Build regex pattern to match the start of the command
	// Use \b to ensure a whole word match (e.g., avoid matching "tasklist_custom")
	// Matches: "tasklist", "ping 127.0.0.1", "net user"
	const pattern = new RegExp(`^(${GBK_ENCODED_COMMANDS.join("|")})\\b`, "i")

	return pattern.test(trimmedCommand)
}
