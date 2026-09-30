import axios from "axios"
import { z } from "zod"

import type { ModelInfo } from "@roo-code/types"

/**
 * OrcaRouterModel
 */

const orcaRouterModelSchema = z.object({
	id: z.string(),
	object: z.string().optional(),
	created: z.number().optional(),
	owned_by: z.string().optional(),
	context_window: z.number().optional(),
	max_tokens: z.number().optional(),
})

export type OrcaRouterModel = z.infer<typeof orcaRouterModelSchema>

/**
 * OrcaRouterModelsResponse
 */

const orcaRouterModelsResponseSchema = z.object({
	object: z.string().optional(),
	data: z.array(orcaRouterModelSchema),
})

type OrcaRouterModelsResponse = z.infer<typeof orcaRouterModelsResponseSchema>

/**
 * getOrcaRouterModels
 */

export async function getOrcaRouterModels(options?: {
	apiKey?: string
	baseUrl?: string
}): Promise<Record<string, ModelInfo>> {
	const models: Record<string, ModelInfo> = {}
	const baseURL = options?.baseUrl || "https://api.orcarouter.ai/v1"

	try {
		const response = await axios.get<OrcaRouterModelsResponse>(`${baseURL}/models`, {
			...(options?.apiKey && { headers: { Authorization: `Bearer ${options.apiKey}` } }),
		})
		const result = orcaRouterModelsResponseSchema.safeParse(response.data)
		const data = result.success ? result.data.data : response.data.data

		if (!result.success) {
			console.error(`OrcaRouter models response is invalid ${JSON.stringify(result.error.format())}`)
		}

		for (const model of data) {
			const { id } = model

			// Only include language models with an id for chat inference.
			if (!id) {
				continue
			}

			models[id] = {
				maxTokens: model.max_tokens ?? 64000,
				contextWindow: model.context_window ?? 200000,
				supportsImages: true,
				supportsPromptCache: true,
				description: model.id,
			}
		}
	} catch (error) {
		console.warn(`Error fetching OrcaRouter models: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`)
	}

	return models
}
