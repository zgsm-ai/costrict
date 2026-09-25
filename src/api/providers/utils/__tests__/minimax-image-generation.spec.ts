import { describe, it, expect, vi, afterEach } from "vitest"
import { generateMiniMaxImage } from "../minimax-image-generation"
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]).toString("base64")
afterEach(() => vi.unstubAllGlobals())
describe("MiniMax image generation", () => {
	it.each([
		["minimax", "https://api.minimax.io/v1/image_generation", "image-01"],
		["minimax-cn", "https://api.minimaxi.com/v1/image_generation", "image-01-live"],
	] as const)("uses %s endpoint", async (provider, endpoint, model) => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue({
				ok: true,
				json: async () => ({ base_resp: { status_code: 0 }, data: { image_base64: [png] } }),
			})
		vi.stubGlobal("fetch", fetchMock)
		expect(await generateMiniMaxImage({ provider, model, authToken: "test-key", prompt: "A tree" })).toEqual({
			success: true,
			imageData: `data:image/png;base64,${png}`,
			imageFormat: "png",
		})
		expect(fetchMock).toHaveBeenCalledWith(
			endpoint,
			expect.objectContaining({
				headers: { Authorization: "Bearer test-key", "Content-Type": "application/json" },
				body: JSON.stringify({ model, prompt: "A tree", n: 1, response_format: "base64" }),
			}),
		)
	})
	it.each([
		{ base_resp: { status_code: 1004, status_msg: "Authentication failed" } },
		{ base_resp: { status_code: 0 }, data: { image_base64: [] } },
		{ base_resp: { status_code: 0 }, data: { image_base64: ["invalid data"] } },
		{ base_resp: { status_code: 0 }, data: { image_base64: [Buffer.from("not an image").toString("base64")] } },
		{ data: { image_base64: [png] } },
	])("rejects failed or invalid responses", async (response) => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => response }))
		expect(
			(
				await generateMiniMaxImage({
					provider: "minimax",
					model: "image-01",
					authToken: "test-key",
					prompt: "A tree",
				})
			).success,
		).toBe(false)
	})
	it("handles HTTP failures", async () => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 429 }))
		expect(
			(
				await generateMiniMaxImage({
					provider: "minimax",
					model: "image-01",
					authToken: "test-key",
					prompt: "A tree",
				})
			).error,
		).toContain("429")
	})
	it("handles network failures", async () => {
		vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network unavailable")))
		expect(
			(
				await generateMiniMaxImage({
					provider: "minimax",
					model: "image-01",
					authToken: "test-key",
					prompt: "A tree",
				})
			).error,
		).toBe("Network unavailable")
	})
})
