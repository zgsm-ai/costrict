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

vi.mock("../runtime-config", () => ({
	ensureCompletionRuntimeReady: vi.fn().mockResolvedValue(undefined),
	writeCostrictRuntimeAuth: vi.fn().mockResolvedValue(undefined),
	ensureCostrictRuntimeInstalled: vi.fn().mockResolvedValue("noUpdate"),
	getRuntimeBinaryPath: vi.fn(() => "/tmp/home/.costrict/bin/costrict"),
	getRuntimeProcessName: vi.fn(() => "costrict"),
}))

import { CostrictAuthStorage } from "./authStorage"
import { ensureCompletionRuntimeReady, writeCostrictRuntimeAuth } from "../runtime-config"

type MockProviderState = {
	currentApiConfigName: string
	apiConfiguration: {
		apiProvider: string
		costrictAccessToken: string
		costrictRefreshToken: string
		costrictState: string
	}
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
			log: vi.fn(),
		}

		CostrictAuthStorage.setProvider(mockProvider)
	})

	it("persists shared runtime auth after saving tokens", async () => {
		await CostrictAuthStorage.getInstance().saveTokens(newTokens as any)

		expect(writeCostrictRuntimeAuth).toHaveBeenCalledWith(newTokens.access_token, newTokens.refresh_token)
		expect(ensureCompletionRuntimeReady).toHaveBeenCalledTimes(1)
	})

	it("persists shared runtime auth regardless of legacy codebase toggle state", async () => {
		mockProvider.getState.mockResolvedValue(buildState())

		await CostrictAuthStorage.getInstance().saveTokens(newTokens as any)

		expect(writeCostrictRuntimeAuth).toHaveBeenCalledWith(newTokens.access_token, newTokens.refresh_token)
		expect(ensureCompletionRuntimeReady).toHaveBeenCalledTimes(1)
	})

	it("still persists when only the access_token changed (refresh unchanged)", async () => {
		// refresh_token is identical to the stored value. The dedup guard must
		// only no-op when BOTH tokens match, otherwise a rotated access_token
		// would be silently dropped.
		const rotatedAccess = {
			access_token: "new-access-token",
			refresh_token: "old-refresh-token",
			state: "new-state",
		}

		await CostrictAuthStorage.getInstance().saveTokens(rotatedAccess as any)

		expect(writeCostrictRuntimeAuth).toHaveBeenCalledWith(rotatedAccess.access_token, rotatedAccess.refresh_token)
		expect(ensureCompletionRuntimeReady).toHaveBeenCalledTimes(1)
	})

	it("is a no-op when both access and refresh tokens match the stored values", async () => {
		const sameTokens = {
			access_token: "old-access-token",
			refresh_token: "old-refresh-token",
			state: "old-state",
		}

		await CostrictAuthStorage.getInstance().saveTokens(sameTokens as any)

		expect(writeCostrictRuntimeAuth).not.toHaveBeenCalled()
		expect(ensureCompletionRuntimeReady).not.toHaveBeenCalled()
	})
})
