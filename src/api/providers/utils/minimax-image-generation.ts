import type { ImageGenerationResult } from "./image-generation"

const endpoints = {
	minimax: "https://api.minimax.io/v1/image_generation",
	"minimax-cn": "https://api.minimaxi.com/v1/image_generation",
} as const

/** Generate a text-to-image result using the selected MiniMax region. */
export async function generateMiniMaxImage(options: {
	provider: keyof typeof endpoints
	authToken: string
	model: string
	prompt: string
}): Promise<ImageGenerationResult> {
	try {
		const response = await fetch(endpoints[options.provider], {
			method: "POST",
			headers: { Authorization: `Bearer ${options.authToken}`, "Content-Type": "application/json" },
			body: JSON.stringify({ model: options.model, prompt: options.prompt, n: 1, response_format: "base64" }),
		})
		if (!response.ok) return { success: false, error: `MiniMax image generation failed (${response.status}).` }
		const result = (await response.json()) as {
			base_resp?: { status_code?: number; status_msg?: string }
			data?: { image_base64?: string[] }
		}
		if (result.base_resp?.status_code !== 0) {
			return { success: false, error: result.base_resp?.status_msg || "MiniMax image generation failed." }
		}
		const data = result.data?.image_base64?.[0]
		if (typeof data !== "string" || !data || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) {
			return { success: false, error: "MiniMax returned no valid image data." }
		}
		const bytes = Buffer.from(data, "base64")
		const format = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
			? "png"
			: bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
				? "jpeg"
				: undefined
		if (!format) return { success: false, error: "MiniMax returned an unsupported image format." }
		return { success: true, imageData: `data:image/${format};base64,${data}`, imageFormat: format }
	} catch (error) {
		return { success: false, error: error instanceof Error ? error.message : "MiniMax image generation failed." }
	}
}
