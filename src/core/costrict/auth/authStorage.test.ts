import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("jwt-decode", () => ({
	jwtDecode: vi.fn(() => ({
		exp: 2_000_000_000,
		iat: 1_000_000_000,
	})),
}))

vi.mock("./ipc/client", () => ({
	sendCostrictTokens: vi.fn(),
}))

vi.mock("../utils", () => ({
	writeCostrictAccessToken: vi.fn().mockResolvedValue(undefined),
}))

import { CostrictAuthStorage } from "./authStorage"
import { writeCostrictAccessToken } from "../utils"

type MockProviderState = {
	currentApiConfigName: string
	apiConfiguration: {
		apiProvider: string
		costrictAccessToken: string
		costrictRefreshToken: string
		costrictState: string
	}
}

const flushAsyncWork = async () => {
	await Promise.resolve()
	await Promise.resolve()
}

describe("CostrictAuthStorage.saveTokens", () => {
	let mockProvider: any

	const newTokens = {
		access_token: "new-access-token",
		refresh_token: "new-refresh-token",
		state: "new-state",
	}

	const buildState = (): MockProviderState => ({
		currentApiConfigName: "costrict-profile",
		apiConfiguration: {
			apiProvider: "costrict",
			costrictAccessToken: "old-access-token",
			costrictRefreshToken: "old-refresh-token",
			costrictState: "old-state",
		},
	})

	beforeEach(() => {
		vi.clearAllMocks()
		;(CostrictAuthStorage as any).instance = undefined

		mockProvider = {
			getState: vi.fn().mockResolvedValue(buildState()),
			providerSettingsManager: {
				saveMergeConfig: vi.fn().mockResolvedValue(undefined),
			},
			setValue: vi.fn(),
			upsertProviderProfile: vi.fn().mockResolvedValue(undefined),
		}

		CostrictAuthStorage.setProvider(mockProvider)
	})

	it("persists auth token when saving tokens", async () => {
		await CostrictAuthStorage.getInstance().saveTokens(newTokens as any)
		await flushAsyncWork()

		expect(writeCostrictAccessToken).toHaveBeenCalledWith(newTokens.access_token, newTokens.refresh_token)
	})
})
