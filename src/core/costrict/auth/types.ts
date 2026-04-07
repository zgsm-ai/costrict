/**
 * Authentication module type definitions
 */

// import { CloudUserInfo } from "@roo-code/types"

/**
 * Login status interface
 */
export interface CostrictLoginState {
	/** Login status identifier */
	state: string

	status?: CostrictAuthStatus

	/** Machine identifier */
	machineId?: string
}

/**
 * Authentication token interface
 */
export interface CostrictAuthTokens {
	/** Access token */
	access_token: string
	/** Refresh token */
	refresh_token: string
	/** Local state marker */
	state: string
}

/**
 * Authentication status enum
 */
export enum CostrictAuthStatus {
	/** Not logged in */
	NOT_LOGGED_IN = "not_logged_in",
	/** Logging in */
	LOGGING_IN = "logging_in",
	/** Logged in */
	LOGGED_IN = "logged_in",
	/** Login failed */
	LOGIN_FAILED = "login_failed",
	/** Token expired */
	TOKEN_EXPIRED = "token_expired",
}

export interface CostrictLoginResponse {
	success: boolean
	data?: CostrictLoginState
	message?: string
	code?: string
}

export interface LoginTokenResponse {
	success: boolean
	data?: CostrictAuthTokens
	message?: string
	code?: string
}
