export enum LoginStatus {
	LOGGED_OUT = "logged_out",
	LOGGED_IN = "logged_in",
}

export interface LoginState {
	status: LoginStatus
	message: string
	state?: string
	access_token?: string
}

export interface TokenResponse {
	access_token: string
	refresh_token: string
	state: string
}
