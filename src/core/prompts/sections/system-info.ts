import os from "os"
import { getOperatingSystem } from "../../../utils/costrictUtils"

export function getSystemInfoSection(cwd: string, shell?: string): string {
	let details = `====

SYSTEM INFORMATION

Operating System: ${getOperatingSystem()}
Default Shell: ${shell}
Home Directory: ${os.homedir().toPosix()}
Current Workspace Directory: ${cwd.toPosix()}

Workspace is the default directory for all tool operations. Terminal \`cd\` does not change it. For external directories, use list_files (recursive=true for nested structure). Initial task includes a recursive file listing in environment_details.`

	return details
}
