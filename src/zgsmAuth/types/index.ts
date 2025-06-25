export interface LoginState {
	status: LoginStatus
	state?: string
	access_token?: string
}
export interface LoginTokens {
	state: string
	access_token: string
	refresh_token: string
}

export enum LoginStatus {
	LOGGED_OUT = "logged_out",
	LOGGED_IN = "logged_in",
}

export interface LoginStatusResponse {
	code: string | number
	message: string
	success: boolean
	data: LoginState
}

export interface LoginTokenResponse {
	code: string | number
	message: string
	success: boolean
	data: LoginTokens
}
