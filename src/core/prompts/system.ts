import * as vscode from "vscode"

import { type ModeConfig, type PromptComponent, type CustomModePrompts, type TodoItem } from "@roo-code/types"

import { Mode, modes, defaultModeSlug, getModeBySlug, getGroupName, getModeSelection } from "../../shared/modes"
import { DiffStrategy } from "../../shared/tools"
import { formatLanguage } from "../../shared/language"
import { isEmpty } from "../../utils/object"

import { McpHub } from "../../services/mcp/McpHub"
// import { CodeIndexManager } from "../../services/code-index/manager"
import { SkillsManager } from "../../services/skills/SkillsManager"

import type { SystemPromptSettings } from "./types"
import {
	getRulesSection,
	getSystemInfoSection,
	getObjectiveSection,
	getSharedToolUseSection,
	getToolUseGuidelinesSection,
	getCapabilitiesSection,
	getModesSection,
	addCustomInstructions,
	markdownFormattingSection,
	getSkillsSection,
	getLiteToolUseGuidelinesSection,
	getLiteCapabilitiesSection,
	getLiteObjectiveSection,
	getLiteSharedToolUseSection,
	getLiteRulesSection,
	getEnglishOnlySection,
} from "./sections"
import { experiments as experimentsUtil, EXPERIMENT_IDS } from "../../shared/experiments"
import { defaultLang } from "../../utils/language"
import { getShell } from "../../utils/shell"

// Helper function to get prompt component, filtering out empty objects
export function getPromptComponent(
	customModePrompts: CustomModePrompts | undefined,
	mode: string,
): PromptComponent | undefined {
	const component = customModePrompts?.[mode]
	// Return undefined if component is empty
	if (isEmpty(component)) {
		return undefined
	}
	return component
}

async function generatePrompt(data: {
	context: vscode.ExtensionContext
	cwd: string
	supportsComputerUse: boolean
	mode: Mode
	mcpHub?: McpHub
	diffStrategy?: DiffStrategy
	promptComponent?: PromptComponent
	customModeConfigs?: ModeConfig[]
	globalCustomInstructions?: string
	experiments?: Record<string, boolean>
	enableMcpServerCreation?: boolean
	language?: string
	rooIgnoreInstructions?: string
	settings?: SystemPromptSettings
	todoList?: TodoItem[]
	modelId?: string
	shell?: string
	costrictCodeMode?: string
	skillsManager?: SkillsManager
	useLitePrompts?: boolean
}): Promise<string> {
	let {
		context,
		cwd,
		mode,
		mcpHub,
		promptComponent,
		customModeConfigs,
		globalCustomInstructions,
		experiments,
		language,
		rooIgnoreInstructions,
		skillsManager,
		settings,
		costrictCodeMode,
		shell,
		modelId,
		useLitePrompts,
	} = data

	if (!context) {
		throw new Error("Extension context is required for generating system prompt")
	}
	shell = shell || getShell(settings?.terminalShellIntegrationDisabled)

	// Get the full mode config to ensure we have the role definition (used for groups, etc.)
	const modeConfig = getModeBySlug(mode, customModeConfigs) || modes.find((m) => m.slug === mode) || modes[0]
	const { roleDefinition, baseInstructions } = getModeSelection(
		mode,
		promptComponent,
		customModeConfigs,
		language,
		modelId,
	)

	// When overrideSystemPrompt is true, use roleDefinition as the entire system prompt
	// body, only appending custom instructions. All standard sections are skipped.
	if (modeConfig.overrideSystemPrompt) {
		const customInstructionsSection = await addCustomInstructions(
			baseInstructions,
			globalCustomInstructions || "",
			cwd,
			mode,
			{
				language: language ?? formatLanguage(await defaultLang()),
				rooIgnoreInstructions,
				settings,
				shell,
				useLitePrompts,
			},
		)
		return `${roleDefinition}${customInstructionsSection}`
	}
	// Check if MCP functionality should be included
	const hasMcpGroup = modeConfig.groups.some((groupEntry) => getGroupName(groupEntry) === "mcp")
	const hasMcpServers = mcpHub && mcpHub.getServers().length > 0
	const shouldIncludeMcp = hasMcpGroup && hasMcpServers

	// const codeIndexManager = CodeIndexManager.getInstance(context, cwd)

	// // Tool calling is native-only.
	// const effectiveProtocol = "native"

	// Get modes section, and skills section only if enabled for this mode
	const [modesSection, skillsSection] = await Promise.all([
		getModesSection(context, costrictCodeMode, mode as string),
		getSkillsSection(skillsManager, mode as string),
	])

	const usePurePrompts = modeConfig.pure === true

	const disableSwitchMode = modeConfig.disableSwitchMode === true
	// # Reminder: Instructions for Tool Use
	// === Cache-optimized prompt structure ===
	// Static sections are placed FIRST to maximize prompt cache hit rate.
	// Dynamic content (cwd, mode, user rules) is pushed to the end.
	// See: plans/system-prompt-cache-optimization.md

	// Determine if English-only rule should be added (for non-Chinese languages)
	const shouldAddEnglishOnlyRule = language !== "zh-CN"

	const basePrompt = `${roleDefinition}
${usePurePrompts ? "" : markdownFormattingSection()}
${usePurePrompts ? "" : useLitePrompts ? getLiteSharedToolUseSection() : getSharedToolUseSection()}
${usePurePrompts ? "" : useLitePrompts ? getLiteToolUseGuidelinesSection() : getToolUseGuidelinesSection()}
${usePurePrompts ? "" : useLitePrompts ? getLiteObjectiveSection() : getObjectiveSection()}
${usePurePrompts || !shouldAddEnglishOnlyRule ? "" : getEnglishOnlySection()}
${disableSwitchMode ? "" : modesSection}
${usePurePrompts ? "" : skillsSection ? `\n${skillsSection}` : ""}
${usePurePrompts ? "" : useLitePrompts ? getLiteCapabilitiesSection(cwd, shouldIncludeMcp ? mcpHub : undefined) : getCapabilitiesSection(cwd, shouldIncludeMcp ? mcpHub : undefined)}
${usePurePrompts ? "" : useLitePrompts ? getLiteRulesSection(cwd, settings, experiments) : getRulesSection(cwd, settings, experiments)}
${usePurePrompts ? "" : getSystemInfoSection(cwd, shell)}
${await addCustomInstructions(baseInstructions, globalCustomInstructions || "", cwd, mode, {
	language: language ?? formatLanguage(await defaultLang()),
	rooIgnoreInstructions,
	settings,
	shell,
	useLitePrompts,
})}`

	return basePrompt
}

export const SYSTEM_PROMPT = async (
	context: vscode.ExtensionContext,
	cwd: string,
	supportsComputerUse: boolean,
	mcpHub?: McpHub,
	diffStrategy?: DiffStrategy,
	mode: Mode = defaultModeSlug,
	customModePrompts?: CustomModePrompts,
	customModes?: ModeConfig[],
	globalCustomInstructions?: string,
	experiments?: Record<string, boolean>,
	language?: string,
	rooIgnoreInstructions?: string,
	settings?: SystemPromptSettings,
	todoList?: TodoItem[],
	modelId?: string,
	parallelToolCallsEnabled?: boolean,
	skillsManager?: SkillsManager,
	useLitePrompts?: boolean,
): Promise<string> => {
	if (!context) {
		throw new Error("Extension context is required for generating system prompt")
	}
	const shell = getShell(settings?.terminalShellIntegrationDisabled)
	language = language ?? formatLanguage(await defaultLang())
	// Check if it's a custom mode
	const promptComponent = getPromptComponent(customModePrompts, mode)

	// Get full mode config from custom modes or fall back to built-in modes
	const currentMode = getModeBySlug(mode, customModes) || modes.find((m) => m.slug === mode) || modes[0]

	return generatePrompt({
		context,
		cwd,
		supportsComputerUse,
		mode: currentMode.slug,
		mcpHub,
		diffStrategy,
		promptComponent,
		customModeConfigs: customModes,
		globalCustomInstructions,
		experiments,
		language,
		rooIgnoreInstructions,
		settings,
		todoList,
		modelId,
		shell,
		skillsManager,
		costrictCodeMode: settings?.costrictCodeMode,
		useLitePrompts,
	})
}
