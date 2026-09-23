import { randomUUID } from "crypto"

/**
 * Random identifiers (design §2). Values are random tokens — never path
 * hashes, never user-derived. `noSlash` tokens additionally reject path
 * separators so they stay safe in filenames and closed vocabularies.
 */
const TOKEN = /^[a-z0-9][a-z0-9-]*$/

export const uuid = (): string => randomUUID()

export const randomId = (prefix: string, bytes = 6): string => {
	const hex = Array.from({ length: bytes }, () =>
		Math.floor(Math.random() * 256)
			.toString(16)
			.padStart(2, "0"),
	).join("")
	return `${prefix}-${hex}`
}

export const isToken = (value: string): boolean => TOKEN.test(value) && value.length <= 64

/** Persistent key-value store (globalState adapter) for device-id / scope-id. */
export interface IdStore {
	get(key: string): string | undefined
	set(key: string, value: string): void
}

const DEVICE_KEY = "costrict.stability.deviceId"
const SCOPE_KEY = "costrict.stability.scopeId"

const stored = (store: IdStore, key: string, prefix: string): string => {
	const existing = store.get(key)
	if (existing && isToken(existing)) return existing
	const created = randomId(prefix)
	store.set(key, created)
	return created
}

/** Random install identity; persistence depends on globalState surviving. */
export const deviceId = (store: IdStore): string => stored(store, DEVICE_KEY, "device")

/** Per-installation scope identity shared across restarts (predecessor discovery). */
export const scopeId = (store: IdStore): string => stored(store, SCOPE_KEY, "scope")
