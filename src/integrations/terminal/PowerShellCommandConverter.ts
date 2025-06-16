/**
 * PowerShell Command Converter
 * Converts Unix shell syntax to PowerShell compatible syntax
 */

export class PowerShellCommandConverter {
	/**
	 * Convert Unix shell syntax to PowerShell compatible syntax
	 * @param command The original command string
	 * @returns PowerShell compatible command string
	 */
	static convertCommand(command: string): string {
		let convertedCommand = command

		// Handle quoted strings to avoid converting operators inside quotes
		const quotedParts: string[] = []
		let tempCommand = convertedCommand

		// Temporarily replace quoted content
		tempCommand = tempCommand.replace(/"[^"]*"/g, (match) => {
			quotedParts.push(match)
			return `__QUOTE_${quotedParts.length - 1}__`
		})

		tempCommand = tempCommand.replace(/'[^']*'/g, (match) => {
			quotedParts.push(match)
			return `__QUOTE_${quotedParts.length - 1}__`
		})

		// Convert && (logical AND) to PowerShell semicolon separator
		// PowerShell 5.x doesn't support &&, so we use ; for sequential execution
		tempCommand = tempCommand.replace(/\s*&&\s*/g, " ; ")

		// Convert || (logical OR) to PowerShell error handling pattern
		// This is a basic conversion - for more complex logic, proper error handling would be needed
		tempCommand = tempCommand.replace(/\s*\|\|\s*/g, " ; ")

		// Restore quoted strings
		tempCommand = tempCommand.replace(/__QUOTE_(\d+)__/g, (_, i) => quotedParts[parseInt(i)])

		return tempCommand
	}

	/**
	 * Check if a command contains Unix shell syntax that needs conversion
	 * @param command The command to check
	 * @returns True if conversion is needed
	 */
	static needsConversion(command: string): boolean {
		// Check for Unix shell operators outside of quoted strings
		const quotedRemoved = command.replace(/"[^"]*"/g, "").replace(/'[^']*'/g, "")
		return /\s*&&\s*|\s*\|\|\s*/.test(quotedRemoved)
	}

	/**
	 * Log conversion details for debugging
	 * @param original Original command
	 * @param converted Converted command
	 */
	static logConversion(original: string, converted: string): void {
		if (original !== converted) {
			console.log(`[PowerShell Syntax Conversion] Original: ${original}`)
			console.log(`[PowerShell Syntax Conversion] Converted: ${converted}`)
		}
	}
}
