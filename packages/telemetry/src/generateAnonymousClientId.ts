import crypto from "crypto"

/**
 * Generate a cryptographically random anonymous client ID for telemetry.
 * This function is platform-agnostic and has no external dependencies,
 * making it safe to use from shared packages like @roo-code/telemetry.
 */
export function generateAnonymousClientId(): string {
	return crypto.randomUUID()
}
