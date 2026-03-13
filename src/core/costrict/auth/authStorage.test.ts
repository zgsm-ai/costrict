import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("jwt-decode", () => ({
	jwtDecode: vi.fn(() => ({
		exp: 2_000_000_000,
		iat: 1_000_000_000,
	})),
}))

vi.mock("./ipc/client", () => ({
	sendZgsmTokens: vi.fn(),
}))

vi.mock("../codebase-index", () => ({
	zgsmCodebaseIndexManager: {
		ensureInitialized: vi.fn().mockResolvedValue(undefined),
		syncToken: vi.fn().mockResolvedValue({ success: true, data: 1, message: "ok" }),
	},
}))

vi.mock("../codebase-index/workspace-event-monitor", () => ({
	workspaceEventMonitor: {
		initialize: vi.fn().mockResolvedValue(undefined),
	},
}))

vi.mock("../codebase-index/utils", () => ({
	writeCostrictAccessToken: vi.fn().mockResolvedValue(undefined),
}))

import { ZgsmAuthStorage } from "./authStorage"
import { zgsmCodebaseIndexManager } from "../codebase-index"
import { workspaceEventMonitor } from "../codebase-index/workspace-event-monitor"
import { writeCostrictAccessToken } from "../codebase-index/utils"

type MockProviderState = {
	currentApiConfigName: string
	apiConfiguration: {
		apiProvider: string
		zgsmCodebaseIndexEnabled: boolean
		zgsmAccessToken: string
		zgsmRefreshToken: string
		zgsmState: string
	}
}

const flushAsyncWork = async () => {
	await Promise.resolve()
	await Promise.resolve()
}

describe("ZgsmAuthStorage.saveTokens", () => {
	let mockProvider: any

	const newTokens = {
		access_token: "new-access-token",
		refresh_token: "new-refresh-token",
		state: "new-state",
	}

	const buildState = (enabled: boolean): MockProviderState => ({
		currentApiConfigName: "zgsm-profile",
		apiConfiguration: {
			apiProvider: "zgsm",
			zgsmCodebaseIndexEnabled: enabled,
			zgsmAccessToken: "old-access-token",
			zgsmRefreshToken: "old-refresh-token",
			zgsmState: "old-state",
		},
	})

	beforeEach(() => {
		vi.clearAllMocks()
		;(ZgsmAuthStorage as any).instance = undefined

		mockProvider = {
			getState: vi.fn().mockResolvedValue(buildState(false)),
			providerSettingsManager: {
				saveMergeConfig: vi.fn().mockResolvedValue(undefined),
			},
			setValue: vi.fn(),
			upsertProviderProfile: vi.fn().mockResolvedValue(undefined),
		}

		ZgsmAuthStorage.setProvider(mockProvider)
	})

	it("initializes and syncs the client even when workspace indexing is disabled", async () => {
		await ZgsmAuthStorage.getInstance().saveTokens(newTokens as any)
		await flushAsyncWork()

		expect(writeCostrictAccessToken).toHaveBeenCalledWith(newTokens.access_token, newTokens.refresh_token)
		expect(zgsmCodebaseIndexManager.ensureInitialized).toHaveBeenCalledWith("saveTokens")
		expect(zgsmCodebaseIndexManager.syncToken).toHaveBeenCalledTimes(1)
		expect(workspaceEventMonitor.initialize).not.toHaveBeenCalled()
	})

	it("keeps the workspace monitor gated by the workspace toggle", async () => {
		mockProvider.getState.mockResolvedValue(buildState(true))

		await ZgsmAuthStorage.getInstance().saveTokens(newTokens as any)
		await flushAsyncWork()

		expect(zgsmCodebaseIndexManager.ensureInitialized).toHaveBeenCalledWith("saveTokens")
		expect(zgsmCodebaseIndexManager.syncToken).toHaveBeenCalledTimes(1)
		expect(workspaceEventMonitor.initialize).toHaveBeenCalledTimes(1)
	})
})
