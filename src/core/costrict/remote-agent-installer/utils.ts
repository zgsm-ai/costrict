import { URL } from "url"

/**
 * Shared utilities for the remote resource installer module.
 */

export function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 /**
  * Get the check interval in milliseconds.
  *
  * Reads from the environment variable `COSTRICT_AGENT_CHECK_INTERVAL_MINUTES`.
  * - Minimum: 1 minute (to prevent accidental abuse)
  * - Default: 60 minutes (1 hour)
  */
export function getCheckIntervalMs(): number {
	const DEFAULT_MINUTES = 24 * 60 // 24 hours
	const MIN_MINUTES = 1
	const raw = process.env.COSTRICT_AGENT_CHECK_INTERVAL_MINUTES
	if (raw !== undefined && raw !== "") {
		const parsed = parseInt(raw, 10)
		if (!isNaN(parsed) && parsed >= MIN_MINUTES) {
			return parsed * 60 * 1000
		}
	}
	return DEFAULT_MINUTES * 60 * 1000
}

export function redactUrl(raw: string): string {
	try {
		const u = new URL(raw)
		const sensitive = ["token", "auth", "key", "signature"]
		sensitive.forEach((key) => {
			if (u.searchParams.has(key)) {
				u.searchParams.set(key, "<redacted>")
			}
		})
		return u.toString()
	} catch {
		return raw
	}
}
