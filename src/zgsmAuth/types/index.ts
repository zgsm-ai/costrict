// 登录状态枚举
export enum LoginStatus {
	LOGGED_OUT = "logged_out",
	ACTIVED = "actived",
	EXPIRED = "expired",
	UNKNOWN = "unknown",
}

// 登录状态接口
export interface LoginState {
	status: LoginStatus
	message: string
	state?: string
	access_token?: string
}

// Token接口
export interface TokenResponse {
	access_token: string
	refresh_token: string
}
