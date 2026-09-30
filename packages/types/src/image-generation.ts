/**
 * Image generation model constants
 */

/**
 * API method used for image generation
 */
export type ImageGenerationApiMethod = "chat_completions" | "images_api"

export interface ImageGenerationModel {
	value: string
	label: string
	provider: ImageGenerationProvider
	apiMethod?: ImageGenerationApiMethod
}

export const IMAGE_GENERATION_MODELS: ImageGenerationModel[] = [
	// OpenRouter models
	{ value: "google/gemini-2.5-flash-image", label: "Gemini 2.5 Flash Image", provider: "openrouter" },
	{ value: "google/gemini-3-pro-image-preview", label: "Gemini 3 Pro Image Preview", provider: "openrouter" },
	{ value: "openai/gpt-5-image", label: "GPT-5 Image", provider: "openrouter" },
	{ value: "openai/gpt-5-image-mini", label: "GPT-5 Image Mini", provider: "openrouter" },
	{ value: "black-forest-labs/flux.2-flex", label: "Black Forest Labs FLUX.2 Flex", provider: "openrouter" },
	{ value: "black-forest-labs/flux.2-pro", label: "Black Forest Labs FLUX.2 Pro", provider: "openrouter" },
	// // Roo Code Cloud models
	// { value: "google/gemini-2.5-flash-image", label: "Gemini 2.5 Flash Image", provider: "roo" },
	// { value: "google/gemini-3-pro-image", label: "Gemini 3 Pro Image", provider: "roo" },
	// {
	// 	value: "bfl/flux-2-pro:free",
	// 	label: "Black Forest Labs FLUX.2 Pro (Free)",
	// 	provider: "roo",
	// 	apiMethod: "images_api",
	// },
	{ value: "image-01", label: "image-01", provider: "minimax" },
	{ value: "image-01-live", label: "image-01-live", provider: "minimax" },
	{ value: "image-01", label: "image-01", provider: "minimax-cn" },
	{ value: "image-01-live", label: "image-01-live", provider: "minimax-cn" },
]

/**
 * Get array of model values only (for backend validation)
 */
export const IMAGE_GENERATION_MODEL_IDS = IMAGE_GENERATION_MODELS.map((m) => m.value)

/**
 * Image generation provider type
 */
export type ImageGenerationProvider = "openrouter" | "roo" | "minimax" | "minimax-cn"

/**
 * Get the image generation provider with backwards compatibility
 * - Honor explicitly selected MiniMax regions.
 * - Preserve the existing default for other configurations.
 */
export function getImageGenerationProvider(
	explicitProvider: ImageGenerationProvider | undefined,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	hasExistingModel: boolean,
): ImageGenerationProvider {
	return explicitProvider === "minimax" || explicitProvider === "minimax-cn" ? explicitProvider : "openrouter"
}
