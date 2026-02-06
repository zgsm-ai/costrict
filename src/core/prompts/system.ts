import * as vscode from "vscode"
import * as os from "os"

import { type ModeConfig, type PromptComponent, type CustomModePrompts, type TodoItem } from "@roo-code/types"

import { Mode, modes, defaultModeSlug, getModeBySlug, getGroupName, getModeSelection } from "../../shared/modes"
import { DiffStrategy } from "../../shared/tools"
import { formatLanguage } from "../../shared/language"
import { isEmpty } from "../../utils/object"

import { McpHub } from "../../services/mcp/McpHub"
import { CodeIndexManager } from "../../services/code-index/manager"
import { SkillsManager } from "../../services/skills/SkillsManager"

import { PromptVariables, loadSystemPromptFile } from "./sections/custom-system-prompt"

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
	browserViewportSize?: string
	promptComponent?: PromptComponent
	customModeConfigs?: ModeConfig[]
	globalCustomInstructions?: string
	experiments?: Record<string, boolean>
	enableMcpServerCreation?: boolean
	language?: string
	rooIgnoreInstructions?: string
	// partialReadsEnabled?: boolean
	// parallelToolCallsEnabled?: boolean
	settings?: SystemPromptSettings
	todoList?: TodoItem[]
	modelId?: string
	shell?: string
	zgsmCodeMode?: string
	skillsManager?: SkillsManager
}): Promise<string> {
	let {
		context,
		cwd,
		supportsComputerUse,
		mode,
		mcpHub,
		diffStrategy,
		browserViewportSize,
		promptComponent,
		customModeConfigs,
		globalCustomInstructions,
		experiments,
		enableMcpServerCreation,
		language,
		rooIgnoreInstructions,
		// partialReadsEnabled,
		// parallelToolCallsEnabled,
		skillsManager,
		settings,
		todoList,
		modelId,
		zgsmCodeMode,
		shell,
	} = data
	if (!context) {
		throw new Error("Extension context is required for generating system prompt")
	}
	shell = shell || getShell(settings?.terminalShellIntegrationDisabled)

	// Get the full mode config to ensure we have the role definition (used for groups, etc.)
	const modeConfig = getModeBySlug(mode, customModeConfigs) || modes.find((m) => m.slug === mode) || modes[0]
	const { roleDefinition, baseInstructions } = getModeSelection(mode, promptComponent, customModeConfigs)

	// Check if MCP functionality should be included
	const hasMcpGroup = modeConfig.groups.some((groupEntry) => getGroupName(groupEntry) === "mcp")
	const hasMcpServers = mcpHub && mcpHub.getServers().length > 0
	const shouldIncludeMcp = hasMcpGroup && hasMcpServers

	const codeIndexManager = CodeIndexManager.getInstance(context, cwd)

	// Tool calling is native-only.
	const effectiveProtocol = "native"

	const [modesSection, skillsSection] = await Promise.all([
		getModesSection(context, zgsmCodeMode),
		getSkillsSection(skillsManager, mode as string),
	])

	// Tools catalog is not included in the system prompt.
	const toolsCatalog = ""

	// Check if lite prompts experiment is enabled
	const useLitePrompts = experimentsUtil.isEnabled(experiments ?? {}, EXPERIMENT_IDS.USE_LITE_PROMPTS)

	const basePrompt = `${roleDefinition}

${markdownFormattingSection()}

${useLitePrompts ? getLiteSharedToolUseSection() : getSharedToolUseSection()}${toolsCatalog}

${useLitePrompts ? getLiteToolUseGuidelinesSection() : getToolUseGuidelinesSection()}

${useLitePrompts ? getLiteCapabilitiesSection(cwd, shouldIncludeMcp ? mcpHub : undefined) : getCapabilitiesSection(cwd, shouldIncludeMcp ? mcpHub : undefined)}

${modesSection}
${skillsSection ? `\n${skillsSection}` : ""}
${useLitePrompts ? getLiteRulesSection(cwd, settings, experiments) : getRulesSection(cwd, settings, experiments)}

${getSystemInfoSection(cwd, shell)}

${useLitePrompts ? getLiteObjectiveSection() : getObjectiveSection()}

${await addCustomInstructions(baseInstructions, globalCustomInstructions || "", cwd, mode, {
	language: language ?? formatLanguage(await defaultLang()),
	rooIgnoreInstructions,
	settings,
	shell,
})}`

	return basePrompt
}

export const SYSTEM_PROMPT = async (
	context: vscode.ExtensionContext,
	cwd: string,
	supportsComputerUse: boolean,
	mcpHub?: McpHub,
	diffStrategy?: DiffStrategy,
	browserViewportSize?: string,
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
	// Try to load custom system prompt from file
	const variablesForPrompt: PromptVariables = {
		workspace: cwd,
		mode: mode,
		language,
		shell: process.env.NODE_ENV === "test" ? vscode.env.shell : shell,
		operatingSystem: os.type(),
	}
	const fileCustomSystemPrompt = await loadSystemPromptFile(cwd, mode, variablesForPrompt)

	// Check if it's a custom mode
	const promptComponent = getPromptComponent(customModePrompts, mode)

	// Get full mode config from custom modes or fall back to built-in modes
	const currentMode = getModeBySlug(mode, customModes) || modes.find((m) => m.slug === mode) || modes[0]

	// If a file-based custom system prompt exists, use it
	if (fileCustomSystemPrompt) {
		const { roleDefinition, baseInstructions: baseInstructionsForFile } = getModeSelection(
			mode,
			promptComponent,
			customModes,
		)

		const customInstructions = await addCustomInstructions(
			baseInstructionsForFile,
			globalCustomInstructions || "",
			cwd,
			mode,
			{
				language,
				rooIgnoreInstructions,
				settings,
				shell,
				useLitePrompts,
			},
		)

		// For file-based prompts, don't include the tool sections
		return `${roleDefinition}

${fileCustomSystemPrompt}

${customInstructions}`
	}

	return generatePrompt({
		context,
		cwd,
		supportsComputerUse,
		mode: currentMode.slug,
		mcpHub,
		diffStrategy,
		browserViewportSize,
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
		zgsmCodeMode: settings?.zgsmCodeMode,
	})
}
