import type OpenAI from "openai"
import { McpHub } from "../../../../services/mcp/McpHub"
import { buildMcpToolName } from "../../../../utils/mcp-name"
import { normalizeToolSchema, type JsonSchema } from "../../../../utils/json-schema"

const SECRET_KEY_RE = /(?:api[_-]?key|authorization|token|secret|password|credential)/i

function isSecretLike(key: string): boolean {
	return SECRET_KEY_RE.test(key)
}

function getInitialArgsTemplate(
	serverConfig: string | undefined,
	toolName: string,
): Record<string, unknown> | undefined {
	if (!serverConfig) return undefined
	try {
		const parsed = JSON.parse(serverConfig)
		const template = parsed?.asyncPolling?.tools?.[toolName]?.initialArgsTemplate
		if (template && typeof template === "object" && !Array.isArray(template)) {
			return template as Record<string, unknown>
		}
	} catch {
		// invalid JSON – leave schema unchanged
	}
	return undefined
}

function filterSchemaForModel(schema: JsonSchema, initialArgsTemplate: Record<string, unknown>): JsonSchema {
	if (!initialArgsTemplate || typeof schema !== "object") return schema

	const result = { ...schema } as Record<string, unknown>
	const templateKeys = Object.keys(initialArgsTemplate)

	if (Array.isArray(result.required)) {
		const filtered = (result.required as string[]).filter((k) => !templateKeys.includes(k))
		if (filtered.length > 0) {
			result.required = filtered
		} else {
			delete result.required
		}
	}

	const props = result.properties as Record<string, unknown> | undefined
	if (props) {
		const secretKeys = templateKeys.filter(isSecretLike)
		if (secretKeys.length > 0) {
			const newProps = { ...props }
			for (const sk of secretKeys) {
				delete newProps[sk]
			}
			result.properties = newProps
		}
	}

	return result as JsonSchema
}

/**
 * Dynamically generates native tool definitions for all enabled tools across connected MCP servers.
 * Tools are deduplicated by name to prevent API errors. When the same server exists in both
 * global and project configs, project servers take priority (handled by McpHub.getServers()).
 *
 * @param mcpHub The McpHub instance containing connected servers.
 * @returns An array of OpenAI.Chat.ChatCompletionTool definitions.
 */
export function getMcpServerTools(mcpHub?: McpHub): OpenAI.Chat.ChatCompletionTool[] {
	if (!mcpHub) {
		return []
	}

	const servers = mcpHub.getServers()
	const tools: OpenAI.Chat.ChatCompletionTool[] = []
	// Track seen tool names to prevent duplicates (e.g., when same server exists in both global and project configs)
	const seenToolNames = new Set<string>()

	for (const server of servers) {
		if (!server.tools) {
			continue
		}
		for (const tool of server.tools) {
			// Filter tools where tool.enabledForPrompt is not explicitly false
			if (tool.enabledForPrompt === false) {
				continue
			}

			// Build sanitized tool name for API compliance
			// The name is sanitized to conform to API requirements (e.g., Gemini's function name restrictions)
			const toolName = buildMcpToolName(server.name, tool.name)

			// Skip duplicate tool names - first occurrence wins (project servers come before global servers)
			if (seenToolNames.has(toolName)) {
				continue
			}
			seenToolNames.add(toolName)

			const originalSchema = tool.inputSchema as Record<string, unknown> | undefined

			let parameters: JsonSchema
			if (originalSchema) {
				parameters = normalizeToolSchema(originalSchema) as JsonSchema
			} else {
				parameters = { type: "object", additionalProperties: false } as JsonSchema
			}

			const initialArgsTemplate = getInitialArgsTemplate(server.config, tool.name)
			if (initialArgsTemplate) {
				parameters = filterSchemaForModel(parameters, initialArgsTemplate)
			}

			const toolDefinition: OpenAI.Chat.ChatCompletionTool = {
				type: "function",
				function: {
					name: toolName,
					description: tool.description,
					parameters: parameters as OpenAI.FunctionParameters,
				},
			}

			tools.push(toolDefinition)
		}
	}

	return tools
}
