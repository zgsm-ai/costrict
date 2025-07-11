import { ToolArgs } from "./types"

export function getExecuteCommandDescription(args: ToolArgs): string | undefined {
	return `## execute_command
Description: Request to execute a CLI command on the system. Use this when you need to perform system operations or run specific commands to accomplish any step in the user's task. You must tailor your command to the user's system and provide a clear explanation of what the command does. For command chaining, use the appropriate chaining syntax for the user's shell. Prefer to execute complex CLI commands over creating executable scripts, as they are more flexible and easier to run. Prefer relative commands and paths that avoid location sensitivity for terminal consistency, e.g: \`touch ./testdata/example.file\`, \`dir ./examples/model1/data/yaml\`, or \`go test ./cmd/front --config ./cmd/front/config.yml\`. If directed by the user, you may open a terminal in a different directory by using the \`cwd\` parameter.

Parameters:
- command: (required) The CLI command to execute. This should be valid for the current operating system. Ensure the command is properly formatted and does not contain any harmful instructions.
- cwd: (optional) The working directory to execute the command in (default: ${args.cwd})

### Multi-command execution by terminal type:
- **cmd.exe**: Use \`&&\` to chain commands. E.g. \`mkdir demo && cd demo && dir\`
- **powershell.exe**: Use \`; \` (semicolon) to separate commands. E.g. \`mkdir demo; cd demo; Get-ChildItem\`
- **pwsh.exe** (PowerShell Core): Same as powershell. Use \`; \` (semicolon) or line breaks.

Usage:
<execute_command>
<command>Your command here</command>
<cwd>Working directory path (optional)</cwd>
</execute_command>

### Examples:

#### Run dev server (cross-platform)
<execute_command>
<command>npm run dev</command>
</execute_command>

#### List directory contents
<execute_command>
<command>ls -la</command>
<cwd>/home/user/projects</cwd>
</execute_command>

#### [cmd.exe] Create and enter directory, then list contents
<execute_command>
<command>mkdir demo && cd demo && dir</command>
</execute_command>

#### [powershell.exe] Create and enter directory, then list contents
<execute_command>
<command>mkdir demo; cd demo; Get-ChildItem</command>
</execute_command>

#### [pwsh.exe] Run multiple commands
<execute_command>
<command>New-Item -ItemType Directory demo; Set-Location demo; Get-ChildItem</command>
</execute_command>`
}
