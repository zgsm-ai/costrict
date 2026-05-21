// npx vitest core/webview/__tests__/invalidateCustomModesCache.spec.ts

import { CustomModesManager } from "../../config/CustomModesManager"

//costrict: lightweight host that mirrors the invalidateCustomModesCache logic from ClineProvider
//         without instantiating the full ClineProvider (which requires heavy VSCode API mocks)
type MinimalHost = {
	cachedCustomModes: unknown
	customModesManager: Pick<CustomModesManager, "clearCache">
	invalidateCustomModesCache(): void
}

function makeHost(clearCacheSpy: ReturnType<typeof vi.fn>): MinimalHost {
	return {
		cachedCustomModes: [{ slug: "cached-mode" }],
		customModesManager: { clearCache: clearCacheSpy } as unknown as CustomModesManager,
		invalidateCustomModesCache() {
			this.cachedCustomModes = undefined
			//costrict: also clear CustomModesManager's TTL cache to avoid stale data after reinstall
			this.customModesManager.clearCache()
		},
	}
}

describe("ClineProvider.invalidateCustomModesCache", () => {
	it("should clear cachedCustomModes and call customModesManager.clearCache()", () => {
		const clearCacheSpy = vi.fn()
		const host = makeHost(clearCacheSpy)

		expect(host.cachedCustomModes).toBeDefined()

		host.invalidateCustomModesCache()

		expect(host.cachedCustomModes).toBeUndefined()
		expect(clearCacheSpy).toHaveBeenCalledTimes(1)
	})

	it("should be idempotent: calling twice clears cache both times", () => {
		const clearCacheSpy = vi.fn()
		const host = makeHost(clearCacheSpy)

		host.invalidateCustomModesCache()
		host.invalidateCustomModesCache()

		expect(host.cachedCustomModes).toBeUndefined()
		expect(clearCacheSpy).toHaveBeenCalledTimes(2)
	})

	it("should still call clearCache even when cachedCustomModes is already undefined", () => {
		const clearCacheSpy = vi.fn()
		const host = makeHost(clearCacheSpy)
		host.cachedCustomModes = undefined

		expect(() => host.invalidateCustomModesCache()).not.toThrow()
		expect(clearCacheSpy).toHaveBeenCalledTimes(1)
	})
})
