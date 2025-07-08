/**
 * PowerShell Command Converter
 * Converts Unix shell syntax to PowerShell compatible syntax
 */

export function convertUnixToPowerShell(command: string): string {
	let convertedCommand = command.trim()

	// Handle quoted strings to avoid converting operators inside quotes
	const quotedParts: string[] = []
	let tempCommand = convertedCommand

	// Temporarily replace quoted content
	tempCommand = tempCommand.replace(/"[^"]*"|'[^']*'/g, (match) => {
		quotedParts.push(match)
		return `__QUOTE_${quotedParts.length - 1}__`
	})

	// Common Unix to PowerShell command mappings
	const commandMappings: { [key: string]: string | ((args: string) => string) } = {
		// File and directory operations
		ls: "Get-ChildItem",
		dir: "Get-ChildItem",
		ll: "Get-ChildItem",
		cat: "Get-Content",
		type: "Get-Content",
		more: "Get-Content",
		less: "Get-Content",
		head: (args: string) => `Get-Content${args} | Select-Object -First 10`,
		tail: (args: string) => `Get-Content${args} | Select-Object -Last 10`,
		find: "Get-ChildItem -Recurse",
		locate: "Get-ChildItem -Recurse",
		which: "Get-Command",
		whereis: "Get-Command",
		pwd: "Get-Location",
		cd: "Set-Location",
		mkdir: "New-Item -ItemType Directory",
		rmdir: "Remove-Item",
		rm: "Remove-Item",
		del: "Remove-Item",
		cp: "Copy-Item",
		copy: "Copy-Item",
		mv: "Move-Item",
		move: "Move-Item",
		touch: "New-Item -ItemType File",
		chmod: "Set-ItemProperty",

		// Text processing
		grep: "Select-String",
		egrep: "Select-String -Pattern",
		fgrep: "Select-String -SimpleMatch",
		sed: "ForEach-Object",
		awk: "ForEach-Object",
		sort: "Sort-Object",
		uniq: "Sort-Object -Unique",
		wc: "Measure-Object",
		cut: "ForEach-Object",

		// Process management
		ps: "Get-Process",
		kill: "Stop-Process",
		killall: "Stop-Process -Name",
		jobs: "Get-Job",
		bg: "Start-Job",
		fg: "Receive-Job",

		// Network tools
		ping: "Test-NetConnection",
		curl: "Invoke-WebRequest",
		wget: "Invoke-WebRequest",
		netstat: "Get-NetTCPConnection",

		// System information
		df: "Get-WmiObject -Class Win32_LogicalDisk",
		du: "Get-ChildItem -Recurse | Measure-Object -Property Length -Sum",
		free: "Get-WmiObject -Class Win32_OperatingSystem",
		uname: "Get-ComputerInfo",
		whoami: "$env:USERNAME",
		id: "$env:USERNAME",
		date: "Get-Date",
		uptime: "(Get-Date) - (Get-CimInstance Win32_OperatingSystem).LastBootUpTime",

		// Environment variables
		env: "Get-ChildItem Env:",
		printenv: "Get-ChildItem Env:",
		export: "$env:",
		set: "$env:",

		// Archive tools
		tar: "Compress-Archive",
		unzip: "Expand-Archive",
		zip: "Compress-Archive",

		// Other utilities
		echo: "Write-Output",
		printf: "Write-Host",
		clear: "Clear-Host",
		history: "Get-History",
		alias: "Get-Alias",
		man: "Get-Help",
		help: "Get-Help",
	}

	// Internal function: convert single command
	const convertSingleCommand = (cmd: string): string => {
		const parts = cmd.trim().split(/\s+/)
		const cmdName = parts[0]
		const args = parts.slice(1).join(" ")

		if (commandMappings[cmdName]) {
			// Only perform argument replacement for whitelisted commands
			let convertedArgs = args
			convertedArgs = convertedArgs.replace(/\s-l\b/g, " -Force") // ls -l
			convertedArgs = convertedArgs.replace(/\s-a\b/g, " -Force") // ls -a
			convertedArgs = convertedArgs.replace(/\s-r\b/g, " -Recurse") // recursive
			convertedArgs = convertedArgs.replace(/\s-f\b/g, " -Force") // force
			convertedArgs = convertedArgs.replace(/\s-v\b/g, " -Verbose") // verbose
			convertedArgs = convertedArgs.replace(/\s-i\b/g, " -Confirm") // interactive
			convertedArgs = convertedArgs.replace(/\s-n\b/g, " -WhatIf") // preview
			// redirection
			convertedArgs = convertedArgs.replace(/\s*>\s*/g, " | Out-File ")
			convertedArgs = convertedArgs.replace(/\s*>>\s*/g, " | Out-File -Append ")
			convertedArgs = convertedArgs.replace(/\s*<\s*/g, " | Get-Content ")

			const mapping = commandMappings[cmdName]
			if (typeof mapping === "function") {
				return mapping(convertedArgs ? ` ${convertedArgs}` : "")
			} else {
				return convertedArgs ? `${mapping} ${convertedArgs}` : mapping
			}
		}
		// For non-whitelisted commands, return original command
		return cmd
	}

	// Handle compound commands (separated by &&, ||, |, ;)
	const commandSeparators = /(\s*(?:\|\||&&|;|\|)\s*)/g
	const parts = tempCommand.split(commandSeparators)

	for (let i = 0; i < parts.length; i += 2) {
		if (parts[i] && parts[i].trim()) {
			parts[i] = convertSingleCommand(parts[i].trim())
		}
	}

	tempCommand = parts.join("")

	// Convert logical operators
	tempCommand = tempCommand.replace(/\s*&&\s*/g, " ; ")
	tempCommand = tempCommand.replace(/\s*\|\|\s*/g, " ; ")
	// Restore quoted strings
	tempCommand = tempCommand.replace(/__QUOTE_(\d+)__/g, (_, i) => quotedParts[parseInt(i)])

	// Log conversion for debugging
	if (tempCommand !== command) {
		console.log(`[Unix to PowerShell Conversion] Original: ${command}`)
		console.log(`[Unix to PowerShell Conversion] Converted: ${tempCommand}`)
	}

	return tempCommand
}

// Usage examples
/*
console.log(convertUnixToPowerShell('ls -la'));
// Output: Get-ChildItem -Force

console.log(convertUnixToPowerShell('cat file.txt | grep "pattern"'));
// Output: Get-Content file.txt | Select-String "pattern"

console.log(convertUnixToPowerShell('find . -name "*.js" && echo "Done"'));
// Output: Get-ChildItem -Recurse . -name "*.js" ; Write-Output "Done"
*/
