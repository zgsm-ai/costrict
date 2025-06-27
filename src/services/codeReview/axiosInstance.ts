/**
 * HTTP client infrastructure for code review service
 *
 * This file provides a configured axios instance with:
 * - Base configuration (URL, timeout, headers)
 * - Response interceptors for 401 authentication error handling
 * - Business logic error detection
 */

import axios, { AxiosInstance, AxiosError, AxiosResponse } from "axios"
import { APIErrorResponse } from "./types"

/**
 * Default configuration for the code review API
 */
const defaultConfig = {
	timeout: 30000, // 30 seconds
}

/**
 * Custom error class for authentication errors
 */
export class AuthError extends Error {
	constructor(message: string = "Authentication failed") {
		super(message)
		this.name = "AuthError"
	}
}

/**
 * Create and configure axios instance for code review API
 */
function createAxiosInstance(): AxiosInstance {
	const instance = axios.create(defaultConfig)

	// Response interceptor for error handling
	instance.interceptors.response.use(
		(response: AxiosResponse) => {
			// Check for business logic errors (code !== 200)
			if (response.data && typeof response.data === "object" && "success" in response.data) {
				const { code, message, success } = response.data
				if (!success) {
					const error = new Error(message || "Business logic error")
					;(error as any).code = code
					;(error as any).data = response.data
					throw error
				}
			}

			return response
		},
		(error: AxiosError) => {
			// Handle 401 authentication errors specifically
			if (error.response?.status === 401) {
				const message = (error.response.data as APIErrorResponse)?.message || "Authentication failed"
				throw new AuthError(message)
			}

			// For all other errors, just pass them through
			throw error
		},
	)

	return instance
}

/**
 * Configured axios instance for code review API
 *
 * Features:
 * - 30-second timeout
 * - 401 authentication error handling
 * - AbortSignal support
 * - Business logic error detection
 *
 * @example
 * ```typescript
 * import { axiosInstance } from './axiosInstance';
 *
 * // Make a request with AbortSignal
 * const controller = new AbortController();
 * const response = await axiosInstance.get('/api/endpoint', {
 *   signal: controller.signal
 * });
 * ```
 */
export const axiosInstance = createAxiosInstance()
