import * as vscode from "vscode"

import type { ModeConfig } from "@roo-code/types"

import { getAllModesWithPrompts } from "../../../shared/modes"
import { ensureSettingsDirectoryExists } from "../../../utils/globalContext"

export async function getModesSection(
	context: vscode.ExtensionContext,
	costrictCodeMode?: string,
	currentModeSlug?: string,
): Promise<string> {
	// Make sure path gets created
	await ensureSettingsDirectoryExists(context)

	// Get all modes with their overrides from extension state
	const allModes = await getAllModesWithPrompts(context)

	// Get current mode config to check subagents filter
	const currentMode = currentModeSlug ? allModes.find((mode: ModeConfig) => mode.slug === currentModeSlug) : undefined
	const allowedSubagents = currentMode?.subagents

	const modesContent = `====

MODES

- These are the currently available modes:
${allModes
	.filter((mode: ModeConfig) => {
		// If current mode has subagents configured, filter to only show those
		if (allowedSubagents && allowedSubagents.length > 0) {
			return allowedSubagents.includes(mode.slug)
		}

		// Original costrictCodeMode filtering logic mode.apiProvider
		if (
			!mode.costrictCodeModeGroup ||
			(mode.apiProvider === "costrict" &&
				["quick-explore", "task-check", "subcoding", "review", "security-review", "subreview"].includes(
					mode.slug,
				))
		)
			return true
		if (mode.costrictCodeModeGroup)
			return mode.costrictCodeModeGroup.split(",").includes(costrictCodeMode ?? "vibe")
		return true
	})
	.map((mode: ModeConfig) => {
		let description: string
		if (mode.whenToUse && mode.whenToUse.trim() !== "") {
			// Use whenToUse as the primary description, indenting subsequent lines for readability
			description = mode.whenToUse.replace(/\n/g, "\n    ")
		} else {
			// Fallback to the first sentence of roleDefinition if whenToUse is not available
			description = mode.roleDefinition.split(".")[0]
		}
		return `  * "${mode.name}" mode (${mode.slug}) - ${description}`
	})
	.join("\n")}`

	return modesContent
}
