import os from "os"
import { getOperatingSystem } from "../../../utils/costrictUtils"

export function getSystemInfoSection(cwd: string, shell?: string): string {
	let details = `====

SYSTEM INFORMATION

Operating System: ${getOperatingSystem()}
Current Shell: ${shell}
Home Directory: ${os.homedir().toPosix()}
Current Workspace Directory: ${cwd.toPosix()}

Command Execution Requirement: Every generated command must be fully compatible with the Current Shell shown above. Before generating or executing a command, check the Current Shell and adapt command syntax, chaining, quoting, and utilities accordingly.
Workspace is the default directory for all tool operations. Terminal \`cd\` does not change it. For external directories, use list_files (recursive=true for nested structure). Initial task includes a recursive file listing in environment_details.`

	return details
}
