import { type ModelInfo, type VertexModelId, vertexDefaultModelId, vertexModels } from "@roo-code/types"

import type { ApiHandlerOptions } from "../../shared/api"

import { getModelParams } from "../transform/model-params"

import { GeminiHandler } from "./gemini"

// Importing SingleCompletionHandler from "../index" creates a circular dependency:
// - vertex.ts imports GeminiHandler from "./gemini"
// - gemini.ts imports SingleCompletionHandler from "../index"
// - index.ts exports VertexHandler from "./vertex"
//
// To break this cycle, we define the interface locally here. This is safe because
// VertexHandler only implements this interface for type checking, and the actual
// implementation (completePrompt method) is inherited from GeminiHandler which
// already implements SingleCompletionHandler properly.

export interface SingleCompletionHandler {
	completePrompt(prompt: string, systemPrompt?: string, metadata?: any): Promise<string>
}

export class VertexHandler extends GeminiHandler implements SingleCompletionHandler {
	constructor(options: ApiHandlerOptions) {
		super({ ...options, isVertex: true })
	}

	override getModel() {
		const modelId = this.options.apiModelId
		let id = modelId && modelId in vertexModels ? (modelId as VertexModelId) : vertexDefaultModelId
		const info: ModelInfo = vertexModels[id]
		const params = getModelParams({ format: "gemini", modelId: id, model: info, settings: this.options })

		// The `:thinking` suffix indicates that the model is a "Hybrid"
		// reasoning model and that reasoning is required to be enabled.
		// The actual model ID honored by Gemini's API does not have this
		// suffix.
		return { id: id.endsWith(":thinking") ? id.replace(":thinking", "") : id, info, ...params }
	}
}
