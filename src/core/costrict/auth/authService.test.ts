import { beforeEach, describe, expect, it, vi } from "vitest"

// jwt-decode is NOT mocked: we feed it real (unsigned) JWTs so the
// refresh_token expiry logic in isRefreshTokenValid is exercised for real.
const fakeJwt = (exp: number) => {
	const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url")
	const payload = Buffer.from(JSON.stringify({ iat: 1, exp })).toString("base64url")
	return `${header}.${payload}.sig`
}

const mocks = vi.hoisted(() => ({
	getTokens: vi.fn(),
	readCostrictAccessToken: vi.fn(),
}))

vi.mock("./authStorage", () => ({
	CostrictAuthStorage: {
		getInstance: () => ({ getTokens: mocks.getTokens }),
	},
}))

vi.mock("../runtime-config", () => ({
	readCostrictAccessToken: mocks.readCostrictAccessToken,
}))

vi.mock("./authApi", () => ({
	CostrictAuthApi: { getInstance: () => ({}) },
}))

vi.mock("./authConfig", () => ({
	CostrictAuthConfig: { getInstance: () => ({}) },
}))

vi.mock("./ipc/client", () => ({
	sendCostrictLogout: vi.fn(),
}))

vi.mock("../auto-complete", () => ({
	CompletionStatusBar: { getInstance: () => ({ complete: () => {} }) },
}))

vi.mock("../../../i18n", () => ({
	t: (key: string) => key,
}))

import { CostrictAuthService } from "./authService"

const futureExp = Math.floor(Date.now() / 1000) + 3600
const pastExp = Math.floor(Date.now() / 1000) - 3600
const validRefresh = fakeJwt(futureExp)
const expiredRefresh = fakeJwt(pastExp)

describe("CostrictAuthService.checkLoginStatusOnStartup", () => {
	beforeEach(() => {
		mocks.getTokens.mockReset()
		mocks.readCostrictAccessToken.mockReset()
		CostrictAuthService._resetForTesting()
		CostrictAuthService.setProvider({} as any)
	})

	it("returns true when SecretStorage has both tokens and a valid refresh_token", async () => {
		mocks.getTokens.mockResolvedValue({
			access_token: "access",
			refresh_token: validRefresh,
			state: "s",
		})
		mocks.readCostrictAccessToken.mockReturnValue(null)

		expect(await CostrictAuthService.getInstance().checkLoginStatusOnStartup()).toBe(true)
	})

	it("recovers via auth.json when SecretStorage refresh_token is expired", async () => {
		mocks.getTokens.mockResolvedValue({
			access_token: "access",
			refresh_token: expiredRefresh,
			state: "s",
		})
		mocks.readCostrictAccessToken.mockReturnValue({
			access_token: "access",
			refresh_token: validRefresh,
		})

		expect(await CostrictAuthService.getInstance().checkLoginStatusOnStartup()).toBe(true)
	})

	it("returns auth.json tokens with the local state when auth.json wins", async () => {
		mocks.getTokens.mockResolvedValue({
			access_token: "old-access",
			refresh_token: expiredRefresh,
			state: "local-state",
		})
		mocks.readCostrictAccessToken.mockReturnValue({
			access_token: "file-access",
			refresh_token: validRefresh,
		})

		expect(await CostrictAuthService.getInstance().getStartupAuthTokens()).toEqual({
			source: "file",
			tokens: {
				access_token: "file-access",
				refresh_token: validRefresh,
				state: "local-state",
			},
		})
	})

	it("returns false when SecretStorage has refresh but NO access_token (stuck-state guard)", async () => {
		// Only a refresh_token is not enough: activate.ts cannot build a usable
		// pair from it, so reporting logged-in would leave the user stuck without
		// a re-auth path. Both tokens from the same source are required.
		mocks.getTokens.mockResolvedValue({
			access_token: "",
			refresh_token: validRefresh,
			state: "s",
		})
		mocks.readCostrictAccessToken.mockReturnValue(null)

		expect(await CostrictAuthService.getInstance().checkLoginStatusOnStartup()).toBe(false)
	})

	it("returns false when auth.json has refresh but NO access_token and SecretStorage is unusable", async () => {
		mocks.getTokens.mockResolvedValue(null)
		mocks.readCostrictAccessToken.mockReturnValue({
			access_token: "",
			refresh_token: validRefresh,
		})

		expect(await CostrictAuthService.getInstance().checkLoginStatusOnStartup()).toBe(false)
	})

	it("returns false when auth.json is valid but no local state is available", async () => {
		mocks.getTokens.mockResolvedValue(null)
		mocks.readCostrictAccessToken.mockReturnValue({
			access_token: "access",
			refresh_token: validRefresh,
		})

		expect(await CostrictAuthService.getInstance().checkLoginStatusOnStartup()).toBe(false)
	})

	it("returns false when neither source has a usable token pair", async () => {
		mocks.getTokens.mockResolvedValue(null)
		mocks.readCostrictAccessToken.mockReturnValue(null)

		expect(await CostrictAuthService.getInstance().checkLoginStatusOnStartup()).toBe(false)
	})

	it("returns false when both refresh_tokens are expired", async () => {
		mocks.getTokens.mockResolvedValue({
			access_token: "access",
			refresh_token: expiredRefresh,
			state: "s",
		})
		mocks.readCostrictAccessToken.mockReturnValue({
			access_token: "access",
			refresh_token: expiredRefresh,
		})

		expect(await CostrictAuthService.getInstance().checkLoginStatusOnStartup()).toBe(false)
	})
})
